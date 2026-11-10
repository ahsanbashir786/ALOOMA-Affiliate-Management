import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, todayKL } from "@/lib/time";
import { upsertRows } from "@/lib/tiktok/sync";
import { AdsApiError, adsAuthorizedAdvertisers, adsCallPatient, adsConfig, adsConnectionInfo, resetAdsCooldown, type AdsConfig, type Fetch } from "./client";
import * as M from "./map";

// Data Sync for TikTok Ads (GMV Max). Same promises as the shop sync: rows are inserted or updated and identical rows are left alone,
// so running twice never duplicates; a failed dataset is shown with TikTok's own message while the others still run; a restart never
// leaves a run "stuck". Results are re-read for the last two weeks each time, because TikTok restates ad numbers after the day ends.

export type AdsDatasetKey = "advertisers" | "stores" | "campaigns" | "campaign_daily" | "creative_daily" | "product_daily";
export type AdsDeps = { cfg?: AdsConfig | null; f?: Fetch; sleep?: (ms: number) => Promise<void>; pauseMs?: number; now?: () => Date; /** Read the whole history window, not only the recent days. */ backfill?: boolean };
export type AdsRunResult = { dataset: AdsDatasetKey; status: "ok" | "failed" | "skipped"; pages: number; seen: number; changed: number; error?: string };

/** Display order = run order (each step needs the one before it). */
export const ADS_DATASETS: { key: AdsDatasetKey; label: string; table: string; icon: string; what: string }[] = [
  { key: "advertisers", label: "Ad Accounts", table: "ads_advertisers", icon: "building", what: "accounts" },
  { key: "stores", label: "Shops", table: "ads_stores", icon: "store", what: "shops" },
  { key: "campaigns", label: "GMV Max Campaigns", table: "ads_campaigns", icon: "target", what: "campaigns" },
  { key: "campaign_daily", label: "Campaign Results", table: "ads_campaign_daily", icon: "chart", what: "campaign-days" },
  { key: "product_daily", label: "Product Results", table: "ads_product_daily", icon: "package", what: "product-days" },
  { key: "creative_daily", label: "Creative Results", table: "ads_creative_daily", icon: "video", what: "creative-days" },
];

type Table = Parameters<typeof upsertRows>[0];
const RAW = "jsonb";
const TABLES: Record<string, Table> = {
  ads_advertisers: { name: "ads_advertisers", pk: ["advertiser_id"], cols: { advertiser_id: "text", name: "text", currency: "text", timezone: "text", status: "text", raw: RAW } },
  ads_stores: { name: "ads_stores", pk: ["advertiser_id", "store_id"], cols: { advertiser_id: "text", store_id: "text", store_name: "text", store_code: "text", bc_id: "text", available: "boolean", raw: RAW } },
  ads_campaigns: { name: "ads_campaigns", pk: ["advertiser_id", "campaign_id"], cols: { advertiser_id: "text", campaign_id: "text", store_id: "text", name: "text", status: "text", promotion_type: "text", budget: "numeric", roas_target: "numeric", created_at: "timestamptz", modified_at: "timestamptz", raw: RAW } },
  ads_campaign_daily: { name: "ads_campaign_daily", pk: ["advertiser_id", "campaign_id", "day"], cols: { advertiser_id: "text", campaign_id: "text", day: "date", cost: "numeric", net_cost: "numeric", orders: "int", gross_revenue: "numeric", roi: "numeric", cost_per_order: "numeric", raw: RAW } },
  ads_product_daily: { name: "ads_product_daily", pk: ["advertiser_id", "campaign_id", "product_id", "day"], cols: { advertiser_id: "text", campaign_id: "text", product_id: "text", day: "date", title: "text", cost: "numeric", orders: "int", gross_revenue: "numeric", roi: "numeric", cost_per_order: "numeric", impressions: "bigint", clicks: "bigint", click_rate: "numeric", conversion_rate: "numeric", raw: RAW } },
  ads_creative_daily: { name: "ads_creative_daily", pk: ["advertiser_id", "campaign_id", "product_id", "creative_id", "day"], cols: { advertiser_id: "text", campaign_id: "text", product_id: "text", creative_id: "text", day: "date", title: "text", account_name: "text", content_type: "text", cost: "numeric", orders: "int", gross_revenue: "numeric", roi: "numeric", cost_per_order: "numeric", impressions: "bigint", clicks: "bigint", click_rate: "numeric", conversion_rate: "numeric", view_rate_2s: "numeric", view_rate_6s: "numeric", raw: RAW } },
};

