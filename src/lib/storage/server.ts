import "server-only";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { dayKL } from "@/lib/time";

export type Memory = { total: number; used: number; available: number; appRss: number };
export type Cpu = { cores: number; busyPct: number | null; load: [number, number, number] };
export type NetMonth = { month: string; rx: number; tx: number; since: string };
export type ServerStats = { memory: Memory; cpu: Cpu; uptimeSec: number; network: NetMonth | null };

/** /proc/meminfo → bytes. "Available" is what programs could still use, which is what a person means by "free memory". */
export function parseMeminfo(text: string): { total: number; available: number } | null {
  const get = (k: string) => { const m = new RegExp(`^${k}:\\s+(\\d+)\\s*kB`, "m").exec(text); return m ? Number(m[1]) * 1024 : null; };
  const total = get("MemTotal"), available = get("MemAvailable") ?? get("MemFree");
  return total != null && available != null ? { total, available } : null;
}

/** Two readings of the first line of /proc/stat → how busy all CPUs were between them (0 to 100). */
export function cpuBusyPct(a: string, b: string): number | null {
  const nums = (t: string) => { const l = t.split("\n")[0]; const p = l.trim().split(/\s+/).slice(1).map(Number); return l.startsWith("cpu") && p.length >= 4 && p.every(Number.isFinite) ? p : null; };
  const x = nums(a), y = nums(b);
  if (!x || !y) return null;
  const idle = (p: number[]) => p[3] + (p[4] ?? 0); // idle + iowait
  const total = (p: number[]) => p.slice(0, 8).reduce((s, v) => s + v, 0);
  const dt = total(y) - total(x);
  if (dt <= 0) return null;
  return Math.max(0, Math.min(100, ((dt - (idle(y) - idle(x))) / dt) * 100));
}

/**
 * Adds what the network counters moved since the last reading to this month's total. The counters start again from 0 when the app restarts,
 * and a new month starts a new total.
 */
export function accumulateNet(prev: (NetMonth & { lastRx: number; lastTx: number }) | null, cur: { rx: number; tx: number }, month: string, now = new Date().toISOString()): NetMonth & { lastRx: number; lastTx: number } {
  const base = prev && prev.month === month ? prev : { month, rx: 0, tx: 0, since: now, lastRx: cur.rx, lastTx: cur.tx };
  const dRx = prev ? (cur.rx >= prev.lastRx ? cur.rx - prev.lastRx : cur.rx) : 0;
  const dTx = prev ? (cur.tx >= prev.lastTx ? cur.tx - prev.lastTx : cur.tx) : 0;
  return { ...base, rx: base.rx + (prev && prev.month === month ? dRx : 0), tx: base.tx + (prev && prev.month === month ? dTx : 0), lastRx: cur.rx, lastTx: cur.tx };
}

async function readNet(): Promise<{ rx: number; tx: number } | null> {
  try {
    let rx = 0, tx = 0, any = false;
    for (const name of await readdir("/sys/class/net")) {
      if (name === "lo") continue;
      try {
        rx += Number((await readFile(`/sys/class/net/${name}/statistics/rx_bytes`, "utf8")).trim());
        tx += Number((await readFile(`/sys/class/net/${name}/statistics/tx_bytes`, "utf8")).trim());
        any = true;
      } catch { /* an interface without counters */ }
    }
    return any ? { rx, tx } : null;
  } catch { return null; }
}

const KEY = "network_usage";
type Stored = NetMonth & { lastRx: number; lastTx: number };

/** Reads the network counters and adds the change to this month's total. Called every few minutes and whenever the Storage page opens. */
export async function sampleNetwork(): Promise<NetMonth | null> {
  const cur = await readNet();
  if (!cur) return null;
  const [r] = await db.select().from(settings).where(eq(settings.key, KEY));
  const next = accumulateNet((r?.value as Stored | undefined) ?? null, cur, dayKL(Date.now()).slice(0, 7));
  await db.insert(settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
  return { month: next.month, rx: next.rx, tx: next.tx, since: next.since };
}

export async function getServerStats(): Promise<ServerStats> {
  let mem = null as ReturnType<typeof parseMeminfo>;
  try { mem = parseMeminfo(await readFile("/proc/meminfo", "utf8")); } catch { /* not Linux */ }
  const total = mem?.total ?? os.totalmem(), available = mem?.available ?? os.freemem();
  let busy: number | null = null;
  try {
    const a = await readFile("/proc/stat", "utf8");
    await new Promise((r) => setTimeout(r, 400));
    busy = cpuBusyPct(a, await readFile("/proc/stat", "utf8"));
  } catch { /* not Linux */ }
  const l = os.loadavg();
  return {
    memory: { total, available, used: Math.max(0, total - available), appRss: process.memoryUsage().rss },
    cpu: { cores: os.cpus().length || 1, busyPct: busy, load: [l[0], l[1], l[2]] },
    uptimeSec: os.uptime(),
    network: await sampleNetwork(),
  };
}
