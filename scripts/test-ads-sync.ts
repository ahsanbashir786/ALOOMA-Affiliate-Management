process.env.SWR_OFF = "1";
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
  for (const t of ["ads_videos", "ads_boosts", "ads_sync_runs", "ads_sync_state", "ads_advertisers", "ads_stores", "ads_campaigns", "ads_campaign_daily", "ads_creative_daily", "ads_product_daily"]) await q(sql.raw(`delete from ${t}`));
  await q(sql`delete from settings where key in ('tiktok_ads_connection', 'tiktok_ads_sync', 'tiktok_ads_metrics')`);
  const cfg = { appId: "APP1", appSecret: "s3cret", redirectUri: null };
  const sleep = async () => {};
  const now = () => new Date("2026-11-10T04:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * 86400_000));
  const TODAY = "2026-11-10";
  // The connection check uses the real date (the syncs use the fixed one above), so "the future" starts after whichever is later.
  const REAL_TODAY = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const LAST_OK_DAY = REAL_TODAY > TODAY ? REAL_TODAY : TODAY;
  const FIRST_AD_DAY = "2026-08-20"; // the account had no ads before this day

  // ── a pretend TikTok Business API ──
  let broken: "none" | "auth" = "none";
  let rateOnce = true;
  let renameMetrics = false;
  let maxCampaignIds = 10;
  let rejectProductDim = false;
  let videosOnlyViaIdentity = false;
  let oldestAllowed = "";
  const ACCEPTED = ["cost", "net_cost", "orders", "cost_per_order", "gross_revenue", "roi", "title", "product_impressions", "product_clicks", "creative_delivery_status", "exploration_status", "boost_status", "tt_account_authorization_type"];
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
    if (p === "/oauth2/advertiser/get/") {
      if (qq.access_token) return reply(40105, null, "The access_token must not be in the web address");
      if (headers["access-token"] !== "AT123") return reply(40105, null, "The access_token is empty.");
      if (broken === "auth") return reply(40105, null, "Access token is invalid or expired. Please re-authorize.");
    }
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
      const types = (JSON.parse(qq.filtering ?? "{}").gmv_max_promotion_types ?? []) as string[];
      const badType = types.findIndex((t) => !["LIVE_GMV_MAX", "PRODUCT_GMV_MAX"].includes(t));
      if (!types.length || badType >= 0) return reply(40002, null, `filtering: gmv_max_promotion_types.${Math.max(badType, 0)}: value is not one of the allowed values, value is ${types[Math.max(badType, 0)]} ,correct is LIVE_GMV_MAX, PRODUCT_GMV_MAX`);
      if (qq.advertiser_id !== "111") return reply(0, { list: [], page_info: { page: 1, page_size: 50, total_number: 0, total_page: 1 } });
      const all = [{ campaign_id: "C1", campaign_name: "Pillow GMV Max", operation_status: "ENABLE", store_id: "S1", gmv_max_promotion_type: "PRODUCT_GMV_MAX", budget: "200.00", roas_bid: "4.5", create_time: "2026-08-20 10:00:00", modify_time: "2026-11-01 09:00:00" },
        { campaign_id: "C2", campaign_name: "LIVE GMV Max", operation_status: "DISABLE", store_id: "S1", gmv_max_promotion_type: "LIVE_GMV_MAX", budget: "100", roas_bid: "3", create_time: "2026-09-01 10:00:00" },
        { campaign_id: "C3", campaign_name: "Old", operation_status: "ENABLE", store_id: "S1", gmv_max_promotion_type: "PRODUCT_GMV_MAX", budget: "50" }];
      const page = Number(qq.page), asked = Number(qq.page_size);
      if (asked > 50) return reply(40002, null, "page_size is invalid: it must be 1 to 50"); // forces the page size to step down
      const size = 2; // a server that gives fewer per page than asked: the walk must follow page_info, not the asked size
      return reply(0, { list: all.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: all.length, total_page: Math.ceil(all.length / size) } });
    }
    if (p === "/gmv_max/identity/get/") return reply(0, { identity_list: [{ identity_id: "ID1", identity_type: "TT_USER", identity_authorized_bc_id: "B1", display_name: "Tender Twigs" }] });
    if (p === "/gmv_max/video/get/") {
      if (!qq.store_authorized_bc_id || qq.store_id !== "S1") return reply(40002, null, "store_authorized_bc_id is required");
      if (videosOnlyViaIdentity) { const il = qq.identity_list ? JSON.parse(qq.identity_list) : []; if (!il.length || il[0].identity_id !== "ID1" || il[0].identity_type !== "TT_USER") return reply(0, { list: [], page_info: { page: 1, page_size: 10, total_number: 0, total_page: 1 } }); }
      const all = [1, 2, 3, 4, 5].map((n) => ({ item_id: "VID" + n, spu_id: "P1", text: "Video number " + n, identity_name: n === 5 ? "ben" : "amy", identity_id: "ID" + n, create_time: "2026-10-0" + n + " 10:00:00", authorization_status: n === 4 ? "AUTHORIZATION_NEEDED" : "AUTHORIZED", is_eligible: n !== 4 }));
      const page = Number(qq.page), size = 2; // gives fewer per page than asked
      return reply(0, { list: all.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: all.length, total_page: Math.ceil(all.length / size) } });
    }
    if (p === "/campaign/gmv_max/session/get/") {
      const ids = JSON.parse(qq.session_ids) as string[];
      return reply(0, { list: ids.map((id) => ({ session_id: id, status: id === "S-1" ? "BOOSTING" : "BOOSTED", item_ids: id === "S-1" ? ["V1", "V22"] : ["V1"] })) });
    }
    if (p === "/campaign/gmv_max/session/list/") {
      if (qq.campaign_id === "C3") return reply(40002, null, "This campaign has no creative boost");
      if (qq.campaign_id === "C2") return reply(0, { list: [] });
      return reply(0, { list: [{ session_id: "S-1", item_id: "V1", status: "ACTIVE", budget: "50.00", bid_type: "CUSTOM", schedule_type: "SCHEDULE_FROM_NOW", schedule_start_time: "2026-11-10 00:00:00", schedule_end_time: "2026-11-10 23:59:59" }, { session_id: "S-2", item_id: "V22", status: "ENDED", budget: "30", schedule_start_time: "2026-11-07 00:00:00", schedule_end_time: "2026-11-07 23:59:59" }] });
    }
    if (p === "/gmv_max/report/get/") {
      const dims = JSON.parse(qq.dimensions) as string[], mets = JSON.parse(qq.metrics) as string[];
      const start = qq.start_date, end = qq.end_date;
      if (end > LAST_OK_DAY) return reply(40002, null, "end_date can not be in the future");
      if (!JSON.parse(qq.store_ids).includes("S1")) return reply(40002, null, "Invalid store_ids");
      // TikTok's real rules (its own messages): product and creative results need the campaign (and product) named in the filter.
      const filt = (qq.filtering ? JSON.parse(qq.filtering) : {}) as { campaign_ids?: string[]; item_group_ids?: string[] };
      const creativeLevel = dims.includes("item_id"), productLevel = dims.includes("item_group_id") && !creativeLevel;
      if (creativeLevel && (!filt.campaign_ids?.length || !filt.item_group_ids?.length)) return reply(40002, null, "Creative level report must have at least 1 campaign ID and 1 item group ID, please correct the filters.");
      if (productLevel && !filt.campaign_ids?.length) return reply(40002, null, "Item level report must have at least 1 campaign ID, please correct the campaign_id filter.");
      if (productLevel && filt.campaign_ids!.length > maxCampaignIds) return reply(40002, null, "Invalid param: campaign_ids can hold at most " + maxCampaignIds + " ids");
      if (rejectProductDim && creativeLevel && dims.includes("item_group_id")) return reply(40002, null, "Invalid dimensions: item_group_id can not be used with item_id");
      if (oldestAllowed && start < oldestAllowed && (creativeLevel || productLevel)) return reply(40002, null, "The date range is out of the allowed limit");
      if (mets.includes("PROBE_METRIC")) return reply(40002, null, "metrics.0: value is not one of the allowed values, value is PROBE_METRIC ,correct is cost, orders, gross_revenue, roi, creative_delivery_status, exploration_status, boost_status, creative_boost_state (request X)");
      if (dims.includes("PROBE_DIM")) return reply(40002, null, "dimensions.0: value is not one of the allowed values, value is PROBE_DIM ,correct is campaign_id, item_id, item_group_id, stat_time_day");
      const bad = mets.find((m) => !ACCEPTED.includes(m));
      if (bad) return reply(40002, null, "Invalid metric: " + bad);
      const lines: unknown[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (d < FIRST_AD_DAY) continue;
        for (const camp of filt.campaign_ids ?? ["C1", "C2"]) {
          const items = creativeLevel ? ["V1", "V22"] : productLevel ? ["P1"] : [""];
          for (const it of items) {
            const v = val(camp, d, it) as Record<string, string>;
            v.product_impressions = "1000"; v.product_clicks = "50"; v.title = "Video " + it; v.creative_delivery_status = it === "V1" ? "DELIVERING" : "AUTHORIZATION_NEEDED"; v.tt_account_authorization_type = "AFFILIATE"; v.exploration_status = it === "V1" ? "OUTSTANDING" : "UNDERPERFORMING"; v.boost_status = it === "V1" ? "BOOSTED" : "NOT_BOOSTED";
            if (bump[`${camp}|${d}`] && !it) v.gross_revenue = bump[`${camp}|${d}`];
            const m: Record<string, string> = Object.fromEntries(mets.map((k) => [renameMetrics ? "x_" + k : k, v[k] ?? ""]));
            const dm: Record<string, string> = { stat_time_day: d + " 00:00:00" };
            if (dims.includes("campaign_id")) dm.campaign_id = camp;
            if (creativeLevel) dm.item_id = it;
            if (dims.includes("item_group_id")) dm.item_group_id = creativeLevel ? filt.item_group_ids![0] : it;
            lines.push({ dimensions: dm, metrics: m });
          }
        }
      }
      const page = Number(qq.page), size = Number(qq.page_size);
      return reply(0, { list: lines.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: lines.length, total_page: Math.max(1, Math.ceil(lines.length / size)) } });
    }
    if (p === "/campaign/gmv_max/session/create/") {
      const b = body as { store_id?: string; campaign_id?: string; session?: { bid_type?: string; item_id?: string; budget?: number; product_list?: { spu_id?: string }[] } };
      const se = b.session ?? {};
      if (se.bid_type !== "CREATIVE_NO_BID" || !se.item_id || se.product_list?.length !== 1 || !se.product_list[0].spu_id || !b.store_id || !b.campaign_id) return reply(40002, null, "session: missing or wrong fields");
      if (Number(se.budget) < 10) return reply(40002, null, "session.budget: value must be at least 10");
      return reply(0, { session_id: "NEW-" + seen.filter((x) => x.path === "/campaign/gmv_max/session/create/").length });
    }
    if (p === "/campaign/gmv_max/session/delete/") { const b = body as { session_id?: string; advertiser_id?: string }; return b.session_id && b.advertiser_id ? reply(0, {}) : reply(40002, null, "session_id is required"); }
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
  check("check: ad accounts, shops, campaigns, results, status values, allowed names, videos and boosts all answer", chk.checks.length === 8 && chk.checks.every((c) => c.ok), JSON.stringify(chk.checks.filter((c) => !c.ok)));
  check("accounts list: the login goes in the Access-Token header, never in the web address, and the app id and secret are sent", seen.filter((x) => x.path === "/oauth2/advertiser/get/").every((x) => x.headers["access-token"] === "AT123" && !x.q.access_token && x.q.app_id === "APP1" && x.q.secret === "s3cret"));
  const allowed = chk.checks.find((c) => c.name.startsWith("Allowed report"));
  check("check: TikTok's lists of allowed metrics and dimensions are read from its own message", !!allowed?.ok && /exploration_status/.test(allowed.sample ?? "") && /item_group_id/.test(allowed.sample ?? "") && /"product metrics"/.test(allowed.sample ?? ""), String(allowed?.sample).slice(0, 300));
  check("check: it lists the accounts and the field names TikTok sent", chk.accounts.length === 2 && chk.accounts[0].name === "ALOOMA" && !!chk.checks.find((c) => c.name.startsWith("Campaign results"))?.fields?.includes("cost"));

  // ── a full sync ──
  const r1 = await S.runAdsAll("manual", null, deps);
  check("sync: every dataset finishes", r1.length === 8 && r1.every((r) => r.status === "ok"), JSON.stringify(r1.map((r) => [r.dataset, r.status, r.error])));
  check("sync: ad accounts and shops saved", (await count("ads_advertisers")) === 2 && (await count("ads_stores")) === 1);
  const a1 = (await q(sql`select name, currency, timezone from ads_advertisers where advertiser_id = '111'`))[0];
  check("sync: account details are mapped", a1.name === "ALOOMA" && a1.currency === "MYR" && a1.timezone === "Asia/Kuala_Lumpur");
  check("sync: one account TikTok refuses does not stop the others, and it is reported", /1 of 2 account.*skipped/.test(String(r1.find((r) => r.dataset === "stores")?.error)), String(r1.find((r) => r.dataset === "stores")?.error));
  check("sync: all campaigns saved across pages (page size stepped down, rate limit waited out)", (await count("ads_campaigns")) === 3, `${await count("ads_campaigns")} ${JSON.stringify(r1.find((r) => r.dataset === "campaigns"))}`);
  const camp = (await q(sql`select name, status, promotion_type, budget::float8 as budget, roas_target::float8 as roas, store_id from ads_campaigns where campaign_id = 'C1'`))[0];
  check("sync: campaign fields are mapped", camp.name === "Pillow GMV Max" && camp.status === "ENABLE" && camp.promotion_type === "PRODUCT_GMV_MAX" && camp.budget === 200 && camp.roas === 4.5 && camp.store_id === "S1");
  const nDays = Math.round((Date.parse(TODAY) - Date.parse(FIRST_AD_DAY)) / 86400_000) + 1;
  check("history: the first sync reads back to the first ad day, then stops after empty months", (await count("ads_campaign_daily")) === nDays * 2, `${await count("ads_campaign_daily")} vs ${nDays * 2}`);
  const first = (await q(sql`select min(day)::text as a, max(day)::text as b from ads_campaign_daily`))[0];
  check("history: oldest and newest day are right", first.a === FIRST_AD_DAY && first.b === TODAY, JSON.stringify(first));
  const cd = (await q(sql`select cost::float8 as cost, orders, gross_revenue::float8 as rev, roi::float8 as roi from ads_campaign_daily where campaign_id = 'C1' and day = '2026-11-10'`))[0];
  const exp = (() => { const n = (Date.parse("2026-11-10T00:00:00Z") / 86400_000) % 7 + 1; return { cost: n * 10, orders: n, rev: n * 40 }; })();
  check("results: numbers sent as text are saved as numbers", cd.cost === exp.cost && cd.orders === exp.orders && cd.rev === exp.rev && cd.roi === 4, JSON.stringify(cd));
  check("product results: asked per campaign (TikTok refuses them otherwise), one row per campaign, product and day", (await count("ads_product_daily")) === nDays * 2 && (await q(sql`select 1 from ads_product_daily where campaign_id = 'C1' and product_id = 'P1' and day = '2026-11-10'`)).length === 1, String(await count("ads_product_daily")));
  check("creative results: asked per campaign and product (TikTok refuses them otherwise), one row per video, product, campaign and day", (await count("ads_creative_daily")) === nDays * 4 && (await q(sql`select 1 from ads_creative_daily where creative_id = 'V1' and campaign_id = 'C1' and product_id = 'P1' limit 1`)).length === 1, String(await count("ads_creative_daily")));
  const cr = (await q(sql`select title, impressions::int as imp, clicks::int as clk, cost_per_order::float8 as cpo from ads_creative_daily where creative_id = 'V1' limit 1`))[0];
  check("creative results: the extra numbers TikTok accepts are saved (title, impressions, clicks, cost per order)", cr.title === "Video V1" && cr.imp === 1000 && cr.clk === 50 && cr.cpo === 10, JSON.stringify(cr));
  const support = (await q(sql`select value from settings where key = 'tiktok_ads_metrics'`))[0]?.value as Record<string, string[]> | undefined;
  const expl = (await q(sql`select exploration_status, boost_status, authorization_type from ads_creative_daily where creative_id = 'V1' limit 1`))[0];
  check("creative results: the exploration status and boost status are found from TikTok's own list of allowed metrics and saved", expl.exploration_status === "OUTSTANDING" && expl.boost_status === "BOOSTED" && expl.authorization_type === "AFFILIATE", JSON.stringify(expl));
  const dl = (await q(sql`select delivery_status from ads_creative_daily where creative_id = 'V1' limit 1`))[0];
  check("creative results: the delivery status TikTok gives (Delivering, Learning, Authorization needed…) is saved", dl.delivery_status === "DELIVERING", JSON.stringify(dl));
  await q(sql`update settings set value = jsonb_set(value, '{_sig_product}', '["old"]'::jsonb) where key = 'tiktok_ads_metrics'`);
  const probesBefore = seen.filter((x) => x.path === "/gmv_max/report/get/" && x.q.page_size === "1").length;
  await S.runAdsDataset("product_daily", "manual", null, deps);
  // ── GMV Max screens: every video judged on all of its history (own rows, so the dates are always relative to today) ──
  const VA = await import("../src/lib/ads/vault");
  const GR = await import("../src/lib/ads/groups");
  const IN = await import("../src/lib/ads/insights");
  const RG = await import("../src/lib/range");
  const ST = await import("../src/lib/ads/status");
  const { todayKL } = await import("../src/lib/time");
  const wipeBT = async () => { await q(sql`delete from ads_creative_daily where advertiser_id = 'BT'`); await q(sql`delete from ads_campaign_daily where advertiser_id = 'BT'`); await q(sql`delete from tt_videos where video_id in ('bt-ORG', 'bt-B')`); await q(sql`delete from ads_auth_asks where creator = 'bt_locked'`); await q(sql`delete from ads_boost_batches where note = 'bt-test'`); };
  await wipeBT();
  const mk = (id: string, status: string | null, cost: number, orders: number, rev: number, fromAgo: number, toAgo: number) => q(sql`insert into ads_creative_daily (advertiser_id, campaign_id, product_id, creative_id, day, cost, orders, gross_revenue, delivery_status) select 'BT', 'BC', 'BP', ${id}, (${todayKL()}::date - g), ${cost}, ${orders}, ${rev}, ${status} from generate_series(${toAgo}::int, ${fromAgo}::int) g`);
  await mk("bt-A", "DELIVERING", 10, 3, 150, 4, 0);          // good and running
  await mk("bt-S", null, 10, 3, 150, 34, 30);                // good, stopped a month ago
  await mk("bt-I", "NOT_DELIVERYING", 10, 3, 150, 4, 0);     // good, TikTok says not delivering
  await mk("bt-P", null, 5, 1, 80, 40, 40);                  // one sale at good ROI, then dropped
  await mk("bt-B", "AUTHORIZATION_NEEDED", 10, 3, 150, 4, 0);
  await mk("bt-W", "DELIVERING", 10, 0, 2, 4, 0);            // spends, poor ROI
  await mk("bt-N", null, 0, 0, 0, 2, 0);                     // in ads, never spent
  await mk("bt-R", "REJECTED", 10, 3, 150, 4, 0);            // TikTok rejected it for good
  await mk("bt-G", "NOT_DELIVERYING", 0.5, 1, 40, 3, 3);     // 3 orders from pennies, GMV Max ignored it
  await mk("bt-G3", "NOT_DELIVERYING", 0.7, 1, 30, 20, 18);  // 3 orders from pennies, 18 days ago
  await q(sql`insert into tt_videos (video_id, creator, title, gmv) values ('bt-B', 'bt_locked', 'Locked seller', 0)`);
  await q(sql`insert into tt_videos (video_id, creator, title, gmv) values ('bt-ORG', 'bt_creator', 'Sells alone', 500)`);
  const vt = await VA.vault({ minRoi: 5, minOrders: 10, idleDays: 7 });
  const grp = (id: string) => vt.videos.find((x) => x.creativeId === id)?.group;
  check("gmv max: a proven video with no spend for days is 'Stopped While Selling'; one that spent today is not, even if TikTok says 'not delivering'", grp("bt-S") === "stopped" && grp("bt-I") !== "stopped", `${grp("bt-S")} ${grp("bt-I")}`);
  check("gmv max: a video that sold a little at good ROI and was left alone is a 'Hidden Gem', not thrown away", grp("bt-P") === "gem" && grp("bt-G") === "gem" && grp("bt-G3") === "gem", `${grp("bt-P")} ${grp("bt-G")} ${grp("bt-G3")}`);
  check("gmv max: a video that sold but needs the creator's authorization is 'Authorization Rescue'; rejected is 'Blocked'; a money loser is 'Wasting Money'", grp("bt-B") === "rescue" && grp("bt-R") === "blocked" && grp("bt-W") === "wasting", `${grp("bt-B")} ${grp("bt-R")} ${grp("bt-W")}`);
  check("gmv max: a good video that is still running is not put in a stopped group", ["winning", "underfed"].includes(String(grp("bt-A"))), String(grp("bt-A")));
  const org = vt.videos.find((x) => x.creativeId === "bt-ORG");
  check("gmv max: never used with nothing visible is 'No Signal Yet'; never used but selling on its own is 'Worth Exploring'", grp("bt-N") === "never" && org?.group === "explore" && org.organicGmv === 500 && org.creator === "bt_creator" && /on its own/.test(org.why), `${grp("bt-N")} ${JSON.stringify(org && [org.group, org.organicGmv, org.why])}`);
  check("gmv max: the groups count every video once", Object.values(vt.counts).reduce((a2, b2) => a2 + b2, 0) === vt.videos.length);
  // ── the estimate of TikTok's Exploration status, the potential score, evidence and the fair test amount (pure) ──
  const EX = await import("../src/lib/ads/explore");
  const base = { cost: 50, orders: 10, roi: 8, campRoi: 8, ageDays: 40, revPct: 0.5, status: "DELIVERING" as string | null };
  check("exploration estimate: TikTok's own words win (authorization needed, unavailable), a learning video is exploring, an unspent one is unused", EX.estimateExploration({ ...base, status: "AUTHORIZATION_NEEDED" }) === "locked" && EX.estimateExploration({ ...base, status: "REJECTED" }) === "unavailable" && EX.estimateExploration({ ...base, status: "LEARNING" }) === "exploring" && EX.estimateExploration({ ...base, cost: 0 }) === "unused");
  check("exploration estimate: top sellers of the campaign with good ROI are Outstanding; a funded video near its campaign's ROI is Performing", EX.estimateExploration({ ...base, revPct: 0.97 }) === "outstanding" && EX.estimateExploration(base) === "performing");
  check("exploration estimate: a video TikTok barely showed (pennies of spend, not new) is Underperforming, as in your export; a brand new one is not judged yet", EX.estimateExploration({ ...base, cost: 0.3, orders: 0, roi: 0, ageDays: 60 }) === "underperforming" && EX.estimateExploration({ ...base, cost: 0.8, orders: 0, roi: 0, ageDays: 3 }) === "performing");
  check("exploration estimate: it says how close it is to TikTok's real label", EX.EST_ACCURACY.match > 0.7 && /estimate/i.test(EX.EST_NOTE));
  check("potential: a few orders from pennies still scores well; many orders at the same ROI score higher; fading and already-funded videos score lower", GR.potentialOf({ cost: 2, revenue: 155, orders: 4, roiNow: true, fading: false, hasRoom: true }, 10) >= 60 && GR.potentialOf({ cost: 200, revenue: 15500, orders: 400, roiNow: true, fading: false, hasRoom: true }, 10) > GR.potentialOf({ cost: 2, revenue: 155, orders: 4, roiNow: true, fading: false, hasRoom: true }, 10) && GR.potentialOf({ cost: 2, revenue: 155, orders: 4, roiNow: true, fading: true, hasRoom: true }, 10) < 30 && GR.potentialOf({ cost: 2, revenue: 155, orders: 4, roiNow: true, fading: false, hasRoom: false }, 10) < GR.potentialOf({ cost: 2, revenue: 155, orders: 4, roiNow: true, fading: false, hasRoom: true }, 10));
  check("evidence and fair test: orders decide the proof (none, few, some, many); a fair first budget is about 5 orders at its cost per order, never below RM 5", GR.evidenceOf(0) === "none" && GR.evidenceOf(2) === "low" && GR.evidenceOf(8) === "medium" && GR.evidenceOf(40) === "high" && GR.fairTestAmount(null) === 5 && GR.fairTestAmount(0.5) === 5 && GR.fairTestAmount(3) === 15 && GR.fairTestAmount(2.1) === 10.5);
  check("explore potential: unused videos never score above 60 (the least proven kind), and the more visible sales or views the higher", GR.explorePotential(500, 0, 500, 1000) === 60 && GR.explorePotential(50, 0, 500, 1000) < GR.explorePotential(500, 0, 500, 1000) && GR.explorePotential(0, 0, 500, 1000) === 0);
  const gv = vt.videos.find((x) => x.creativeId === "bt-G");
  check("gmv max: the vault gives every video an estimated status, a potential, the proof and a fair test amount", !!gv && gv.est === "underperforming" || gv?.est === "performing", JSON.stringify(gv && [gv.est, gv.potential, gv.evidence, gv.testAmount]));
  check("gmv max: a hidden gem has a high potential, low proof and a fair test of at least RM 5", !!gv && gv.potential >= 40 && gv.evidence === "low" && gv.testAmount >= 5, JSON.stringify(gv && [gv.potential, gv.evidence, gv.testAmount]));
  const RS = await import("../src/lib/ads/rescue");
  await q(sql`insert into ads_auth_asks (creator, asked_by, video_count) values ('bt_locked', 'Test Owner', 1)`);
  const resc = await RS.rescueData();
  const rcr = resc.creators.find((c) => c.creator === "bt_locked");
  check("authorization rescue: locked videos that sold are grouped by their creator with their sales, and show when the creator was asked", !!rcr && rcr.videos.length === 1 && rcr.orders === 15 && rcr.revenue === 750 && !!rcr.askedAt && rcr.askedBy === "Test Owner" && resc.totalVideos >= 1, JSON.stringify(rcr && [rcr.videos.length, rcr.orders, rcr.revenue, rcr.askedAt]));
  const F = { cost: 100, orders: 20, revenue: 1000, cost7: 30, revenue7: 60, daysSinceSpend: 0, blocked: false, locked: false, organic: 0, views: 0, cpo: 5, peerCpo: 5, typical7: 20 };
  const RU = { minRoi: 5, minOrders: 10, idleDays: 7 };
  check("gmv max rules: a good video whose last 7 days are far below its own ROI is 'Fading'; one with tiny recent spend is 'Selling, Low Spend'", GR.classify(F, RU).group === "fading" && GR.classify({ ...F, cost7: 3, revenue7: 40 }, RU).group === "underfed" && GR.classify({ ...F, revenue7: 320 }, RU).group === "winning");
  check("gmv max: statuses are read in plain words, TikTok's own spelling included", ST.STATUS_LABEL.NOT_DELIVERYING === "Not delivering" && ST.isBlocked("UNAVAILABLE") && !ST.isBlocked("LEARNING") && !ST.isBlocked(null));
  // Boost Log: a batch boosted 2 days ago with bt-A. Before = the 7 days before, after = from the boost date.
  const [bb] = await q(sql`insert into ads_boost_batches (boosted_on, days, total_budget, note) values ((${todayKL()}::date - 2), 1, 35, 'bt-test') returning id::int as id`) as { id: number }[];
  await q(sql`insert into ads_boost_batch_videos (batch_id, creative_id, product_id, budget) values (${bb.id}, 'bt-A', 'BP', 35)`);
  const lg = (await IN.boostLog(RG.makeRange("lifetime", null, todayKL()))).find((x) => x.id === bb.id);
  check("boost log: results before and after the boost date are compared, per day", !!lg && lg.before.revenue === 300 && lg.after.revenue === 450 && lg.afterDays === 3 && lg.verdict === "better" && lg.videos.length === 1, JSON.stringify(lg && [lg.before.revenue, lg.after.revenue, lg.afterDays, lg.verdict]));
  check("gmv max: a video in the Boost Log shows when you last boosted it", !!(await VA.vault({ minRoi: 5, minOrders: 10, idleDays: 7 })).videos.find((x) => x.creativeId === "bt-A")?.lastLogged);
  // Date ranges
  const T = "2026-11-11"; // a Wednesday
  const rr = (r: Record<string, string>, d = "7d" as const) => RG.resolveRange(r, T, d);
  check("date range: quick choices (today, yesterday, last 7, this week, last week, this month, last month, lifetime)", [rr({ range: "today" }), rr({ range: "yesterday" }), rr({ range: "7d" }), rr({ range: "this_week" }), rr({ range: "last_week" }), rr({ range: "this_month" }), rr({ range: "last_month" }), rr({ range: "lifetime" })].map((r) => `${r.from}..${r.to}`).join(" ") === "2026-11-11..2026-11-11 2026-11-10..2026-11-10 2026-11-05..2026-11-11 2026-11-09..2026-11-11 2026-11-02..2026-11-08 2026-11-01..2026-11-11 2026-10-01..2026-10-31 null..2026-11-11", [rr({ range: "this_week" }), rr({ range: "last_month" })].map((r) => `${r.from}..${r.to}`).join(" "));
  const cu = rr({ range: "custom", from: "2026-10-01", to: "2026-10-10" });
  check("date range: a custom range is compared with the period of the same length just before; lifetime has none; the future is cut back to today; nonsense falls back", cu.days === 10 && cu.prevFrom === "2026-09-21" && cu.prevTo === "2026-09-30" && rr({ range: "lifetime" }).prevFrom === null && rr({ range: "custom", from: "2026-10-01", to: "2030-01-01" }).to === T && rr({ range: "custom", from: "2026-10-09", to: "2026-10-01" }).from === "2026-10-01" && rr({ range: "nope" }).key === "7d" && rr({}, "lifetime" as never).key === "lifetime" && RG.rangeSuffix({ range: "custom", from: "2026-10-01", to: "2026-10-10" }) === "&range=custom&from=2026-10-01&to=2026-10-10" && RG.rangeSuffix({}) === "");
  // the range changes the numbers on Boost Picks (group stays all history)
  const vr = await VA.vault({ minRoi: 5, minOrders: 10, idleDays: 7 }, RG.makeRange("custom", todayKL(), todayKL()));
  const vA = vr.videos.find((x) => x.creativeId === "bt-A"), vS = vr.videos.find((x) => x.creativeId === "bt-S");
  check("date range: Boost Picks numbers follow the dates (bt-A spent RM 10 today, bt-S nothing today) while the group stays the same", vA?.rCost === 10 && vA.cost === 50 && vS?.rCost === 0 && vS.cost > 0 && vS.group === "stopped", JSON.stringify([vA?.rCost, vA?.cost, vS?.rCost, vS?.group]));
  // Campaign Health
  await q(sql`insert into ads_campaign_daily (advertiser_id, campaign_id, day, cost, orders, gross_revenue) select 'BT', 'bt-NS', (${todayKL()}::date - g), 20, 0, 0 from generate_series(0, 4) g`);
  await q(sql`insert into ads_campaign_daily (advertiser_id, campaign_id, day, cost, orders, gross_revenue) select 'BT', 'bt-ST', (${todayKL()}::date - g), 20, 2, 200 from generate_series(8, 12) g`);
  const ch = await IN.campaignHealth(RG.lastNDays(todayKL(), 7));
  const hOf = (id: string) => ch.campaigns.find((c) => c.id === id)?.health;
  check("campaign health: spending with no orders is 'No Sales'; one that spent last week and nothing now is 'Stopped Spending'", hOf("bt-NS") === "nosales" && hOf("bt-ST") === "stopped", `${hOf("bt-NS")} ${hOf("bt-ST")}`);
  const td = await IN.adsToday(RG.lastNDays(todayKL(), 7));
  check("ads today: alerts name the campaign with no sales, and golden videos are counted", td.alerts.some((a2) => /No Orders/.test(a2.title) && /bt-NS/.test(a2.title)) && td.opportunities.find((o) => o.key === "stopped")!.count >= 1 && td.series.length === 7 && td.rangeKpi.cost >= 0 && (await IN.adsToday(RG.makeRange("lifetime", null, todayKL()))).series.length === 120, JSON.stringify(td.alerts.map((a2) => a2.title)));
  const vd = await IN.videoDetail("bt-A");
  check("video detail: 60 days of results, where it ran, and its boost history", !!vd && vd.series.length === 60 && vd.campaigns.length === 1 && vd.sent.length > 0 && vd.sent[0].delivery === "DELIVERING" && vd.logged.length === 1 && (await IN.videoDetail("nope")) === null);
  const sc = await IN.creatorScoreboard(RG.makeRange("lifetime", null, todayKL()));
  check("creator scoreboard: a creator's unused golden videos are counted", sc.creators.find((c) => c.creator === "bt_creator")?.golden === 1, JSON.stringify(sc.creators.find((c) => c.creator === "bt_creator")));
  await wipeBT();


  // ── creating and stopping a boost from the app (a pretend TikTok; the real one is never called) ──
  const BW = await import("../src/lib/tiktok-ads/boost-write");
  const wipeBW = async () => { await q(sql`delete from ads_stores where advertiser_id = 'BW'`); await q(sql`delete from ads_boost_actions`); await q(sql`delete from ads_boost_batches where note = 'Created in the app'`); await q(sql`delete from ads_creative_daily where advertiser_id = 'BW'`); await q(sql`delete from ads_campaigns where advertiser_id = 'BW'`); await q(sql`delete from settings where key = 'ads_boost_write'`); };
  await wipeBW();
  await q(sql`insert into ads_campaigns (advertiser_id, campaign_id, store_id, name, status, promotion_type) values ('BW', 'BWC', 'BWS', 'Boost test campaign', 'ENABLE', 'PRODUCT_GMV_MAX'), ('BW', 'BWL', 'BWS', 'Live campaign', 'ENABLE', 'LIVE_GMV_MAX'), ('BW', 'BWD', 'BWS', 'Off campaign', 'DISABLE', 'PRODUCT_GMV_MAX')`);
  const mkw = (id: string, status: string | null, camp = "BWC") => q(sql`insert into ads_creative_daily (advertiser_id, campaign_id, product_id, creative_id, day, cost, orders, gross_revenue, delivery_status) select 'BW', ${camp}, 'BWP', ${id}, (${todayKL()}::date - g), 5, 2, 90, ${status} from generate_series(0, 3) g`);
  for (const v of ["bw-1", "bw-2", "bw-3", "bw-4"]) await mkw(v, "NOT_DELIVERYING");
  await mkw("bw-auth", "AUTHORIZATION_NEEDED"); await mkw("bw-live", "DELIVERING", "BWL");
  const sent = (path: string) => seen.filter((x) => x.path === path);
  const U = { user: "Test Owner" };
  const mk1 = (item: string, budget: number, days: number | null = null, camp = "BWC") => BW.createBoost({ itemId: item, advertiserId: "BW", campaignId: camp, budget, days, ...U }, deps);
  const before0 = sent("/campaign/gmv_max/session/create/").length;
  const off = await mk1("bw-1", 20);
  check("boost from the app: switched off until the owner turns it on; TikTok is not asked", !off.ok && /switched off/.test((off as { error: string }).error) && sent("/campaign/gmv_max/session/create/").length === before0, JSON.stringify(off));
  const def = await BW.getBoostWriteSettings();
  check("boost from the app: defaults are off, RM 30 for one boost, RM 50 for all", def.enabled === false && def.maxBudget === 30 && def.dailyCap === 50);
  const sv = await BW.saveBoostWriteSettings({ enabled: true, maxBudget: 30, dailyCap: 50 });
  check("boost from the app: settings are saved; the all-boosts limit can never be below the one-boost limit", sv.enabled && (await BW.saveBoostWriteSettings({ maxBudget: 80 })).dailyCap === 80 && (await BW.saveBoostWriteSettings({ maxBudget: 30, dailyCap: 50 })).maxBudget === 30);
  const opt = await BW.boostOptions("bw-1");
  check("boost options: only Product GMV Max campaigns that are not switched off, where the video ran", opt.campaigns.length === 1 && opt.campaigns[0].campaignId === "BWC" && opt.campaigns[0].storeId === "BWS" && opt.campaigns[0].productId === "BWP" && opt.campaigns[0].ranHere && opt.blockers.length === 0, JSON.stringify(opt));
  check("boost options: a video TikTok will not boost, and a video that is in no campaign, say so before asking TikTok", /Authorization/i.test((await BW.boostOptions("bw-auth")).blockers.join(" ")) && /no campaign in the synced results/.test((await BW.boostOptions("bw-nowhere")).blockers.join(" ")) && (await BW.boostOptions("bw-live")).campaigns.length === 0);
  await mkw("bw-off", "NOT_DELIVERYING", "BWD"); await mkw("bw-unknown", "NOT_DELIVERYING", "BWX");
  const offB = (await BW.boostOptions("bw-off")).blockers.join(" "), unkB = (await BW.boostOptions("bw-unknown")).blockers.join(" "), liveB = (await BW.boostOptions("bw-live")).blockers.join(" ");
  check("boost options: when a campaign cannot be used, the page says why (switched off, not synced, LIVE)", /Off campaign.*switched off in TikTok/.test(offB) && /not in the synced campaign list/.test(unkB) && /LIVE GMV Max/.test(liveB), JSON.stringify([offB, unkB, liveB]));
  await q(sql`update ads_campaigns set store_id = null where advertiser_id = 'BW' and campaign_id = 'BWC'`); await q(sql`insert into ads_stores (advertiser_id, store_id, store_name) values ('BW', 'BWS2', 'Test shop') on conflict do nothing`);
  const viaStore = await BW.boostOptions("bw-1");
  check("boost options: when TikTok's campaign list gave no shop, the shop saved for the account is used", viaStore.campaigns.length === 1 && viaStore.campaigns[0].storeId === "BWS2", JSON.stringify(viaStore.campaigns));
  await q(sql`update ads_campaigns set store_id = 'BWS' where advertiser_id = 'BW' and campaign_id = 'BWC'`); await q(sql`delete from ads_stores where advertiser_id = 'BW'`);
  const tooBig = await mk1("bw-1", 40);
  check("boost from the app: more than the one-boost limit is refused before TikTok is asked", !tooBig.ok && /limit of RM 30/.test((tooBig as { error: string }).error) && sent("/campaign/gmv_max/session/create/").length === before0, JSON.stringify(tooBig));
  const bwr1 = await mk1("bw-1", 20);
  const body1 = sent("/campaign/gmv_max/session/create/").at(-1)?.body as { advertiser_id: string; campaign_id: string; store_id: string; session: Record<string, unknown> };
  check("boost from the app: creates the boost the way TikTok documents it (CREATIVE_NO_BID, one product, the video, budget, from now)", bwr1.ok && body1.advertiser_id === "BW" && body1.campaign_id === "BWC" && body1.store_id === "BWS" && body1.session.bid_type === "CREATIVE_NO_BID" && JSON.stringify(body1.session.product_list) === '[{"spu_id":"BWP"}]' && body1.session.item_id === "bw-1" && body1.session.budget === 20 && body1.session.schedule_type === "SCHEDULE_FROM_NOW" && !("schedule_end_time" in body1.session), JSON.stringify([bwr1, body1]));
  const lg1 = (await q(sql`select ok, session_id, budget::float8 as b, user_name from ads_boost_actions where item_id = 'bw-1' and action = 'create' order by id desc limit 1`))[0];
  check("boost from the app: the try is kept (who, which video, how much, TikTok's session)", lg1.ok === true && String(lg1.session_id).startsWith("NEW-") && Number(lg1.b) === 20 && lg1.user_name === "Test Owner");
  check("boost from the app: it also enters the Boost Log, so before and after can be compared", Number((await q(sql`select count(*)::int as n from ads_boost_batch_videos v join ads_boost_batches b on b.id = v.batch_id where v.creative_id = 'bw-1' and b.note = 'Created in the app'`))[0].n) === 1);
  const again = await mk1("bw-1", 10);
  check("boost from the app: the same video cannot be boosted twice at once", !again.ok && /already running|just boosted/.test((again as { error: string }).error), JSON.stringify(again));
  const bwr2 = await mk1("bw-2", 10, 3);
  const body2 = sent("/campaign/gmv_max/session/create/").at(-1)?.body as { session: Record<string, string> };
  check("boost from the app: a boost for some days has an end time in UTC, in TikTok's format", bwr2.ok && body2.session.schedule_type === "SCHEDULE_START_END" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(body2.session.schedule_end_time), JSON.stringify(body2));
  const over = await mk1("bw-3", 25);
  check("boost from the app: all boosts started here together may not pass the daily limit", !over.ok && /limit of RM 50/.test((over as { error: string }).error), JSON.stringify(over));
  const calls3 = sent("/campaign/gmv_max/session/create/").length;
  const small = await mk1("bw-3", 5);
  check("boost from the app: TikTok's refusal is shown as TikTok said it, kept, and not counted as spending", !small.ok && /^TikTok said no \(40002\): session\.budget: value must be at least 10$/.test((small as { error: string }).error) && sent("/campaign/gmv_max/session/create/").length === calls3 + 1 && Number((await q(sql`select coalesce(sum(budget), 0)::float8 as n from ads_boost_actions where action = 'create' and ok and stopped_at is null`))[0].n) === 30, JSON.stringify(small));
  check("boost from the app: a video with a status TikTok refuses is not sent to TikTok", !(await mk1("bw-auth", 10)).ok && sent("/campaign/gmv_max/session/create/").length === calls3 + 1);
  const sid = (bwr1 as { sessionId: string }).sessionId;
  const st = await BW.stopBoost(sid, "Test Owner", deps);
  const del = sent("/campaign/gmv_max/session/delete/").at(-1)?.body as { advertiser_id: string; session_id: string };
  check("stop: asks TikTok to delete that session and marks it stopped", st.ok && del.session_id === sid && del.advertiser_id === "BW" && (await q(sql`select 1 from ads_boost_actions where session_id = ${sid} and action = 'create' and stopped_at is not null`)).length === 1, JSON.stringify([st, del]));
  const bwr3 = await mk1("bw-3", 30);
  check("stop: the stopped boost's budget is free again, so another can start", bwr3.ok, JSON.stringify(bwr3));
  check("stop: an unknown session is refused with a clear message", !(await BW.stopBoost("nope", "Test Owner", deps)).ok);
  const acts = await BW.recentBoostActions(50);
  check("boost from the app: the log lists creates, refusals and stops", acts.some((a) => a.action === "stop" && a.ok) && acts.some((a) => a.action === "create" && !a.ok) && acts.some((a) => a.action === "create" && a.ok));
  await wipeBW();

  check("metric discovery: a changed list of names is asked about again, an unchanged one is not", seen.filter((x) => x.path === "/gmv_max/report/get/" && x.q.page_size === "1").length > probesBefore);
  const probesMid = seen.filter((x) => x.path === "/gmv_max/report/get/" && x.q.page_size === "1").length;
  await S.runAdsDataset("product_daily", "manual", null, deps);
  check("metric discovery: remembered answers are reused", seen.filter((x) => x.path === "/gmv_max/report/get/" && x.q.page_size === "1").length === probesMid);
  check("metric discovery: only the optional names TikTok accepts are remembered", JSON.stringify([...(support?.creative ?? [])].sort()) === JSON.stringify(["cost_per_order", "product_impressions", "product_clicks", "title", "creative_delivery_status", "exploration_status", "boost_status", "tt_account_authorization_type"].sort()) && !(support?.product ?? []).includes("tt_account_name") && !(support?.product ?? []).includes("title"), JSON.stringify(support));
  const realReports = seen.filter((x) => x.path === "/gmv_max/report/get/" && x.q.page_size !== "1");
  check("requests: after discovery every report asks only for metrics TikTok accepts", realReports.every((x) => (JSON.parse(x.q.metrics) as string[]).every((m) => ACCEPTED.includes(m))));
  check("requests: product and creative requests always name their campaign (and product)", realReports.filter((x) => JSON.parse(x.q.dimensions).includes("item_id")).every((x) => { const f = JSON.parse(x.q.filtering); return f.campaign_ids.length === 1 && f.item_group_ids.length === 1; }) && realReports.filter((x) => JSON.parse(x.q.dimensions).includes("item_group_id") && !JSON.parse(x.q.dimensions).includes("item_id")).every((x) => JSON.parse(x.q.filtering).campaign_ids.length >= 1));
  const reqs = seen.filter((s) => s.path === "/gmv_max/report/get/");
  const vids = (await q(sql`select item_id, username, authorization_status, eligible, posted_at is not null as has_date, spu_id from ads_videos order by item_id`));
  check("videos: all pages of the video list saved (TikTok gave fewer per page than asked), with the creator, authorization and eligibility", vids.length === 5 && vids[0].username === "amy" && vids[4].username === "ben" && vids[3].authorization_status === "AUTHORIZATION_NEEDED" && vids[3].eligible === false && vids[0].eligible === true && vids[0].has_date === true && vids[0].spu_id === "P1", JSON.stringify(vids));
  check("videos: asked with the shop and its Business Center id", seen.filter((x) => x.path === "/gmv_max/video/get/").every((x) => x.q.store_id === "S1" && x.q.store_authorized_bc_id === "B1"));
  const bst = (await q(sql`select session_id, campaign_id, item_id, status, budget::float8 as budget, starts_at is not null as has_start from ads_boosts order by session_id`));
  check("boosts: the sessions of each campaign saved with item, status (from the detail call), budget and schedule; a campaign TikTok refuses is skipped and reported", bst.length === 2 && bst[0].campaign_id === "C1" && bst[0].item_id === "V1" && bst[0].budget === 50 && bst[0].has_start === true && bst[0].status === "BOOSTING" && bst[1].status === "BOOSTED" && /1 of 3 campaigns skipped/.test(String(r1.find((r) => r.dataset === "boosts")?.error)), JSON.stringify([bst, r1.find((r) => r.dataset === "boosts")]));
  check("requests: every call carries the login in the Access-Token header", seen.filter((s) => !s.path.startsWith("/oauth2/")).every((s) => s.headers["access-token"] === "AT123"));
  check("requests: the last day asked for is never in the future", reqs.every((r) => r.q.end_date <= LAST_OK_DAY));
  check("requests: asks for the shop ids of that account only", reqs.every((r) => r.q.store_ids === '["S1"]'));
  const ov1 = await S.adsOverview();
  check("info notes: how a result was read is not shown as a warning", S.isInfoNote("Used dimensions a + b") && S.isInfoNote("Used dimensions a · Used dimensions b") && !S.isInfoNote("1 of 2 accounts skipped (x)") && !S.isInfoNote("Used dimensions a · 1 lines skipped") && !S.isInfoNote(null));
  check("overview: records, dates and a sample of what TikTok sent", ov1.datasets.find((d) => d.key === "campaign_daily")?.records === nDays * 2 && ov1.datasets.find((d) => d.key === "campaign_daily")?.oldest === FIRST_AD_DAY && /dimensions/.test(ov1.datasets.find((d) => d.key === "campaigns")?.sample ?? "") === false && /campaign_id/.test(ov1.datasets.find((d) => d.key === "campaigns")?.sample ?? ""), JSON.stringify(ov1.datasets.map((d) => [d.key, d.records, d.sample?.length])));
  check("overview: every card says what it holds and how many real things are behind its rows", ov1.datasets.every((d) => d.about.length > 20) && /different videos/.test(ov1.datasets.find((d) => d.key === "creative_daily")?.distinct ?? "") && /1 different shop/.test(ov1.datasets.find((d) => d.key === "stores")?.distinct ?? "") && ov1.datasets.find((d) => d.key === "creative_daily")?.label === "Video Daily Results", JSON.stringify(ov1.datasets.map((d) => [d.label, d.distinct])));
  check("overview: accounts, shops and active campaigns", ov1.accounts.length === 2 && ov1.shops === 1 && ov1.activeCampaigns === 2 && !ov1.needsReconnect);

  // ── idempotent, and TikTok restating a recent day ──
  const seenBefore = seen.length;
  const r2 = await S.runAdsAll("schedule", null, deps);
  check("again: running the sync twice changes nothing and duplicates nothing", r2.every((r) => r.status === "ok") && r2.filter((r) => ["campaign_daily", "creative_daily", "product_daily", "campaigns", "advertisers", "stores", "videos", "boosts"].includes(r.dataset)).every((r) => r.changed === 0) && (await count("ads_campaign_daily")) === nDays * 2, JSON.stringify(r2.map((r) => [r.dataset, r.changed])));
  const recentReq = seen.slice(seenBefore).filter((s) => s.path === "/gmv_max/report/get/");
  check("again: a normal sync reads only the recent days again, not the whole history", recentReq.length >= 3 && recentReq.every((r) => r.q.start_date >= addDays(TODAY, -13)), JSON.stringify(recentReq.map((r) => r.q.start_date)));
  bump["C1|2026-11-08"] = "999.00";
  const r3 = await S.runAdsDataset("campaign_daily", "schedule", null, deps);
  const restated = (await q(sql`select gross_revenue::float8 as rev from ads_campaign_daily where campaign_id = 'C1' and day = '2026-11-08'`))[0];
  check("restated day: TikTok changes a recent day's sales, the next sync picks it up (one row changed)", r3.changed === 1 && restated.rev === 999, `${r3.changed} ${restated.rev}`);
  bump = {};

  // ── TikTok does not take a list of campaigns, and does not take the product dimension together with the video ──
  maxCampaignIds = 1; rejectProductDim = true;
  await q(sql`delete from ads_product_daily`); await q(sql`delete from ads_creative_daily`); await q(sql`delete from ads_sync_state where dataset in ('product_daily', 'creative_daily')`);
  const rp = await S.runAdsDataset("product_daily", "manual", null, { ...deps, backfill: true });
  check("campaign list refused: product results fall back to one campaign at a time and still load everything", rp.status === "ok" && (await count("ads_product_daily")) === nDays * 2, `${rp.status} ${rp.error} ${await count("ads_product_daily")}`);
  const rc = await S.runAdsDataset("creative_daily", "manual", null, { ...deps, backfill: true });
  check("product dimension refused: creative results fall back and the product still comes from the request", rc.status === "ok" && (await count("ads_creative_daily")) === nDays * 4 && /Used dimensions campaign_id \+ item_id \+ stat_time_day/.test(rc.error ?? "") && (await q(sql`select 1 from ads_creative_daily where product_id = 'P1' limit 1`)).length === 1, `${rc.status} ${rc.error} ${await count("ads_creative_daily")}`);
  maxCampaignIds = 10; rejectProductDim = false;

  // ── TikTok keeps product results only back to a date ──
  oldestAllowed = "2026-10-01";
  await q(sql`delete from ads_product_daily`);
  const ro = await S.runAdsDataset("product_daily", "manual", null, { ...deps, backfill: true });
  check("too old: product results keep what TikTok allows, stop at the edge and say so", ro.status === "ok" && /only keeps product results back to/.test(ro.error ?? "") && (await count("ads_product_daily")) === 60, `${ro.status} ${ro.error} ${await count("ads_product_daily")}`);
  oldestAllowed = "";
  await S.runAdsDataset("product_daily", "manual", null, { ...deps, backfill: true });

  // ── the plain video list is empty: the shop's TikTok accounts are asked one by one ──
  videosOnlyViaIdentity = true;
  await q(sql`delete from ads_videos`); await q(sql`delete from ads_sync_state where dataset = 'videos'`);
  const rv = await S.runAdsDataset("videos", "manual", null, deps);
  check("empty video list: falls back to each TikTok account of the shop and still finds the videos, and says so", rv.status === "ok" && (await count("ads_videos")) === 5 && /plain video list was empty.*1 TikTok account tried, 5 videos found/.test(rv.error ?? ""), `${rv.status} ${rv.error} ${await count("ads_videos")}`);
  videosOnlyViaIdentity = false;

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