/** The row that stays open while a whole sync (every dataset) is in progress. */
export const ADS_CYCLE = "_all";
const CYCLE_WINDOW_MIN = 120;
const REPEAT_WINDOW_MIN = 60;
const MAX_PAGES = 500;
const WINDOW_DAYS = 30;
/** Ad numbers are restated for a while after the day ends, so every sync reads this many recent days again. */
export const RECENT_DAYS = 14;
/** A full re-read of this many days happens once a day (or after a long gap). */
export const REREAD_DAYS = 60;
export const DEFAULT_HISTORY_DAYS = 180;
export const ADS_SYNC_CHOICES = [30, 60, 180, 720, 1440] as const;

type Counter = { pages: number; seen: number; changed: number; skipped: number; skipExample?: string; note?: string; sample?: unknown };
type Ctx = { deps: AdsDeps; cfg: AdsConfig; runId: number; full: boolean; watermark: Date | null; backfill: boolean; historyFrom: string };
const progress = (ctx: Ctx, c: Counter) => rows(sql`update ads_sync_runs set pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed} where id = ${ctx.runId}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clean = (m: string) => m.replace(/^TikTok said no \(\d+\): /, "");

/** One call, patient with the shared rate limit and with TikTok's own hiccups. Sign-in problems are never retried. */
const call = (ctx: Ctx, path: string, o: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown }) => adsCallPatient<Record<string, unknown>>(path, { cfg: ctx.cfg, f: ctx.deps.f, sleep: ctx.deps.sleep, ...o });

/** Walks every page of a list answer ({ list, page_info }). Steps the page size down if TikTok refuses one. */
async function* pages(ctx: Ctx, path: string, query: Record<string, unknown>, listKey: string[] = ["list"]): AsyncGenerator<{ items: Record<string, unknown>[]; page: number }> {
  const sleep = ctx.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sizes = [100, 50, 20];
  let s = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data: Record<string, unknown>;
    for (;;) {
      try { data = await call(ctx, path, { query: { ...query, page, page_size: sizes[s] } }); break; }
      catch (e) { if (s < sizes.length - 1 && /page.?size/i.test(errText(e))) { s++; continue; } throw e; }
    }
    const items = (listKey.map((k) => data[k]).find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined) ?? [];
    yield { items, page };
    const info = M.obj(data.page_info);
    const total = M.dec(info.total_page);
    if (!items.length || (total != null ? page >= total : items.length < sizes[s])) return;
    await sleep(ctx.deps.pauseMs ?? 120);
  }
}

async function save(ctx: Ctx, c: Counter, table: string, list: M.Row[]) {
  c.seen += list.length;
  c.changed += await upsertRows(TABLES[table], list);
  await progress(ctx, c);
}
const remember = (c: Counter, v: unknown) => { if (c.sample === undefined && v != null) c.sample = v; };

async function advertiserIds(ctx: Ctx): Promise<string[]> {
  const known = await rows<{ advertiser_id: string }>(sql`select advertiser_id from ads_advertisers order by 1`);
  if (known.length) return known.map((k) => k.advertiser_id);
  return adsAuthorizedAdvertisers(ctx.cfg, ctx.deps.f);
}

/** Runs one step for every ad account. One account failing for its own reasons does not stop the others; sign-in and rate problems do. */
async function eachAccount(ids: string[], c: Counter, job: (id: string) => Promise<void>) {
  const failed: string[] = [];
  let firstError = "";
  let okCount = 0;
  for (const id of ids) {
    try { await job(id); okCount++; }
    catch (e) {
      if (e instanceof AdsApiError && (e.isAuth || e.isRateLimit)) throw e;
      if (!firstError) firstError = clean(errText(e)) + (e instanceof AdsApiError && e.requestId ? ` (request ${e.requestId})` : "");
      failed.push(`${id}: ${clean(errText(e)).slice(0, 100)}`);
    }
  }
  if (!okCount && failed.length) throw new Error(ids.length > 1 ? `${failed.length} of ${ids.length} accounts failed. First: ${firstError}` : firstError);
  if (failed.length) c.note = [c.note, `${failed.length} of ${ids.length} account${ids.length === 1 ? "" : "s"} skipped (${failed.join("; ").slice(0, 300)})`].filter(Boolean).join(" · ");
}

async function runAdvertisers(ctx: Ctx, c: Counter) {
  const ids = await adsAuthorizedAdvertisers(ctx.cfg, ctx.deps.f);
  if (!ids.length) throw new Error("TikTok did not list any ad account for this login. Press Connect again and tick your ad account.");
  const got = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const d = await call(ctx, "/advertiser/info/", { query: { advertiser_ids: ids.slice(i, i + 100) } });
    const list = ((d.list ?? d.advertisers) as Record<string, unknown>[] | undefined) ?? [];
    c.pages++;
    for (const o of list) { remember(c, o); const id = String(o.advertiser_id ?? o.id ?? ""); if (id) got.add(id); }
    await save(ctx, c, "ads_advertisers", list.map(M.advertiser).filter((r) => r.advertiser_id));
  }
  const missing = ids.filter((i) => !got.has(i));
  if (missing.length) c.note = `TikTok gave no details for ${missing.length} account${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 3).join(", ")}`;
}

async function runStores(ctx: Ctx, c: Counter) {
  await eachAccount(await advertiserIds(ctx), c, async (id) => {
    const d = await call(ctx, "/gmv_max/store/list/", { query: { advertiser_id: id } });
    const list = ((d.store_list ?? d.stores ?? d.list) as Record<string, unknown>[] | undefined) ?? [];
    c.pages++;
    list.forEach((o) => remember(c, o));
    await save(ctx, c, "ads_stores", list.map((o) => M.store(o, id)).filter((r) => r.store_id));
  });
}

async function runCampaigns(ctx: Ctx, c: Counter) {
  await eachAccount(await advertiserIds(ctx), c, async (id) => {
    for await (const { items, page } of pages(ctx, "/gmv_max/campaign/get/", { advertiser_id: id, filtering: { gmv_max_promotion_types: M.GMV_MAX_PROMOTION_TYPES } })) {
      c.pages = Math.max(c.pages, page);
      items.forEach((o) => remember(c, o));
      await save(ctx, c, "ads_campaigns", items.map((o) => M.campaign(o, id)).filter((r) => r.campaign_id));
    }
  });
}

/** Windows of up to `days`, newest first, from `end` (inclusive) back to `floor`. */
export function backWindows(end: string, floor: string, days = WINDOW_DAYS): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let e = end; e >= floor && out.length < 400; e = addDaysISO(e, -days)) { const st = addDaysISO(e, -(days - 1)); out.push({ start: st < floor ? floor : st, end: e }); }
  return out;
}

const CORE = ["cost", "orders", "gross_revenue", "roi"];
const looksLikeBadParam = (e: unknown) => e instanceof AdsApiError && !e.isAuth && !e.isRateLimit && !e.isServer && /dimension|metric|param|invalid|field|filter/i.test(e.message);
const chunk = <T,>(list: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

type ReportReq = { adv: string; storeIds: string[]; dims: string[]; mets: string[]; filtering?: Record<string, unknown>; start: string; end: string };
const reportQuery = (r: ReportReq) => ({ advertiser_id: r.adv, store_ids: r.storeIds, dimensions: r.dims, metrics: r.mets, start_date: r.start, end_date: r.end, ...(r.filtering ? { filtering: r.filtering } : {}) });

/** Today, and the first day this run reads back to. */
function runSpan(ctx: Ctx) {
  const today = ctx.deps.now ? ctx.deps.now().toISOString().slice(0, 10) : todayKL();
  const floor = ctx.backfill ? ctx.historyFrom : ctx.full ? addDaysISO(today, -(REREAD_DAYS - 1)) : addDaysISO(today, -(RECENT_DAYS - 1));
  return { today, floor, wins: backWindows(today, floor) };
}

async function storesByAccount(c: Counter): Promise<Map<string, string[]>> {
  const stores = await rows<{ advertiser_id: string; store_id: string }>(sql`select advertiser_id, store_id from ads_stores where coalesce(available, true) order by 1, 2`);
  const byAdv = new Map<string, string[]>();
  for (const s of stores) byAdv.set(s.advertiser_id, [...(byAdv.get(s.advertiser_id) ?? []), s.store_id]);
  if (!byAdv.size) c.note = "No GMV Max shop is linked to your ad account yet, so there are no results to read.";
  return byAdv;
}

/**
 * Reads every page of one report request, checks that the numbers can be read, and saves them. Throws on any TikTok refusal.
 * If TikTok says the last day is in the future (a time zone ahead of the ad account), the day before is used instead.
 */
async function readReport(ctx: Ctx, c: Counter, req: ReportReq, table: string, map: (l: M.ReportLine) => M.Row | null, today: string): Promise<number> {
  const go = async (end: string) => {
    let n = 0;
    for await (const { items } of pages(ctx, "/gmv_max/report/get/", reportQuery({ ...req, end }))) {
      c.pages++;
      const lines = items.map(M.reportLine);
      if (lines.length && !M.hasReadableMetrics(lines)) throw new Error(`TikTok sent ${lines.length} result lines, but none of the numbers (cost, orders, gross revenue, ROI) could be read. Fields sent: ${M.metricNames(lines).join(", ") || "none"}. TikTok may have renamed them.`);
      lines.forEach((l) => remember(c, { dimensions: l.dims, metrics: l.mets }));
      const mapped = lines.map(map);
      const ok = mapped.filter((r): r is M.Row => !!r);
      if (ok.length < lines.length) { c.skipped += lines.length - ok.length; c.skipExample ??= JSON.stringify(lines[mapped.findIndex((r) => !r)].dims).slice(0, 120); }
      await save(ctx, c, table, ok);
      n += ok.length;
    }
    return n;
  };
  const end = req.end > today ? today : req.end;
  try { return await go(end); }
  catch (e) { if (e instanceof AdsApiError && /end.?date|future/i.test(e.message) && end > req.start) return go(addDaysISO(end, -1)); throw e; }
}

/** Which of the optional metrics TikTok accepts is found out once (one tiny request per name) and remembered, so the sync asks only for names that work. */
const MKEY = "tiktok_ads_metrics";
async function metricSupport(): Promise<Record<string, string[]>> {
  const [r] = await rows<{ value: Record<string, string[]> }>(sql`select value from settings where key = ${MKEY}`);
  return r?.value ?? {};
}
async function discoverMetrics(ctx: Ctx, kind: string, probe: ReportReq): Promise<string[]> {
  const known = await metricSupport();
  if (known[kind] && !ctx.deps.backfill) return known[kind];
  const accepted: string[] = [];
  const ask = (mets: string[]) => call(ctx, "/gmv_max/report/get/", { query: { ...reportQuery({ ...probe, mets }), page: 1, page_size: 1 } });
  await ask(CORE); // if even the basic numbers are refused, that is the real problem and TikTok's message is shown
  for (const m of M.OPTIONAL_METRICS) {
    try { await ask([...CORE, m]); accepted.push(m); }
    catch (e) { if (!looksLikeBadParam(e)) throw e; }
  }
  const all = { ...known, [kind]: accepted };
  await rows(sql`insert into settings (key, value) values (${MKEY}, ${JSON.stringify(all)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`);
  return accepted;
}

/** Campaign results: one row per campaign per day. Needs no filter. */
async function runCampaignDaily(ctx: Ctx, c: Counter) {
  const { today, wins } = runSpan(ctx);
  const byAdv = await storesByAccount(c);
  if (!byAdv.size) return;
  const metSets = [["cost", "net_cost", "orders", "cost_per_order", "gross_revenue", "roi"], CORE];
  let chosen: string[] | null = null;
  await eachAccount([...byAdv.keys()], c, async (adv) => {
    let emptyRun = 0;
    for (const win of wins) {
      let n: number | null = null;
      for (const mets of chosen ? [chosen] : metSets) {
        try { n = await readReport(ctx, c, { adv, storeIds: byAdv.get(adv)!, dims: ["campaign_id", "stat_time_day"], mets, start: win.start, end: win.end }, "ads_campaign_daily", (l) => M.campaignDaily(l, adv), today); chosen = mets; break; }
        catch (e) {
          if (looksLikeBadParam(e) && !chosen) continue;
          // A window older than TikTok keeps: keep what we have and say so (the newest window must always work).
          if (chosen && e instanceof AdsApiError && /date|range|time|old|history|limit/i.test(e.message) && win.end < today) { c.note = [c.note, `TikTok only keeps this report back to about ${addDaysISO(win.end, 1)} (${clean(e.message).slice(0, 100)})`].filter(Boolean).join(" · "); return; }
          throw e;
        }
      }
      if (n == null) throw new Error("TikTok refused the campaign results request.");
      emptyRun = n === 0 ? emptyRun + 1 : 0;
      if (ctx.backfill && emptyRun >= 3) break; // three empty months in a row: the account had no ads before that
    }
  });
}

/**
 * Product results. TikTok returns them only when the request names the campaign, so this asks for the campaigns that spent money in each
 * window (from Campaign Results), ten at a time (one at a time if TikTok refuses a list).
 */
async function runProductDaily(ctx: Ctx, c: Counter) {
  const { today, wins } = runSpan(ctx);
  const byAdv = await storesByAccount(c);
  if (!byAdv.size) return;
  let batch = 10;
  await eachAccount([...byAdv.keys()], c, async (adv) => {
    const storeIds = byAdv.get(adv)!;
    let mets: string[] | null = null;
    let any = false;
    for (const win of wins) {
      const camps = (await rows<{ campaign_id: string }>(sql`select distinct campaign_id from ads_campaign_daily where advertiser_id = ${adv} and day between ${win.start}::date and ${win.end}::date and coalesce(cost, 0) > 0 order by 1`)).map((r) => r.campaign_id);
      if (!camps.length) continue;
      any = true;
      mets ??= [...CORE, ...(await discoverMetrics(ctx, "product", { adv, storeIds, dims: ["campaign_id", "item_group_id", "stat_time_day"], mets: CORE, filtering: { campaign_ids: camps.slice(0, 1) }, start: win.start, end: win.end }))];
      for (const group of chunk(camps, batch)) {
        const read = (ids: string[]) => readReport(ctx, c, { adv, storeIds, dims: ["campaign_id", "item_group_id", "stat_time_day"], mets: mets!, filtering: { campaign_ids: ids }, start: win.start, end: win.end }, "ads_product_daily", (l) => M.productDaily(l, adv, { campaign: ids.length === 1 ? ids[0] : undefined }), today);
        try { await read(group); }
        catch (e) {
          if (!(looksLikeBadParam(e) && group.length > 1)) throw e;
          batch = 1; // TikTok does not take a list of campaigns: one at a time from now on
          for (const id of group) await read([id]);
        }
      }
    }
    if (!any) c.note = [c.note, "No campaign spent any money in this period, so there are no product results to read."].filter(Boolean).join(" · ");
  });
}

/**
 * Creative (video) results. TikTok returns them only for one campaign and one product at a time, so this asks for each campaign and product
 * that spent money in the window (from Product Results). One row per video, per product, per campaign, per day.
 */
async function runCreativeDaily(ctx: Ctx, c: Counter) {
  const { today, wins } = runSpan(ctx);
  const byAdv = await storesByAccount(c);
  if (!byAdv.size) return;
  const dimSets = [["campaign_id", "item_group_id", "item_id", "stat_time_day"], ["campaign_id", "item_id", "stat_time_day"]];
  let dims: string[] | null = null;
  await eachAccount([...byAdv.keys()], c, async (adv) => {
    const storeIds = byAdv.get(adv)!;
    let mets: string[] | null = null;
    let any = false;
    for (const win of wins) {
      const pairs = await rows<{ campaign_id: string; product_id: string }>(sql`select campaign_id, product_id from ads_product_daily where advertiser_id = ${adv} and day between ${win.start}::date and ${win.end}::date and coalesce(cost, 0) > 0 group by 1, 2 order by 1, 2`);
      for (const p of pairs) {
        any = true;
        const filtering = { campaign_ids: [p.campaign_id], item_group_ids: [p.product_id] };
        mets ??= [...CORE, ...(await discoverMetrics(ctx, "creative", { adv, storeIds, dims: dims ?? dimSets[0], mets: CORE, filtering, start: win.start, end: win.end }).catch(async (e) => { if (!looksLikeBadParam(e) || dims) throw e; return discoverMetrics(ctx, "creative", { adv, storeIds, dims: dimSets[1], mets: CORE, filtering, start: win.start, end: win.end }); }))];
        let done = false;
        for (const d of dims ? [dims] : dimSets) {
          try { await readReport(ctx, c, { adv, storeIds, dims: d, mets, filtering, start: win.start, end: win.end }, "ads_creative_daily", (l) => M.creativeDaily(l, adv, { campaign: p.campaign_id, product: p.product_id }), today); dims = d; done = true; break; }
          catch (e) { if (looksLikeBadParam(e) && !dims) continue; throw e; }
        }
        if (!done) throw new Error("TikTok refused the creative results request.");
      }
    }
    if (!any) c.note = [c.note, "No product spent any money in this period, so there are no creative results to read."].filter(Boolean).join(" · ");
  });
  if (dims) c.note = [c.note, `Used dimensions ${(dims as string[]).join(" + ")}`].filter(Boolean).join(" · ");
}

const RUNNERS: Record<AdsDatasetKey, (ctx: Ctx, c: Counter) => Promise<void>> = {
  advertisers: runAdvertisers,
  stores: runStores,
  campaigns: runCampaigns,
  campaign_daily: runCampaignDaily,
  product_daily: runProductDaily,
  creative_daily: runCreativeDaily,
};

export async function adsLiveCount(key: AdsDatasetKey): Promise<number> {
  const ds = ADS_DATASETS.find((d) => d.key === key)!;
  return (await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(ds.table)}`))[0]?.n ?? 0;
}

