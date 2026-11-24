import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { refreshPlanAfterSync } from "@/lib/execution/refresh";
import { ensureAffLines } from "@/lib/creators/aff-lines";
import { connectionInfo, tiktokConfig } from "./client";
import { adsConfig, adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { adsSchedulerDue, clearAdsInterrupted, getAdsSyncSettings, runAdsAll, type AdsDeps } from "@/lib/tiktok-ads/sync";
import { clearShopeeInterrupted, shopeeSchedulerTick } from "@/lib/shopee/sync";
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

let adsBusy = false;

/** The same check for TikTok Ads (GMV Max): if it is connected and the interval has passed since the last cycle started, run every ads dataset. */
export async function adsSchedulerTick(deps: AdsDeps = {}, nowMs = Date.now()): Promise<"ran" | "idle" | "off"> {
  if (adsBusy) return "idle";
  const cfg = deps.cfg === undefined ? adsConfig() : deps.cfg;
  if (!cfg) return "off";
  if (!(await getAdsSyncSettings()).enabled || !(await adsConnectionInfo()).connected) return "off";
  if (!(await adsSchedulerDue(nowMs))) return "idle";
  adsBusy = true;
  try { await runAdsAll("schedule", null, deps); } finally { adsBusy = false; }
  return "ran";
}

/** Starts the once-a-minute check inside the running server (one per process). */
export function startScheduler() {
  const g = globalThis as unknown as { __ttScheduler?: boolean };
  if (g.__ttScheduler) return;
  g.__ttScheduler = true;
  // After a sync: prepare the order lines for the screens once (so no visitor waits for it), then refresh the plan.
  const tick = () => { schedulerTick().then(async (r) => { if (r === "ran") { await ensureAffLines().catch(() => {}); await refreshPlanAfterSync(); } }).catch(() => {}); };
  // A restart kills any sync in progress; clear its "running" marks first so the screen never waits for work that no longer exists.
  clearInterrupted().catch(() => {});
  clearAdsInterrupted().catch(() => {});
  clearShopeeInterrupted().catch(() => {});
  const adsTick = () => { adsSchedulerTick().catch(() => {}); };
  // Shopee: orders and payments every 30 minutes once it is connected.
  const shopeeTick = () => { shopeeSchedulerTick().catch(() => {}); };
  setTimeout(shopeeTick, 50_000);
  setInterval(shopeeTick, 5 * 60_000).unref?.();
  setTimeout(tick, 20_000);
  setTimeout(adsTick, 35_000);
  setInterval(tick, 60_000).unref?.();
  setInterval(adsTick, 60_000).unref?.();
}
