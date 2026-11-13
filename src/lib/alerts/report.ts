import "server-only";
import os from "node:os";
import { sql as pg } from "@/db";
import { tiktokConfig, connectionInfo } from "@/lib/tiktok/client";
import { adsConfig, adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { shopeeConfig, shopeeConnectionInfo } from "@/lib/shopee/client";
import { diskUsage, fmtBytes } from "@/lib/storage/usage";
import { getServerStats } from "@/lib/storage/server";
import { listAlerts } from "./queries";
import { readSamples } from "./sampler";

const day = (d: unknown) => (d ? new Date(d as Date).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never");
const yes = (b: boolean) => (b ? "yes" : "no");

/** One block of text for the developer: what is connected, what failed, how the server is, the latest errors. Never contains a key, a password or customer data. */
export async function buildReport(): Promise<string> {
  const [tt, ads, shopee, alerts, st, disk] = await Promise.all([connectionInfo(), adsConnectionInfo(), shopeeConnectionInfo(), listAlerts(), getServerStats(), diskUsage().catch(() => null)]);
  const sc = shopeeConfig();
  const [ttState, adsState, ttRuns, errors, version] = await Promise.all([
    pg`select dataset, last_success_at, last_error, records from tt_sync_state where dataset <> '_all' order by dataset`,
    pg`select dataset, last_success_at, last_error, records from ads_sync_state where dataset <> '_all' order by dataset`,
    pg`select dataset, status, started_at, finished_at, error from tt_sync_runs where dataset = '_all' order by started_at desc limit 3`,
    pg`select at, source, route, message, left(stack, 900) as stack from app_error_log order by at desc limit 10`,
    pg`select count(*)::int as n from schema_migrations`.catch(() => [{ n: -1 }]),
  ]);
  const L: string[] = [];
  L.push("ALOOMA SYSTEM REPORT", `Made: ${day(new Date())}`, `Node ${process.version} · ${os.platform()} · migrations applied: ${version[0]?.n}`, `Address: ${process.env.NODE_ENV}`, "");
  L.push("CONNECTIONS");
  L.push(`TikTok Shop: keys set ${yes(!!tiktokConfig())}, connected ${yes(tt.connected)}${tt.connected ? `, shop ${tt.shopName ?? "?"}, scopes ${tt.scopes.length}` : ""}`);
  L.push(`TikTok Ads: keys set ${yes(!!adsConfig())}, connected ${yes(ads.connected)}${ads.connected ? `, ad accounts ${ads.advertiserIds.length}` : ""}`);
  L.push(`Shopee: keys set ${yes(!!sc)}, environment ${sc?.env ?? "-"}, connected ${yes(shopee.connected)}${shopee.connected ? `, shop ${shopee.shopIds[0] ?? "?"}, login valid until ${shopee.refreshExpiresAt ? day(new Date(shopee.refreshExpiresAt * 1000)) : "?"}` : ""}`, "");
  L.push("DATA SYNC (TikTok Shop)");
  for (const r of ttState) L.push(`- ${r.dataset}: ${Number(r.records).toLocaleString("en-MY")} records, last good ${day(r.last_success_at)}${r.last_error ? `, ERROR: ${String(r.last_error).slice(0, 300)}` : ""}`);
  L.push("Recent full syncs: " + (ttRuns.map((r) => `${day(r.started_at)} ${r.status}${r.error ? ` (${String(r.error).slice(0, 80)})` : ""}`).join(" | ") || "none"), "");
  L.push("DATA SYNC (TikTok Ads)");
  for (const r of adsState) L.push(`- ${r.dataset}: ${Number(r.records).toLocaleString("en-MY")} records, last good ${day(r.last_success_at)}${r.last_error ? `, ERROR: ${String(r.last_error).slice(0, 300)}` : ""}`);
  L.push("", "SERVER");
  L.push(`Memory ${fmtBytes(st.memory.used)} of ${fmtBytes(st.memory.total)} · app uses ${fmtBytes(st.memory.appRss)}`);
  L.push(`Processor: ${st.cpu.cores} core(s), busy ${st.cpu.busyPct == null ? "?" : Math.round(st.cpu.busyPct) + "%"}, load ${st.cpu.load.map((n) => n.toFixed(2)).join(" / ")}`);
  if (disk) L.push(`Disk ${fmtBytes(disk.used)} of ${fmtBytes(disk.total)} (${Math.round((disk.used / disk.total) * 100)}%)`);
  L.push(`Running for ${Math.round(st.uptimeSec / 3600)} h · recent readings: ${readSamples().slice(-5).map((s) => `${s.cpu == null ? "?" : Math.round(s.cpu)}%/${Math.round(s.lagMs)}ms`).join(", ") || "none yet"}`, "");
  L.push(`OPEN ALERTS (${alerts.open.length})`);
  for (const a of alerts.open) L.push(`- [${a.severity}] ${a.title}${a.detail ? ` — ${a.detail}` : ""} (since ${day(a.firstSeen)}, seen ${a.count}x${a.status === "seen" ? ", acknowledged" : ""})`);
  L.push("", "LATEST APP ERRORS");
  for (const e of errors) L.push(`- ${day(e.at)} [${e.source}] ${e.route ?? ""}: ${e.message}${e.stack ? `\n    ${String(e.stack).replace(/\n/g, "\n    ")}` : ""}`);
  if (!errors.length) L.push("- none in the last 7 days");
  return L.join("\n");
}