/** Runs one dataset: logs the run, never throws (a failure is recorded and the next dataset can still run). */
export async function runAdsDataset(key: AdsDatasetKey, trigger: "manual" | "schedule", userId: string | null, deps: AdsDeps = {}): Promise<AdsRunResult> {
  const cfg = deps.cfg === undefined ? adsConfig() : deps.cfg;
  const [busy] = await rows<{ n: number }>(sql`select count(*)::int as n from ads_sync_runs where dataset = ${key} and status = 'running' and started_at > now() - (${REPEAT_WINDOW_MIN}::int * interval '1 minute')`);
  if (busy.n > 0) return { dataset: key, status: "skipped", pages: 0, seen: 0, changed: 0, error: "Already running" };
  const [run] = await rows<{ id: number }>(sql`insert into ads_sync_runs (dataset, trigger, user_id) values (${key}, ${trigger}, ${userId}) returning id`);
  const [st] = await rows<{ watermark: Date | null }>(sql`select watermark from ads_sync_state where dataset = ${key}`);
  const now = (deps.now ?? (() => new Date()))();
  const watermark = st?.watermark ? new Date(st.watermark) : null;
  const full = !watermark || now.getTime() - watermark.getTime() > 24 * 3600_000;
  const c: Counter = { pages: 0, seen: 0, changed: 0, skipped: 0 };
  try {
    if (!cfg) throw new Error("The TikTok Ads app ID and secret are not set on the server.");
    if (!(await adsConnectionInfo()).connected) throw new Error("TikTok Ads is not connected yet.");
    const s = await getAdsSyncSettings();
    await RUNNERS[key]({ deps: { ...deps, cfg }, cfg, runId: run.id, full, watermark, backfill: !!deps.backfill || !watermark, historyFrom: s.historyFrom || addDaysISO(todayKL(), -DEFAULT_HISTORY_DAYS) }, c);
    const records = await adsLiveCount(key);
    const note = [c.skipped ? `${c.skipped.toLocaleString("en-MY")} lines skipped (no id or date; e.g. ${c.skipExample ?? "?"})` : null, c.note ?? null].filter(Boolean).join(" · ") || null;
    await rows(sql`update ads_sync_runs set status = 'ok', finished_at = now(), pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed}, error = ${note} where id = ${run.id}`);
    await rows(sql`
      insert into ads_sync_state (dataset, watermark, last_success_at, records, last_error, sample)
      values (${key}, ${full ? now.toISOString() : (watermark ?? now).toISOString()}::timestamptz, now(), ${records}, null, ${c.sample === undefined ? null : JSON.stringify(c.sample)}::jsonb)
      on conflict (dataset) do update set watermark = excluded.watermark, last_success_at = now(), records = excluded.records, last_error = null, sample = coalesce(excluded.sample, ads_sync_state.sample), updated_at = now()`);
    return { dataset: key, status: "ok", pages: c.pages, seen: c.seen, changed: c.changed, ...(note ? { error: note } : {}) };
  } catch (e) {
    const msg = errText(e).slice(0, 400) + (e instanceof AdsApiError && e.requestId ? ` (request ${e.requestId})` : "");
    await rows(sql`update ads_sync_runs set status = 'failed', finished_at = now(), pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed}, error = ${msg} where id = ${run.id}`);
    await rows(sql`
      insert into ads_sync_state (dataset, last_error, last_error_at) values (${key}, ${msg}, now())
      on conflict (dataset) do update set last_error = ${msg}, last_error_at = now(), updated_at = now()`);
    return { dataset: key, status: "failed", pages: c.pages, seen: c.seen, changed: c.changed, error: msg };
  }
}

