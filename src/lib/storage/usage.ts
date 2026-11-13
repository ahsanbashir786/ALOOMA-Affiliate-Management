import "server-only";
import { readdir, lstat, statfs } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";

export type Backup = { name: string; bytes: number; at: string };
export type StorageUsage = {
  disk: { total: number; used: number; free: number; /** Held back by the system for itself (about 5% on a normal Linux disk). */ reserved: number };
  database: { bytes: number; tables: { name: string; bytes: number; rows: number }[] };
  backups: { bytes: number; count: number; latest: Backup[]; folder: string; visible: boolean };
  app: { bytes: number | null };
  /** Everything on the disk that is not ours: the system, Docker images, logs. */
  other: number;
};

/** Total size of a folder, counted file by file. Stops after `cap` files (a huge folder is not worth the wait). */
export async function dirSize(dir: string, cap = 150_000): Promise<number> {
  let total = 0, seen = 0;
  const walk = async (d: string): Promise<void> => {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (seen++ > cap) return;
      const p = path.join(d, e.name);
      try {
        if (e.isDirectory()) await walk(p);
        else if (e.isFile()) total += (await lstat(p)).size;
      } catch { /* a file that disappeared while counting */ }
    }
  };
  await walk(dir);
  return total;
}

/** The disk the software runs on: total, used and free, like the `df` command shows. */
export async function diskUsage(at = process.cwd()): Promise<StorageUsage["disk"]> {
  const s = await statfs(at);
  const total = Number(s.blocks) * Number(s.bsize);
  const free = Number(s.bavail) * Number(s.bsize);
  const used = total - Number(s.bfree) * Number(s.bsize);
  return { total, used, free, reserved: Math.max(0, total - used - free) };
}

export async function backupFolder(dir: string): Promise<StorageUsage["backups"]> {
  let names: string[] = [];
  let visible = true;
  try { names = (await readdir(dir)).filter((n) => /\.dump$/i.test(n)); } catch { visible = false; }
  const files: Backup[] = [];
  for (const name of names) {
    try { const st = await lstat(path.join(dir, name)); files.push({ name, bytes: st.size, at: st.mtime.toISOString() }); } catch { /* gone */ }
  }
  files.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { bytes: files.reduce((s, f) => s + f.bytes, 0), count: files.length, latest: files.slice(0, 6), folder: dir, visible };
}

let memo: { at: number; value: StorageUsage } | null = null;

/** How full the server disk is, and how much of it this software uses. Cached for a minute (counting files is not free). */
export async function getStorage(): Promise<StorageUsage> {
  if (memo && Date.now() - memo.at < 60_000) return memo.value;
  const folder = process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), "backups");
  const [disk, db, tables, backups, app] = await Promise.all([
    diskUsage(),
    rows<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`),
    rows<{ name: string; bytes: string; n: string }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid)::text as bytes, greatest(c.reltuples, 0)::bigint::text as n
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where c.relkind = 'r' and s.nspname = 'public' order by pg_total_relation_size(c.oid) desc limit 12`),
    backupFolder(folder),
    // On a developer's computer the project folder holds thousands of packages; only the server's program files are counted.
    process.env.NODE_ENV === "production" ? dirSize(process.cwd()) : Promise.resolve(null),
  ]);
  const dbBytes = Number(db[0]?.bytes ?? 0);
  const ours = dbBytes + backups.bytes + (app ?? 0);
  const value: StorageUsage = {
    disk,
    database: { bytes: dbBytes, tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.n) })) },
    backups, app: { bytes: app },
    other: Math.max(0, disk.used - ours),
  };
  memo = { at: Date.now(), value };
  return value;
}

/** 1.4 GB, 380 MB, 12 KB. */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
