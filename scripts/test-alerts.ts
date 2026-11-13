// System Alerts: the rules, saving them, and the diagnostic report.
// Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-alerts.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { sql as pg } from "../src/db";
import { connectionCandidates, errorCandidates, errorSignature, isAuthError, serverCandidates, syncCandidates, type ConnectionInput, type SyncSource } from "../src/lib/alerts/checks";
import { recordError } from "../src/lib/alerts/record";
import { syncAlerts } from "../src/lib/alerts/evaluate";
import { alertSummary, listAlerts, setAlertStatus } from "../src/lib/alerts/queries";
import { buildReport } from "../src/lib/alerts/report";
import { getRetentionDays, setRetentionDays } from "../src/lib/alerts/retention";
import { onRequestError } from "../src/instrumentation";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };
const keys = (c: { key: string }[]) => c.map((x) => x.key).sort().join(",");

(async () => {
  // ── what is an "access" problem
  check("auth errors: the TikTok messages we have seen are recognised", isAuthError("TikTok said no (105005): Access denied. The access token does not include any…") && isAuthError("TikTok said no (40105): Access token is invalid") && isAuthError("Shopee said no (error_auth): Invalid access_token."));
  check("auth errors: a version change or a hiccup is not an access problem", !isAuthError("TikTok said no (36009004): Invalid API version. The 'version' query parameter i…") && !isAuthError("Could not reach TikTok (timeout).") && !isAuthError(null));

  // ── connections
  const base: ConnectionInput = { nowSec: 1_800_000_000, tiktok: { configured: true, connected: true, authErrors: [] }, ads: { configured: true, connected: true, authErrors: [] }, shopee: { configured: true, connected: true, savedEnv: "sandbox", configEnv: "sandbox", refreshExpiresAt: 1_800_000_000 + 20 * 86400 } };
  check("connections: everything fine gives nothing", connectionCandidates(base).length === 0);
  check("connections: keys set but not connected is a warning", keys(connectionCandidates({ ...base, tiktok: { configured: true, connected: false, authErrors: [] } })) === "conn:tiktok-shop:off");
  check("connections: no keys and not connected is not a problem (it is simply not used)", connectionCandidates({ ...base, ads: { configured: false, connected: false, authErrors: [] }, shopee: { ...base.shopee, configured: false, connected: false } }).length === 0);
  const au = connectionCandidates({ ...base, tiktok: { configured: true, connected: true, authErrors: ["TikTok said no (105005): Access denied.", "x", "y"] } });
  check("connections: a refused login is critical, says how many cards, and how to fix it", au.length === 1 && au[0].severity === "critical" && /105005/.test(au[0].detail ?? "") && /3 data cards/.test(au[0].detail ?? "") && /Reconnect/.test(au[0].advice ?? "") && /Partner Center/.test(au[0].advice ?? ""));
  check("connections: Ads has its own alert", keys(connectionCandidates({ ...base, ads: { configured: true, connected: true, authErrors: ["Access token invalid"] } })) === "conn:tiktok-ads:auth");
  const ex = (d: number) => connectionCandidates({ ...base, shopee: { ...base.shopee, refreshExpiresAt: base.nowSec + d * 86400 } });
  check("connections: Shopee login: 20 days left fine, 5 days a warning, 1 day a warning, expired critical", ex(20).length === 0 && ex(5)[0].severity === "warning" && /5 days/.test(ex(5)[0].title) && /1 day$/.test(ex(0.5)[0].title) && ex(-1)[0].severity === "critical");
  check("connections: Shopee sandbox login with a live server is flagged", keys(connectionCandidates({ ...base, shopee: { ...base.shopee, savedEnv: "sandbox", configEnv: "live" } })) === "conn:shopee:env");

  // ── data sync
  const HOUR = 3600_000, now = 1_800_000_000_000;
  const src = (o: Partial<SyncSource> = {}): SyncSource => ({ name: "TikTok Shop", id: "tiktok", connected: true, enabled: true, everyMinutes: 60, lastSuccessMs: now - 10 * 60_000, failed: [], running: [], ...o });
  check("sync: a healthy sync gives nothing", syncCandidates([src()], now).length === 0);
  const f = syncCandidates([src({ failed: [{ key: "sample_requests", label: "Affiliate Sample Requests", error: "TikTok said no (36009004): Invalid API version. The 'version' query parameter i…", atMs: now - HOUR }] })], now);
  check("sync: a failed card shows TikTok's own message and a version hint", f.length === 1 && f[0].severity === "warning" && /36009004/.test(f[0].detail ?? "") && /API version/.test(f[0].advice ?? "") && /Affiliate Sample Requests failed/.test(f[0].title));
  check("sync: a card that has failed for over a day is critical", syncCandidates([src({ failed: [{ key: "orders", label: "Total Orders", error: "timeout", atMs: now - 30 * HOUR }] })], now)[0].severity === "critical");
  check("sync: access errors are left to Connections, not shown twice", syncCandidates([src({ failed: [{ key: "fin_statements", label: "Finance Statements", error: "TikTok said no (105005): Access denied.", atMs: now }] })], now).length === 0);
  check("sync: old data is flagged (nothing good for 8 hours on an hourly sync)", keys(syncCandidates([src({ lastSuccessMs: now - 8 * HOUR })], now)) === "sync:tiktok:stale");
  check("sync: a 12-hour schedule is not stale after 8 hours", syncCandidates([src({ everyMinutes: 720, lastSuccessMs: now - 8 * HOUR })], now).length === 0);
  check("sync: a sync switched off is not stale", syncCandidates([src({ enabled: false, lastSuccessMs: now - 80 * HOUR })], now).length === 0);
  check("sync: syncing for over 3 hours looks stuck, under 3 hours does not", syncCandidates([src({ running: [{ dataset: "orders", label: "Total Orders", startedMs: now - 4 * HOUR }] })], now).length === 1 && syncCandidates([src({ running: [{ dataset: "orders", label: "Total Orders", startedMs: now - 1 * HOUR }] })], now).length === 0);
  check("sync: a source that is not connected is ignored", syncCandidates([src({ connected: false, lastSuccessMs: now - 80 * HOUR, failed: [{ key: "orders", label: "o", error: "x", atMs: now }] })], now).length === 0);

  // ── server
  const quiet = { diskPct: 40, memPct: 50, cpu: [10, 20, 15, 12, 9], loadPerCore: 0.3, lagMs: [5, 8, 3] };
  check("server: a quiet server gives nothing", serverCandidates(quiet).length === 0);
  check("server: disk 80% is a warning, 90% critical", serverCandidates({ ...quiet, diskPct: 81 })[0].severity === "warning" && serverCandidates({ ...quiet, diskPct: 93 })[0].severity === "critical" && serverCandidates({ ...quiet, diskPct: 79 }).length === 0);
  check("server: memory 85% is a warning, 95% critical", serverCandidates({ ...quiet, memPct: 86 })[0].severity === "warning" && serverCandidates({ ...quiet, memPct: 96 })[0].severity === "critical" && serverCandidates({ ...quiet, memPct: 84 }).length === 0);
  check("server: processor busy for 3 readings in a row is a warning; one spike is not", serverCandidates({ ...quiet, cpu: [20, 91, 92, 93] })[0]?.key === "server:cpu" && serverCandidates({ ...quiet, cpu: [20, 99, 20, 30] }).length === 0 && serverCandidates({ ...quiet, cpu: [91, 92] }).length === 0);
  check("server: processor at the limit for 5 readings is critical", serverCandidates({ ...quiet, cpu: [96, 97, 99, 98, 100] })[0].severity === "critical");
  check("server: more work than cores (load 2+ per core) is a slow-server warning", serverCandidates({ ...quiet, loadPerCore: 2.4 })[0].key === "server:load" && serverCandidates({ ...quiet, loadPerCore: 1.5 }).length === 0);
  check("server: the app held up 500 ms three times in a row is a slow-response warning", serverCandidates({ ...quiet, lagMs: [900, 700, 600] })[0].key === "server:slow" && serverCandidates({ ...quiet, lagMs: [900, 100, 600] }).length === 0);

  // ── errors
  check("errors: the same mistake with different numbers is one problem", errorSignature("server", "/orders/123", "Order 98765 not found") === errorSignature("server", "/orders/456", "Order 11 not found") && errorSignature("server", "/a", "boom") !== errorSignature("server", "/b", "boom") && errorSignature("server", "/a", "boom") !== errorSignature("browser", "/a", "boom"));
  const eg = errorCandidates([{ signature: "s1", source: "server", route: "/profit", message: "relation x does not exist", count24h: 3, countHour: 3 }, { signature: "s2", source: "browser", route: "/stock", message: "x is not a function", count24h: 40, countHour: 12 }]);
  check("errors: 10+ in an hour is critical, fewer is a warning, and each says where", eg[0].severity === "warning" && eg[1].severity === "critical" && /Page error on \/profit/.test(eg[0].title) && /Browser error on \/stock/.test(eg[1].title) && eg[1].count === 40);

  // ── the error log
  await pg`truncate system_alerts, app_error_log`;
  await recordError({ source: "server", route: "/a?x=1", message: "NEXT_REDIRECT" });
  await recordError({ source: "browser", route: "/a", message: "ResizeObserver loop completed with undelivered notifications." });
  check("error log: redirects and browser noise are not errors", (await pg`select count(*)::int as n from app_error_log`)[0].n === 0);
  await recordError({ source: "server", route: "/profit?range=all", message: "relation \"foo\" does not exist", stack: "Error: relation\n  at x" });
  const row = (await pg`select * from app_error_log`)[0];
  check("error log: saved with the page (without the ?query), the message and the stack", row.route === "/profit" && /does not exist/.test(String(row.message)) && /at x/.test(String(row.stack)) && row.source === "server");
  for (let i = 0; i < 40; i++) await recordError({ source: "server", route: "/loop", message: "same thing again" });
  check("error log: a mistake repeating more than 30 times a minute is cut off", (await pg`select count(*)::int as n from app_error_log where route = '/loop'`)[0].n === 30);
  await recordError({ source: "browser", route: "/x", message: "m".repeat(5000), stack: "s".repeat(9000) });
  const big = (await pg`select length(message) as m, length(stack) as s from app_error_log where route = '/x'`)[0];
  check("error log: very long text is cut short", big.m <= 800 && big.s <= 3000);

  // Next.js tells us about every error in a page or action
  process.env.NEXT_RUNTIME = "nodejs";
  await onRequestError(new Error("connection to the database was lost"), { path: "/profit/order/55", method: "GET" }, { routePath: "/profit/order/[id]" });
  await onRequestError("a plain text error", { path: "/stock", method: "POST" }, {});
  const hooked = await pg`select route, message, source from app_error_log where route in ('/profit/order/[id]', '/stock') order by id`;
  check("hook: errors Next.js reports are saved with the page pattern and the message", hooked.length === 2 && hooked[0].route === "/profit/order/[id]" && /database was lost/.test(String(hooked[0].message)) && hooked[0].source === "server" && hooked[1].message === "a plain text error");
  let threw = false;
  await onRequestError(undefined, { path: "/x", method: "GET" }, {}).catch(() => { threw = true; });
  check("hook: never throws, and an empty error is not saved", !threw && (await pg`select 1 from app_error_log where route = '/x' and message = 'undefined'`).length === 0);

  // ── saving the alert list
  await pg`truncate system_alerts`;
  const c1 = { key: "sync:tiktok:orders", area: "sync" as const, severity: "warning" as const, title: "Orders failed", detail: "boom", advice: "Press sync", href: "/sync" };
  await syncAlerts([c1]);
  let l = await listAlerts();
  check("alerts: a new problem is saved as open", l.open.length === 1 && l.open[0].status === "open" && l.open[0].title === "Orders failed" && l.open[0].count === 1);
  await pg`update system_alerts set first_seen = now() - interval '2 hours', last_seen = now() - interval '2 hours'`;
  await syncAlerts([{ ...c1, detail: "boom again" }]);
  l = await listAlerts();
  check("alerts: a repeat refreshes it (same first time, newer last time, new text) and does not add a second", l.open.length === 1 && l.open[0].detail === "boom again" && new Date(l.open[0].lastSeen) > new Date(l.open[0].firstSeen) && Date.now() - new Date(l.open[0].firstSeen).getTime() > 3600_000);
  await setAlertStatus(c1.key, "seen", "Owner");
  await syncAlerts([c1]);
  l = await listAlerts();
  let sum = await alertSummary();
  check("alerts: Seen stays seen on the next check, still listed, and leaves the bell count", l.open[0].status === "seen" && l.open[0].handledBy === "Owner" && sum.unseen === 0 && sum.open === 1 && sum.byArea.sync === "warning");
  await syncAlerts([{ ...c1, severity: "critical" }]);
  l = await listAlerts(); sum = await alertSummary();
  check("alerts: if a seen problem gets worse it comes back as open and counts on the bell", l.open[0].status === "open" && l.open[0].severity === "critical" && sum.unseen === 1 && sum.worst === "critical");
  await syncAlerts([]);
  l = await listAlerts(); sum = await alertSummary();
  check("alerts: when the problem is gone it is resolved by itself", l.open.length === 0 && l.resolved.length === 1 && l.resolved[0].resolvedAt != null && sum.open === 0 && sum.worst === null);
  await syncAlerts([c1]);
  l = await listAlerts();
  check("alerts: if it comes back it is open again with a new first time", l.open.length === 1 && l.open[0].status === "open" && l.resolved.length === 0);

  // an error someone cleared stays cleared until it happens again
  const ec = { key: "error:s9", area: "errors" as const, severity: "warning" as const, title: "Page error on /x", detail: "bad", count: 2, lastAtMs: Date.now() - 60_000 };
  await syncAlerts([ec]);
  await setAlertStatus("error:s9", "resolved", "Owner");
  await syncAlerts([ec]);
  l = await listAlerts();
  check("alerts: a cleared error stays cleared while nothing new happens", !l.open.some((a) => a.key === "error:s9") && l.resolved.some((a) => a.key === "error:s9"));
  await syncAlerts([{ ...ec, lastAtMs: Date.now() + 1000, count: 3 }]);
  l = await listAlerts();
  check("alerts: a cleared error comes back when it happens again", l.open.some((a) => a.key === "error:s9" && a.count === 3));

  // how long alerts are kept is a setting (default 14 days)
  check("retention: the default is 14 days", (await getRetentionDays()) === 14);
  await pg`update system_alerts set status = 'resolved', resolved_at = now() - interval '20 days' where key = 'sync:tiktok:orders'`;
  await setRetentionDays(30);
  await syncAlerts([]);
  check("retention: with 30 days an alert resolved 20 days ago is still in the history", (await pg`select 1 from system_alerts where key = 'sync:tiktok:orders'`).length === 1 && (await listAlerts()).resolved.some((a) => a.key === "sync:tiktok:orders"));
  await setRetentionDays(5);
  await pg`update app_error_log set at = now() - interval '9 days' where route = '/loop'`;
  await syncAlerts([]);
  check("retention: with 5 days it is deleted", (await pg`select 1 from system_alerts where key = 'sync:tiktok:orders'`).length === 0);
  check("retention: error lines are kept at least 7 days", (await pg`select 1 from app_error_log where route = '/loop'`).length === 0);
  check("retention: the number is kept between 1 and 365", (await setRetentionDays(0)) === 1 && (await setRetentionDays(9999)) === 365);
  await setRetentionDays(14);

  // ── the diagnostic report
  process.env.SHOPEE_PARTNER_KEY = "SUPER-SECRET-PARTNER-KEY"; process.env.SHOPEE_PARTNER_ID = "1253192";
  const rep = await buildReport();
  check("report: has every section", ["CONNECTIONS", "DATA SYNC (TikTok Shop)", "DATA SYNC (TikTok Ads)", "SERVER", "OPEN ALERTS", "LATEST APP ERRORS"].every((h) => rep.includes(h)), rep.slice(0, 300));
  check("report: never contains a key or secret", !rep.includes("SUPER-SECRET-PARTNER-KEY") && !/TIKTOK_APP_SECRET|password|access_token/i.test(rep));
  check("report: lists the latest errors with their page", /\/profit: relation/.test(rep) && /Page error|OPEN ALERTS/.test(rep));
  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