/** Every dataset in turn (each needs the one before). If a step fails the steps that depend on it are skipped, not run on stale data. */
export async function runAdsAll(trigger: "manual" | "schedule", userId: string | null, deps: AdsDeps = {}): Promise<AdsRunResult[]> {
  const [busy] = await rows<{ n: number }>(sql`select count(*)::int as n from ads_sync_runs where dataset = ${ADS_CYCLE} and status = 'running' and started_at > now() - (${CYCLE_WINDOW_MIN}::int * interval '1 minute')`);
  if (busy.n > 0) return [];
  const [cycle] = await rows<{ id: number }>(sql`insert into ads_sync_runs (dataset, trigger, user_id) values (${ADS_CYCLE}, ${trigger}, ${userId}) returning id`);
  const out: AdsRunResult[] = [];
  try {
    for (const d of ADS_DATASETS) {
      const r = await runAdsDataset(d.key, trigger, userId, deps);
      out.push(r);
      // Without ad accounts or shops there is nothing to read for the steps after them; sign-in trouble would repeat for every step.
      if (r.status === "failed" && (d.key === "advertisers" || /access token|Connect again|not connected/i.test(r.error ?? ""))) {
        for (const rest of ADS_DATASETS.slice(out.length)) out.push({ dataset: rest.key, status: "skipped", pages: 0, seen: 0, changed: 0, error: "Not run: an earlier step failed" });
        break;
      }
    }
  } finally {
    const failed = out.filter((r) => r.status === "failed").length;
    await rows(sql`update ads_sync_runs set status = ${failed ? "failed" : "ok"}, finished_at = now(), rows_changed = ${out.reduce((a, r) => a + r.changed, 0)}, rows_seen = ${out.reduce((a, r) => a + r.seen, 0)}, error = ${failed ? `${failed} of ${out.length} failed` : null} where id = ${cycle.id}`);
  }
  return out;
}

