// TikTok Ads (GMV Max) sync tests with a pretend TikTok Business API (no network, no real keys). Needs a *_test database.
export {};
// Run: DATABASE_URL=postgres://postgres@localhost:5433/affiliate_test npx tsx --conditions=react-server scripts/test-ads-sync.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 400) : "")); };

async function main() {
  const S = await import("../src/lib/tiktok-ads/sync");
  const C = await import("../src/lib/tiktok-ads/client");
  const K = await import("../src/lib/tiktok-ads/checks");
  const Sch = await import("../src/lib/tiktok/scheduler");
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  for (const t of ["ads_sync_runs", "ads_sync_state", "ads_advertisers", "ads_stores", "ads_campaigns", "ads_campaign_daily", "ads_creative_daily", "ads_product_daily"]) await q(sql.raw(`delete from ${t}`));
  await q(sql`delete from settings where key in ('tiktok_ads_connection', 'tiktok_ads_sync')`);
  const cfg = { appId: "APP1", appSecret: "s3cret", redirectUri: null };
  const sleep = async () => {};
  const now = () => new Date("2026-11-10T04:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * 86400_000));
  const TODAY = "2026-11-10";
  const FIRST_AD_DAY = "2026-08-20"; // the account had no ads before this day

  // ── a pretend TikTok Business API ──
  let broken: "none" | "auth" = "none";
  let rateOnce = true;
  let renameMetrics = false;
  const failAccount222 = true;
  let bump: Record<string, string> = {};
  const seen: { path: string; headers: Record<string, string>; q: Record<string, string>; body: unknown }[] = [];
  const reply = (code: number, data: unknown, message = "OK") => new Response(JSON.stringify({ code, message, request_id: "REQ123", data }), { status: 200 });
  const val = (camp: string, day: string, item = "") => {
    const n = (Date.parse(day + "T00:00:00Z") / 86400_000) % 7 + (camp === "C2" ? 3 : 1) + (item ? item.length : 0);
    return { cost: (n * 10).toFixed(2), net_cost: (n * 9).toFixed(2), orders: String(n), cost_per_order: "10.00", gross_revenue: (n * 40).toFixed(2), roi: "4.00" };
  };
  const fake = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^.*\/open_api\/v1\.3/, "");
    const headers: Record<string, string> = {}; new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const qq = Object.fromEntries(u.searchParams.entries());
    let body: unknown = null; try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { /* none */ }
    seen.push({ path: p, headers, q: qq, body });
    if (p === "/oauth2/access_token/") { const b = body as Record<string, string>; return b.auth_code === "GOOD" ? reply(0, { access_token: "AT123", advertiser_ids: ["111", "222"], scope: [1, 2] }) : reply(40002, null, "auth_code is invalid"); }
    if (p === "/oauth2/advertiser/get/") return reply(0, { list: [{ advertiser_id: "111", advertiser_name: "ALOOMA" }, { advertiser_id: "222", advertiser_name: "ALOOMA 2" }] });
    if (broken === "auth") return reply(40105, null, "Access token is invalid or expired. Please re-authorize.");
    if (headers["access-token"] !== "AT123") return reply(40105, null, "Access token is invalid");
    if (rateOnce && p === "/gmv_max/campaign/get/") { rateOnce = false; return reply(40100, null, "Too many requests. Please try again later."); }
    if (p === "/advertiser/info/") return reply(0, { list: [{ advertiser_id: "111", name: "ALOOMA", currency: "MYR", timezone: "Asia/Kuala_Lumpur", status: "STATUS_ENABLE" }, { advertiser_id: "222", name: "ALOOMA 2", currency: "MYR", timezone: "Asia/Kuala_Lumpur", status: "STATUS_ENABLE" }] });
    if (p === "/gmv_max/store/list/") {
      if (qq.advertiser_id === "222") return failAccount222 ? reply(40002, null, "No permission for this advertiser") : reply(0, { store_list: [] });
      return reply(0, { store_list: [{ store_id: "S1", store_name: "ALOOMA MY", store_code: "MY-1", store_authorized_bc_id: "B1", is_gmv_max_available: true }] });
    }
    if (p === "/gmv_max/campaign/get/") {
      if (qq.advertiser_id !== "111") return reply(0, { list: [], page_info: { page: 1, page_size: 50, total_number: 0, total_page: 1 } });
      const all = [{ campaign_id: "C1", campaign_name: "Pillow GMV Max", operation_status: "ENABLE", store_id: "S1", gmv_max_promotion_type: "PRODUCT_SHOPPING", budget: "200.00", roas_bid: "4.5", create_time: "2026-08-20 10:00:00", modify_time: "2026-11-01 09:00:00" },
        { campaign_id: "C2", campaign_name: "LIVE GMV Max", operation_status: "DISABLE", store_id: "S1", gmv_max_promotion_type: "LIVE", budget: "100", roas_bid: "3", create_time: "2026-09-01 10:00:00" },
        { campaign_id: "C3", campaign_name: "Old", operation_status: "ENABLE", store_id: "S1", gmv_max_promotion_type: "PRODUCT_SHOPPING", budget: "50" }];
      const page = Number(qq.page), asked = Number(qq.page_size);
      if (asked > 50) return reply(40002, null, "page_size is invalid: it must be 1 to 50"); // forces the page size to step down
      const size = 2; // a server that gives fewer per page than asked: the walk must follow page_info, not the asked size
      return reply(0, { list: all.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: all.length, total_page: Math.ceil(all.length / size) } });
    }
    if (p === "/gmv_max/report/get/") {
      const dims = JSON.parse(qq.dimensions) as string[], mets = JSON.parse(qq.metrics) as string[];
      const start = qq.start_date, end = qq.end_date;
      if (end > TODAY) return reply(40002, null, "end_date can not be in the future");
      if (!JSON.parse(qq.store_ids).includes("S1")) return reply(40002, null, "Invalid store_ids");
      if (dims.includes("item_id") && dims.includes("campaign_id")) return reply(40002, null, "Invalid dimensions: item_id can not be combined with campaign_id");
      if (mets.includes("title") || mets.includes("product_name")) return reply(40002, null, "Invalid metric: title");
      const lines: unknown[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (d < FIRST_AD_DAY) continue;
        for (const camp of ["C1", "C2"]) {
          const items = dims.includes("item_id") ? ["V1", "V22"] : dims.includes("item_group_id") ? ["P1"] : [""];
          for (const it of items) {
            const v = val(camp, d, it);
            if (bump[`${camp}|${d}`] && !it) v.gross_revenue = bump[`${camp}|${d}`];
            const m: Record<string, string> = Object.fromEntries(mets.map((k) => [renameMetrics ? "x_" + k : k, (v as Record<string, string>)[k] ?? ""]));
            const dm: Record<string, string> = { stat_time_day: d + " 00:00:00" };
            if (dims.includes("campaign_id")) dm.campaign_id = camp;
            if (dims.includes("item_id")) dm.item_id = it;
            if (dims.includes("item_group_id")) dm.item_group_id = it;
            lines.push({ dimensions: dm, metrics: m });
          }
        }
      }
      const page = Number(qq.page), size = Number(qq.page_size);
      return reply(0, { list: lines.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: lines.length, total_page: Math.max(1, Math.ceil(lines.length / size)) } });
    }
    return reply(40002, null, "unknown path " + p);
  };
  const deps = { cfg, f: fake, sleep, pauseMs: 0, now };
  const count = async (t: string) => Number((await q(sql.raw(`select count(*)::int as n from ${t}`)))[0].n);

  // ── helpers ──
  check("queryString: lists and objects go as JSON text, empty values are left out", C.queryString({ a: ["x", "y"], b: { c: 1 }, d: "z", e: null, f: "" }) === "a=%5B%22x%22%2C%22y%22%5D&b=%7B%22c%22%3A1%7D&d=z");
  check("config: needs both the app ID and the secret", C.adsConfig({ TIKTOK_ADS_APP_ID: "a" }) === null && C.adsConfig({ TIKTOK_ADS_APP_ID: "a", TIKTOK_ADS_APP_SECRET: "b" })?.appId === "a");
  const url = C.adsAuthorizeUrl(cfg, "STATE1", "http://localhost:3000/api/tiktok-ads/callback");
  check("authorize link: app id, state and redirect address", /portal\/auth\?/.test(url) && url.includes("app_id=APP1") && url.includes("state=STATE1") && url.includes(encodeURIComponent("http://localhost:3000/api/tiktok-ads/callback")));
  check("redirect address: taken from the website's own address (or the env override)", C.redirectUriFor(cfg, "http://localhost:3000/api/tiktok-ads/connect") === "http://localhost:3000/api/tiktok-ads/callback" && C.redirectUriFor(cfg, "http://10.0.0.5:3000/x", "app.alooma.my", "https") === "https://app.alooma.my/api/tiktok-ads/callback" && C.redirectUriFor({ ...cfg, redirectUri: "https://fixed/cb" }, "http://x/y") === "https://fixed/cb");
  check("isDue: schedule rules", S.adsIsDue(10_000_000, null, { enabled: true, everyMinutes: 60 }) && !S.adsIsDue(10_000_000, 10_000_000 - 30 * 60_000, { enabled: true, everyMinutes: 60 }) && S.adsIsDue(10_000_000, 10_000_000 - 61 * 60_000, { enabled: true, everyMinutes: 60 }) && !S.adsIsDue(1, null, { enabled: false, everyMinutes: 60 }));
  const w = S.backWindows("2026-11-10", "2026-11-01");
  check("windows: the newest first, never before the first day", w.length === 1 && w[0].start === "2026-11-01" && w[0].end === "2026-11-10");
  const w2 = S.backWindows("2026-11-10", "2026-08-01");
  check("windows: 30-day pieces back to the first day, with no gap and no overlap", w2.length === 4 && w2[0].end === "2026-11-10" && w2[0].start === "2026-10-12" && w2[1].end === "2026-10-11" && w2[3].start === "2026-08-01");

  // ── connect ──
  let badCode = "";
  try { await C.adsConnectWithCode("BAD", cfg, fake); } catch (e) { badCode = e instanceof Error ? e.message : ""; }
  check("connect: a wrong code is refused with TikTok's own message and saves nothing", /auth_code is invalid/.test(badCode) && !(await C.adsConnectionInfo()).connected, badCode);
  const conn = await C.adsConnectWithCode("GOOD", cfg, fake);
  check("connect: the right code stores the login and the ad accounts it covers", conn.advertiserIds.join() === "111,222" && (await C.adsConnectionInfo()).connected);
  const stored = JSON.stringify((await q(sql`select value from settings where key = 'tiktok_ads_connection'`))[0].value);
  check("connect: the login is stored encrypted, never in plain text", !stored.includes("AT123") && stored.includes("accessToken"));
  const ex = seen.find((s) => s.path === "/oauth2/access_token/" && (s.body as Record<string, string>).auth_code === "GOOD");
  check("connect: the exchange sends the app id, secret and code", !!ex && (ex.body as Record<string, string>).app_id === "APP1" && (ex.body as Record<string, string>).secret === "s3cret");

  // ── the connection check ──
  const chk = await K.runAdsChecks({ cfg, f: fake, sleep });
  check("check: ad accounts, shops, campaigns and results all answer", chk.checks.length === 4 && chk.checks.every((c) => c.ok), JSON.stringify(chk.checks.filter((c) => !c.ok)));
  check("check: it lists the accounts and the field names TikTok sent", chk.accounts.length === 2 && chk.accounts[0].name === "ALOOMA" && !!chk.checks.find((c) => c.name.startsWith("Campaign results"))?.fields?.includes("cost"));

  // ── a full sync ──
  const r1 = await S.runAdsAll("manual", null, deps);
  check("sync: every dataset finishes", r1.length === 6 && r1.every((r) => r.status === "ok"), JSON.stringify(r1.map((r) => [r.dataset, r.status, r.error])));
  check("sync: ad accounts and shops saved", (await count("ads_advertisers")) === 2 && (await count("ads_stores")) === 1);
  const a1 = (await q(sql`select name, currency, timezone from ads_advertisers where advertiser_id = '111'`))[0];
  check("sync: account details are mapped", a1.name === "ALOOMA" && a1.currency === "MYR" && a1.timezone === "Asia/Kuala_Lumpur");
  check("sync: one account TikTok refuses does not stop the others, and it is reported", /1 of 2 account.*skipped/.test(String(r1.find((r) => r.dataset === "stores")?.error)), String(r1.find((r) => r.dataset === "stores")?.error));
  check("sync: all campaigns saved across pages (page size stepped down, rate limit waited out)", (await count("ads_campaigns")) === 3, `${await count("ads_campaigns")} ${JSON.stringify(r1.find((r) => r.dataset === "campaigns"))}`);
  const camp = (await q(sql`select name, status, promotion_type, budget::float8 as budget, roas_target::float8 as roas, store_id from ads_campaigns where campaign_id = 'C1'`))[0];
  check("sync: campaign fields are mapped", camp.name === "Pillow GMV Max" && camp.status === "ENABLE" && camp.promotion_type === "PRODUCT_SHOPPING" && camp.budget === 200 && camp.roas === 4.5 && camp.store_id === "S1");
  const nDays = Math.round((Date.parse(TODAY) - Date.parse(FIRST_AD_DAY)) / 86400_000) + 1;
  check("history: the first sync reads back to the first ad day, then stops after empty months", (await count("ads_campaign_daily")) === nDays * 2, `${await count("ads_campaign_daily")} vs ${nDays * 2}`);
  const first = (await q(sql`select min(day)::text as a, max(day)::text as b from ads_campaign_daily`))[0];
  check("history: oldest and newest day are right", first.a === FIRST_AD_DAY && first.b === TODAY, JSON.stringify(first));
  const cd = (await q(sql`select cost::float8 as cost, orders, gross_revenue::float8 as rev, roi::float8 as roi from ads_campaign_daily where campaign_id = 'C1' and day = '2026-11-10'`))[0];
  const exp = (() => { const n = (Date.parse("2026-11-10T00:00:00Z") / 86400_000) % 7 + 1; return { cost: n * 10, orders: n, rev: n * 40 }; })();
  check("results: numbers sent as text are saved as numbers", cd.cost === exp.cost && cd.orders === exp.orders && cd.rev === exp.rev && cd.roi === 4, JSON.stringify(cd));
  check("creative results: the second dimension choice worked after TikTok refused the first, and the plainer metrics after the richer ones", (await count("ads_creative_daily")) === nDays * 2 && (await q(sql`select 1 from ads_creative_daily where creative_id = 'V1' and campaign_id = '-' limit 1`)).length === 1, String(await count("ads_creative_daily")));
  check("product results saved", (await count("ads_product_daily")) === nDays * 2);
  const reqs = seen.filter((s) => s.path === "/gmv_max/report/get/");
  check("requests: every call carries the login in the Access-Token header", seen.filter((s) => !s.path.startsWith("/oauth2/")).every((s) => s.headers["access-token"] === "AT123"));
  check("requests: the last day asked for is never in the future", reqs.every((r) => r.q.end_date <= TODAY));
  check("requests: asks for the shop ids of that account only", reqs.every((r) => r.q.store_ids === '["S1"]'));
  const ov1 = await S.adsOverview();
  check("info notes: how a result was read is not shown as a warning", S.isInfoNote("Used dimensions a + b") && S.isInfoNote("Used dimensions a · Used dimensions b") && !S.isInfoNote("1 of 2 accounts skipped (x)") && !S.isInfoNote("Used dimensions a · 1 lines skipped") && !S.isInfoNote(null));
  check("overview: records, dates and a sample of what TikTok sent", ov1.datasets.find((d) => d.key === "campaign_daily")?.records === nDays * 2 && ov1.datasets.find((d) => d.key === "campaign_daily")?.oldest === FIRST_AD_DAY && /dimensions/.test(ov1.datasets.find((d) => d.key === "campaigns")?.sample ?? "") === false && /campaign_id/.test(ov1.datasets.find((d) => d.key === "campaigns")?.sample ?? ""), JSON.stringify(ov1.datasets.map((d) => [d.key, d.records, d.sample?.length])));
  check("overview: accounts, shops and active campaigns", ov1.accounts.length === 2 && ov1.shops === 1 && ov1.activeCampaigns === 2 && !ov1.needsReconnect);

  // ── idempotent, and TikTok restating a recent day ──
  const r2 = await S.runAdsAll("schedule", null, deps);
  check("again: running the sync twice changes nothing and duplicates nothing", r2.every((r) => r.status === "ok") && r2.filter((r) => ["campaign_daily", "creative_daily", "product_daily", "campaigns", "advertisers", "stores"].includes(r.dataset)).every((r) => r.changed === 0) && (await count("ads_campaign_daily")) === nDays * 2, JSON.stringify(r2.map((r) => [r.dataset, r.changed])));
  const recentReq = seen.filter((s) => s.path === "/gmv_max/report/get/").slice(-6);
  check("again: a normal sync reads only the recent days again, not the whole history", recentReq.every((r) => r.q.start_date >= addDays(TODAY, -13)), JSON.stringify(recentReq.map((r) => r.q.start_date)));
  bump["C1|2026-11-08"] = "999.00";
  const r3 = await S.runAdsDataset("campaign_daily", "schedule", null, deps);
  const restated = (await q(sql`select gross_revenue::float8 as rev from ads_campaign_daily where campaign_id = 'C1' and day = '2026-11-08'`))[0];
  check("restated day: TikTok changes a recent day's sales, the next sync picks it up (one row changed)", r3.changed === 1 && restated.rev === 999, `${r3.changed} ${restated.rev}`);
  bump = {};

  // ── trouble ──
  renameMetrics = true;
  const r4 = await S.runAdsDataset("campaign_daily", "manual", null, deps);
  check("renamed fields: unreadable numbers are reported with the field names, not saved as empty rows", r4.status === "failed" && /none of the numbers.*could be read/.test(r4.error ?? "") && /x_cost/.test(r4.error ?? ""), r4.error);
  renameMetrics = false;
  broken = "auth";
  const r5 = await S.runAdsAll("manual", null, deps);
  check("sign-in refused: the first step fails with TikTok's message and the rest are not run on stale data", r5[0].status === "failed" && /Access token is invalid/.test(r5[0].error ?? "") && r5.slice(1).every((r) => r.status === "skipped"), JSON.stringify(r5.map((r) => [r.dataset, r.status])));
  const ov2 = await S.adsOverview();
  check("sign-in refused: the screen is told to ask for a new Connect", ov2.needsReconnect === true && !!ov2.datasets.find((d) => d.key === "advertisers")?.lastError);
  check("sign-in refused: data already saved is untouched", (await count("ads_campaign_daily")) === nDays * 2);
  broken = "none";
  const r6 = await S.runAdsAll("manual", null, deps);
  check("recovery: once the login works again the sync clears the error", r6.every((r) => r.status === "ok") && !(await S.adsOverview()).needsReconnect);

  // ── safety ──
  await q(sql`insert into ads_sync_runs (dataset, trigger) values ('campaigns', 'manual')`);
  const r7 = await S.runAdsDataset("campaigns", "manual", null, deps);
  check("two at once: a dataset already running is skipped, not run twice", r7.status === "skipped");
  check("restart: runs left 'running' are marked interrupted so nothing waits forever", (await S.clearAdsInterrupted()) >= 1 && (await q(sql`select 1 from ads_sync_runs where status = 'running'`)).length === 0);
  const r8 = await S.runAdsDataset("campaigns", "manual", null, { ...deps, cfg: null });
  check("no keys: a clear message instead of a crash", r8.status === "failed" && /app ID and secret/.test(r8.error ?? ""));

  // ── scheduler ──
  await S.saveAdsSyncSettings({ enabled: false });
  check("scheduler: off when switched off", (await Sch.adsSchedulerTick(deps, Date.now())) === "off");
  await S.saveAdsSyncSettings({ enabled: true, everyMinutes: 60 });
  await q(sql`delete from ads_sync_runs where dataset = '_all'`);
  check("scheduler: runs when due", (await Sch.adsSchedulerTick(deps, Date.now())) === "ran");
  check("scheduler: idle right after a run", (await Sch.adsSchedulerTick(deps, Date.now() + 5 * 60_000)) === "idle");
  check("scheduler: due again an hour later", (await Sch.adsSchedulerTick(deps, Date.now() + 61 * 60_000)) === "ran");
  check("scheduler: off when not connected", (await (async () => { await C.adsDisconnect(); const r = await Sch.adsSchedulerTick(deps, Date.now() + 999 * 60_000); return r; })()) === "off");
  check("disconnect: the login is deleted and synced data stays", !(await C.adsConnectionInfo()).connected && (await count("ads_campaign_daily")) === nDays * 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
