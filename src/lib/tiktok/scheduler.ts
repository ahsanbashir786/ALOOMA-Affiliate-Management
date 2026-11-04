import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { connectionInfo, tiktokConfig } from "./client";
import { CYCLE, clearInterrupted, getSyncSettings, isDue, runAll, type SyncDeps } from "./sync";

let busy = false;

/** One check: if TikTok is connected and the interval has passed since the last cycle started, run every dataset. Safe to call often. */
export async function schedulerTick(deps: SyncDeps = {}, nowMs = Date.now()): Promise<"ran" | "idle" | "off"> {
  if (busy) return "idle";
  const cfg = deps.cfg === undefined ? tiktokConfig() : deps.cfg;
  if (!cfg) return "off";
  const s = await getSyncSettings();
  if (!s.enabled || !(await connectionInfo()).connected) return "off";
  const [last] = await rows<{ t: Date | null }>(sql`select max(started_at) as t from tt_sync_runs where dataset = ${CYCLE}`);
  if (!isDue(nowMs, last?.t ? new Date(last.t).getTime() : null, s)) return "idle";
  busy = true;
  try { await runAll("schedule", null, deps); } finally { busy = false; }
  return "ran";
}

/** Starts the once-a-minute check inside the running server (one per process). */
export function startScheduler() {
  const g = globalThis as unknown as { __ttScheduler?: boolean };
  if (g.__ttScheduler) return;
  g.__ttScheduler = true;
  const tick = () => { schedulerTick().catch(() => {}); };
  // A restart kills any sync in progress; clear its "running" marks first so the screen never waits for work that no longer exists.
  clearInterrupted().catch(() => {});
  setTimeout(tick, 20_000);
  setInterval(tick, 60_000).unref?.();
}