/** Marks every run still shown as "running" as interrupted (a restart kills any sync in progress). */
export async function clearAdsInterrupted(reason = "Interrupted – the app was restarted"): Promise<number> {
  resetAdsCooldown();
  const res = await rows<{ id: number }>(sql`update ads_sync_runs set status = 'failed', finished_at = now(), error = ${reason} where status = 'running' returning id`);
  return res.length;
}

// ───────── settings and schedule ─────────
export type AdsSyncSettings = { enabled: boolean; everyMinutes: number; /** First day to load when reading history (YYYY-MM-DD); "" = the last 180 days. */ historyFrom: string };
const SKEY = "tiktok_ads_sync";
export async function getAdsSyncSettings(): Promise<AdsSyncSettings> {
  const [r] = await rows<{ value: Partial<AdsSyncSettings> }>(sql`select value from settings where key = ${SKEY}`);
  const v = r?.value ?? {};
  return { enabled: v.enabled !== false, everyMinutes: (ADS_SYNC_CHOICES as readonly number[]).includes(Number(v.everyMinutes)) ? Number(v.everyMinutes) : 60, historyFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(v.historyFrom)) ? String(v.historyFrom) : "" };
}
export async function saveAdsSyncSettings(patch: Partial<AdsSyncSettings>): Promise<void> {
  const s = { ...(await getAdsSyncSettings()), ...patch };
  await rows(sql`insert into settings (key, value) values (${SKEY}, ${JSON.stringify(s)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`);
}
export const adsIsDue = (nowMs: number, lastStartedMs: number | null, s: Pick<AdsSyncSettings, "enabled" | "everyMinutes">) => s.enabled && (lastStartedMs == null || nowMs - lastStartedMs >= s.everyMinutes * 60_000);

