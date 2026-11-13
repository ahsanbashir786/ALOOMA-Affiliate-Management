// Storage page numbers. Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-storage.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql as pg } from "../src/db";
import { backupFolder, diskUsage, dirSize, fmtBytes, getStorage } from "../src/lib/storage/usage";
import { accumulateNet, cpuBusyPct, getServerStats, parseMeminfo } from "../src/lib/storage/server";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  check("bytes: readable sizes", fmtBytes(0) === "0 B" && fmtBytes(1023) === "1023 B" && fmtBytes(1536) === "1.5 KB" && fmtBytes(5 * 1024 ** 2) === "5.0 MB" && fmtBytes(270553174016) === "252 GB" && fmtBytes(-1) === "–");

  const root = mkdtempSync(path.join(tmpdir(), "storage-"));
  mkdirSync(path.join(root, "a", "b"), { recursive: true });
  writeFileSync(path.join(root, "one.bin"), Buffer.alloc(1000));
  writeFileSync(path.join(root, "a", "two.bin"), Buffer.alloc(2000));
  writeFileSync(path.join(root, "a", "b", "three.bin"), Buffer.alloc(3000));
  check("folder size: every file in every sub-folder is counted", (await dirSize(root)) === 6000);
  check("folder size: a missing folder is 0, not an error", (await dirSize(path.join(root, "nope"))) === 0);
  check("folder size: a huge folder stops at the cap instead of running forever", (await dirSize(root, 2)) < 6000);

  const bdir = path.join(root, "backups"); mkdirSync(bdir);
  writeFileSync(path.join(bdir, "affiliate-20261110-033000.dump"), Buffer.alloc(500));
  writeFileSync(path.join(bdir, "affiliate-20261111-033000.dump"), Buffer.alloc(700));
  writeFileSync(path.join(bdir, "backup.log"), "x");
  utimesSync(path.join(bdir, "affiliate-20261110-033000.dump"), new Date("2026-11-10T03:30:00Z"), new Date("2026-11-10T03:30:00Z"));
  utimesSync(path.join(bdir, "affiliate-20261111-033000.dump"), new Date("2026-11-11T03:30:00Z"), new Date("2026-11-11T03:30:00Z"));
  const bk = await backupFolder(bdir);
  check("backups: only .dump files, newest first, with sizes", bk.count === 2 && bk.bytes === 1200 && bk.latest[0].name === "affiliate-20261111-033000.dump" && bk.latest[0].bytes === 700 && bk.visible);
  const nobk = await backupFolder(path.join(root, "missing"));
  check("backups: a folder the app cannot see is reported, not an error", !nobk.visible && nobk.count === 0 && nobk.bytes === 0);

  const d = await diskUsage();
  check("disk: total, used, free and reserved always add up to the total", d.total > 0 && d.used > 0 && d.free >= 0 && d.reserved >= 0 && Math.abs(d.used + d.free + d.reserved - d.total) <= 1, JSON.stringify(d));

  process.env.BACKUP_DIR = bdir;
  const s = await getStorage();
  check("storage: the database size and its biggest tables are read", s.database.bytes > 0 && s.database.tables.length > 3 && s.database.tables.every((t) => t.bytes > 0) && s.database.tables[0].bytes >= s.database.tables[1].bytes, JSON.stringify(s.database.tables.slice(0, 2)));
  check("storage: the backup folder from BACKUP_DIR is used", s.backups.count === 2 && s.backups.bytes === 1200);
  check("storage: everything else is the rest of the disk (never negative)", s.other >= 0 && s.other <= s.disk.used);
  check("storage: program files are not counted off the server", s.app.bytes === null);
  // memory, processor, traffic
  const mi = parseMeminfo("MemTotal:        4046324 kB\nMemFree:          200000 kB\nMemAvailable:    2046324 kB\nBuffers: 1 kB\n");
  check("memory: total and available are read from /proc/meminfo (in bytes)", mi?.total === 4046324 * 1024 && mi?.available === 2046324 * 1024);
  check("memory: a file without MemAvailable falls back to MemFree, nonsense gives nothing", parseMeminfo("MemTotal: 100 kB\nMemFree: 40 kB\n")?.available === 40 * 1024 && parseMeminfo("nothing") === null);
  const c1 = "cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1", c2 = "cpu  200 0 200 1000 0 0 0 0 0 0\ncpu0 2 2 2 2";
  check("processor: busy share between two readings (200 busy of 400 = 50%)", Math.abs((cpuBusyPct(c1, c2) ?? -1) - 50) < 0.01);
  check("processor: no time passed or unreadable gives nothing", cpuBusyPct(c1, c1) === null && cpuBusyPct("x", c2) === null);
  let n = accumulateNet(null, { rx: 1000, tx: 500 }, "2026-11");
  check("traffic: the first reading starts at 0 (nothing earlier is known)", n.rx === 0 && n.tx === 0);
  n = accumulateNet(n, { rx: 1600, tx: 900 }, "2026-11");
  check("traffic: later readings add what moved (600 in, 400 out)", n.rx === 600 && n.tx === 400);
  n = accumulateNet(n, { rx: 100, tx: 50 }, "2026-11");
  check("traffic: counters that start again after a restart add what they show (700 in, 450 out)", n.rx === 700 && n.tx === 450);
  n = accumulateNet(n, { rx: 300, tx: 150 }, "2026-12");
  check("traffic: a new month starts a new total", n.month === "2026-12" && n.rx === 0 && n.tx === 0);
  const st = await getServerStats();
  check("server: memory, cores, load and uptime are read", st.memory.total > 0 && st.memory.used > 0 && st.memory.used <= st.memory.total && st.cpu.cores >= 1 && st.uptimeSec > 0 && st.memory.appRss > 0, JSON.stringify(st.memory));
  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