// ───────── what the screen shows ─────────
const DATE_COL: Record<string, string> = { ads_campaign_daily: "day", ads_creative_daily: "day", ads_product_daily: "day" };
export type AdsDatasetView = { key: AdsDatasetKey; label: string; icon: string; what: string; records: number; lastSuccessAt: string | null; lastError: string | null; note: string | null; oldest: string | null; newest: string | null; running: boolean; progress: number | null; /** The first row TikTok sent in the last good run, as text. */ sample: string | null };
export type AdsRunView = { id: number; dataset: AdsDatasetKey; label: string; startedAt: string; durationSec: number | null; status: string; trigger: string; changed: number; seen: number; error: string | null; by: string | null };
/** A note that only says how a result was read (not a problem): shown calmly, not as a warning. */
export const isInfoNote = (note: string | null | undefined) => !!note && note.split(" · ").every((p) => /^Used dimensions /.test(p));

export type AdsOverview = {
  now: number; datasets: AdsDatasetView[]; runs: AdsRunView[]; running: boolean; lastFullAt: string | null; nextAt: string | null; settings: AdsSyncSettings;
  accounts: { name: string | null; id: string; currency: string | null }[]; shops: number; activeCampaigns: number;
  /** The login was refused: the person must press Connect again in Settings. */
  needsReconnect: boolean;
};

export async function adsOverview(): Promise<AdsOverview> {
  const [states, running, runs, lastSched, settings, latest, accounts, counts] = await Promise.all([
    rows<{ dataset: string; records: number; last_success_at: Date | null; last_error: string | null; sample: unknown }>(sql`select dataset, records, last_success_at, last_error, sample from ads_sync_state`),
    rows<{ dataset: string; seen: number }>(sql`select dataset, max(rows_seen)::int as seen from ads_sync_runs where status = 'running' and started_at > now() - (case when dataset = ${ADS_CYCLE} then ${CYCLE_WINDOW_MIN}::int else ${REPEAT_WINDOW_MIN}::int end * interval '1 minute') group by dataset`),
    rows<{ id: number; dataset: string; started_at: Date; finished_at: Date | null; status: string; trigger: string; rows_changed: number; rows_seen: number; error: string | null; by: string | null }>(sql`
      select r.id, r.dataset, r.started_at, r.finished_at, r.status, r.trigger, r.rows_changed, r.rows_seen, r.error, u.name as by
      from ads_sync_runs r left join users u on u.id = r.user_id where r.dataset <> ${ADS_CYCLE} order by r.started_at desc, r.id desc limit 30`),
    rows<{ t: Date | null }>(sql`select max(started_at) as t from ads_sync_runs where dataset = ${ADS_CYCLE}`),
    getAdsSyncSettings(),
    rows<{ dataset: string; status: string; error: string | null }>(sql`select distinct on (dataset) dataset, status, error from ads_sync_runs where dataset <> ${ADS_CYCLE} order by dataset, started_at desc, id desc`),
    rows<{ advertiser_id: string; name: string | null; currency: string | null }>(sql`select advertiser_id, name, currency from ads_advertisers order by name nulls last, advertiser_id`),
    rows<{ shops: number; active: number }>(sql`select (select count(*) from ads_stores)::int as shops, (select count(*) from ads_campaigns where upper(coalesce(status, '')) in ('ENABLE', 'ENABLED', 'ACTIVE', 'STATUS_DELIVERY_OK', 'DELIVERY_OK'))::int as active`),
  ]);
  const lastRun = new Map(latest.map((r) => [r.dataset, r]));
  const st = new Map(states.map((s) => [s.dataset, s]));
  const run = new Map(running.map((r) => [r.dataset, r.seen]));
  const spans = new Map<string, { a: string | null; b: string | null }>();
  for (const d of ADS_DATASETS) {
    const col = DATE_COL[d.table];
    if (!col) continue;
    const [r] = await rows<{ a: string | null; b: string | null }>(sql`select to_char(min(${sql.raw(col)}), 'YYYY-MM-DD') as a, to_char(max(${sql.raw(col)}), 'YYYY-MM-DD') as b from ${sql.raw(d.table)}`);
    spans.set(d.key, r);
  }
  const live = new Map<string, number>();
  for (const d of ADS_DATASETS) live.set(d.key, await adsLiveCount(d.key));
  const label = new Map(ADS_DATASETS.map((d) => [d.key, d.label]));
  const times = states.map((s) => s.last_success_at).filter((x): x is Date => !!x).map((x) => new Date(x).getTime());
  const last = lastSched[0]?.t ? new Date(lastSched[0].t).getTime() : null;
  const datasets: AdsDatasetView[] = ADS_DATASETS.map((d) => {
    const lr = lastRun.get(d.key);
    return { key: d.key, label: d.label, icon: d.icon, what: d.what, records: live.get(d.key) ?? 0, lastSuccessAt: st.get(d.key)?.last_success_at ? new Date(st.get(d.key)!.last_success_at!).toISOString() : null, lastError: lr?.status === "ok" ? null : (st.get(d.key)?.last_error ?? null), note: lr?.status === "ok" ? (lr.error ?? null) : null, oldest: spans.get(d.key)?.a ?? null, newest: spans.get(d.key)?.b ?? null, running: run.has(d.key), progress: run.has(d.key) ? (run.get(d.key) ?? 0) : null, sample: st.get(d.key)?.sample ? JSON.stringify(st.get(d.key)!.sample, null, 2).slice(0, 4000) : null };
  });
  return {
    now: Date.now(), datasets,
    runs: runs.map((r) => ({ id: r.id, dataset: r.dataset as AdsDatasetKey, label: label.get(r.dataset as AdsDatasetKey) ?? r.dataset, startedAt: new Date(r.started_at).toISOString(), durationSec: r.finished_at ? Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)) : null, status: r.status, trigger: r.trigger, changed: r.rows_changed, seen: r.rows_seen, error: r.error, by: r.by })),
    running: running.length > 0,
    lastFullAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    nextAt: settings.enabled && last ? new Date(last + settings.everyMinutes * 60_000).toISOString() : null,
    settings,
    accounts: accounts.map((a) => ({ id: a.advertiser_id, name: a.name, currency: a.currency })),
    shops: counts[0]?.shops ?? 0, activeCampaigns: counts[0]?.active ?? 0,
    needsReconnect: datasets.some((d) => d.lastError && /access token|Connect again|not connected|login/i.test(d.lastError)),
  };
}

/** Pure-ish: is a scheduled sync due, and is anything running? Used by the scheduler (see scheduler.ts). */
export async function adsSchedulerDue(nowMs = Date.now()): Promise<boolean> {
  const s = await getAdsSyncSettings();
  if (!s.enabled) return false;
  const [last] = await rows<{ t: Date | null }>(sql`select max(started_at) as t from ads_sync_runs where dataset = ${ADS_CYCLE}`);
  return adsIsDue(nowMs, last?.t ? new Date(last.t).getTime() : null, s);
}
