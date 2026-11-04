import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { addDaysISO, todayKL } from "@/lib/time";
import { callApi, tiktokConfig, type Fetch, type TikTokConfig } from "./client";
import * as M from "./map";
import { str } from "./map";

export type DatasetKey = "products" | "affiliate_orders" | "sample_requests" | "sample_orders" | "open_collabs" | "videos" | "lives" | "returns" | "cancellations" | "shop_daily";

export type SyncDeps = { cfg?: TikTokConfig | null; f?: Fetch; sleep?: (ms: number) => Promise<void>; pauseMs?: number; now?: () => Date; /** Read the whole history (back to the "history from" date), not just the recent days. */ backfill?: boolean };
export type RunResult = { dataset: DatasetKey; status: "ok" | "failed" | "skipped"; pages: number; seen: number; changed: number; error?: string };

/** Display order = run order. `table` is where the rows land. */
export const DATASETS: { key: DatasetKey; label: string; table: string; icon: string; what: string }[] = [
  { key: "products", label: "Products & stock", table: "tt_skus", icon: "package", what: "SKUs" },
  { key: "affiliate_orders", label: "Affiliate orders", table: "tt_affiliate_order_lines", icon: "receipt", what: "order lines" },
  { key: "sample_requests", label: "Sample requests", table: "tt_sample_requests", icon: "gift", what: "requests" },
  { key: "sample_orders", label: "Sample orders", table: "tt_orders", icon: "truck", what: "orders" },
  { key: "open_collabs", label: "Collaborations", table: "tt_open_collabs", icon: "handshake", what: "offers" },
  { key: "videos", label: "Videos", table: "tt_videos", icon: "video", what: "videos" },
  { key: "lives", label: "LIVE sessions", table: "tt_lives", icon: "radio", what: "sessions" },
  { key: "returns", label: "Returns", table: "tt_returns", icon: "undo", what: "returns" },
  { key: "cancellations", label: "Cancellations", table: "tt_cancellations", icon: "x", what: "cancellations" },
  { key: "shop_daily", label: "Shop performance", table: "tt_shop_daily", icon: "chart", what: "days" },
];

const MAX_PAGES = 600;
const REPEAT_WINDOW_MIN = 180;
/** The row that stays open while a whole sync (every dataset) is in progress. */
export const CYCLE = "_all";
const CYCLE_WINDOW_MIN = 360;
type Table = { name: string; pk: string[]; cols: Record<string, string> };

const TABLES: Record<string, Table> = {
  tt_affiliate_order_lines: { name: "tt_affiliate_order_lines", pk: ["order_id", "sku_id"], cols: { order_id: "text", sku_id: "text", created_at: "timestamptz", delivery_at: "timestamptz", creator: "text", content_id: "text", content_type: "text", product_id: "text", seller_sku: "text", sku_name: "text", quantity: "int", price: "numeric", currency: "text", commission_rate: "numeric", est_commission: "numeric", paid_commission: "numeric", settlement_status: "text", fully_return: "boolean", open_collab_id: "text", target_collab_id: "text", campaign_id: "text" } },
  tt_videos: { name: "tt_videos", pk: ["video_id"], cols: { video_id: "text", creator: "text", title: "text", posted_at: "timestamptz", views: "bigint", gmv: "numeric", units_sold: "int", click_through_rate: "numeric", products: "jsonb", window_start: "date", window_end: "date" } },
  tt_lives: { name: "tt_lives", pk: ["live_id"], cols: { live_id: "text", creator: "text", title: "text", started_at: "timestamptz", ended_at: "timestamptz", gmv: "numeric", items_sold: "int", sku_orders: "int", customers: "int", viewers: "bigint", views: "bigint", avg_viewing_seconds: "numeric", new_followers: "int", likes: "int", comments: "int", shares: "int", product_clicks: "int", click_through_rate: "numeric", click_to_order_rate: "numeric" } },
  tt_sample_requests: { name: "tt_sample_requests", pk: ["id"], cols: { id: "text", status: "text", creator_id: "text", creator: "text", nickname: "text", followers: "bigint", creator_gmv: "numeric", creator_videos: "int", creator_video_views: "bigint", fulfilment_pct: "numeric", product_id: "text", sku_id: "text", product_title: "text", sku_name: "text", commission_rate: "numeric", order_id: "text", is_approvable: "boolean", expires_at: "timestamptz", available_quantity: "int" } },
  tt_skus: { name: "tt_skus", pk: ["sku_id"], cols: { sku_id: "text", product_id: "text", product_title: "text", seller_sku: "text", price: "numeric", currency: "text", stock: "int", product_status: "text", updated_at: "timestamptz" } },
  tt_returns: { name: "tt_returns", pk: ["return_id"], cols: { return_id: "text", order_id: "text", status: "text", return_type: "text", reason: "text", refund_amount: "numeric", currency: "text", skus: "jsonb", created_at: "timestamptz", updated_at: "timestamptz" } },
  tt_cancellations: { name: "tt_cancellations", pk: ["cancel_id"], cols: { cancel_id: "text", order_id: "text", status: "text", cancel_type: "text", reason: "text", skus: "jsonb", created_at: "timestamptz", updated_at: "timestamptz" } },
  tt_video_windows: { name: "tt_video_windows", pk: ["video_id", "window_start"], cols: { video_id: "text", window_start: "date", window_end: "date", views: "bigint", gmv: "numeric", units_sold: "int", click_through_rate: "numeric" } },
  tt_orders: { name: "tt_orders", pk: ["order_id"], cols: { order_id: "text", status: "text", is_sample: "boolean", created_at: "timestamptz", paid_at: "timestamptz", updated_at: "timestamptz", delivered_at: "timestamptz", total_amount: "numeric", currency: "text", tracking_number: "text", shipping_provider: "text", lines: "jsonb", is_final: "boolean" } },
  tt_open_collabs: { name: "tt_open_collabs", pk: ["id"], cols: { id: "text", product_id: "text", title: "text", status: "text", commission_rate: "numeric", commission_start: "timestamptz", commission_end: "timestamptz", creators: "int", showcasing: "int", needs_approval: "boolean", stock: "int", price_min: "numeric", price_max: "numeric" } },
  tt_shop_daily: { name: "tt_shop_daily", pk: ["day"], cols: { day: "date", gmv: "numeric", orders: "int", buyers: "int", units_sold: "int", refunds: "numeric", returns_cancellations: "int", page_views: "bigint", impressions: "bigint", avg_order_value: "numeric" } },
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** When TikTok says "too many requests", every running dataset waits together instead of each hammering it. */
let coolUntil = 0;
/** Datasets that run side by side (TikTok's limit is shared, so a small number is fastest). */
const POOL = 3;

/** Insert new rows and update changed ones (a row whose values are identical is left alone). Returns how many rows were new or changed. */
export async function upsertRows(t: Table, data: M.Row[]): Promise<number> {
  const names = Object.keys(t.cols);
  const keyOf = (r: M.Row) => t.pk.map((k) => String(r[k] ?? "")).join("|");
  const byKey = new Map<string, M.Row>();
  for (const r of data) if (t.pk.every((k) => r[k] != null && r[k] !== "")) byKey.set(keyOf(r), r); // last one wins; no half-keyed rows
  const list = [...byKey.values()];
  let changed = 0;
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const values = sql.join(
      chunk.map((r) => {
        const h = createHash("md5").update(JSON.stringify(names.map((n) => r[n] ?? null))).digest("hex");
        return sql`(${sql.join([...names.map((n) => sql`${r[n] ?? null}::${sql.raw(t.cols[n])}`), sql`${h}`], sql`, `)})`;
      }),
      sql`, `,
    );
    const set = sql.join([...names.filter((n) => !t.pk.includes(n)).map((n) => sql.raw(`${n} = excluded.${n}`)), sql.raw("h = excluded.h"), sql.raw("synced_at = now()")], sql`, `);
    const res = await rows<{ x: number }>(sql`
      insert into ${sql.raw(t.name)} (${sql.raw([...names, "h"].join(", "))}) values ${values}
      on conflict (${sql.raw(t.pk.join(", "))}) do update set ${set} where ${sql.raw(t.name)}.h is distinct from excluded.h
      returning 1 as x`);
    changed += res.length;
  }
  return changed;
}

type PageOpts = { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown; sizes: number[]; list: (d: Record<string, unknown>) => unknown[] };

type CallOpts = { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown; sizes?: number[] };

/** One call to TikTok that is patient with the shared rate limit and steps down the page size if TikTok refuses one. */
async function callRetry(path: string, o: CallOpts, deps: SyncDeps, state: { size: number }): Promise<Record<string, unknown>> {
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (coolUntil > Date.now()) await sleep(coolUntil - Date.now());
    try {
      const query = { ...(o.query ?? {}), ...(o.sizes ? { page_size: String(o.sizes[state.size]) } : {}) };
      return (await callApi<Record<string, unknown>>(path, { cfg: deps.cfg, f: deps.f, method: o.method, body: o.body, query })) ?? {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/36009002|rate limit|too many requests/i.test(msg) && attempt < 6) { coolUntil = Date.now() + 3000 * (attempt + 1); await sleep(3000 * (attempt + 1)); continue; }
      if (o.sizes && /page.?size/i.test(msg) && state.size < o.sizes.length - 1) { state.size++; continue; }
      if (/36009003|internal error/i.test(msg) && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

/** Walks every page of an endpoint. */
async function* walk(path: string, o: PageOpts, deps: SyncDeps): AsyncGenerator<{ items: Record<string, unknown>[]; page: number }> {
  const sleep = deps.sleep ?? defaultSleep;
  const state = { size: 0 };
  let token: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await callRetry(path, { ...o, query: { ...(o.query ?? {}), ...(token ? { page_token: token } : {}) } }, deps, state);
    yield { items: o.list(data) as Record<string, unknown>[], page };
    token = str(data.next_page_token);
    if (!token) return;
    await sleep(deps.pauseMs ?? 120);
  }
}

const firstList = (d: Record<string, unknown>) => (Object.values(d).find((v) => Array.isArray(v)) as unknown[] | undefined) ?? [];
const pick = (...names: string[]) => (d: Record<string, unknown>) => {
  for (const n of names) if (Array.isArray(d[n])) return d[n] as unknown[];
  return firstList(d);
};

type Ctx = { deps: SyncDeps; full: boolean; watermark: Date | null; runId: number; /** Reading the whole history (first sync, or the Load full history button). */ backfill: boolean; historyFrom: string };
type Counter = { pages: number; seen: number; changed: number; skipped?: number; skipExamples?: string[]; skipWhy?: string; /** Something worth telling the person, e.g. where TikTok's history stops. */ note?: string };
/** Lets the screen show "1,200 so far" while a dataset runs. */
const progress = (ctx: Ctx, c: Counter) => rows(sql`update tt_sync_runs set pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed} where id = ${ctx.runId}`);

async function simple(path: string, o: PageOpts, table: string, mapRow: (r: Record<string, unknown>) => M.Row | M.Row[], ctx: Ctx, c: Counter) {
  for await (const { items, page } of walk(path, o, ctx.deps)) {
    const out = items.flatMap((r): M.Row[] => { const m = mapRow(r); return Array.isArray(m) ? m : [m]; });
    c.pages = page; c.seen += out.length;
    { const ch = await upsertRows(TABLES[table], out); c.changed += ch; }
    await progress(ctx, c);
  }
}

type WSpec = { path: string; list: (d: Record<string, unknown>) => unknown[]; sizes: number[]; timeKey: string; table: string; mapRow: (r: Record<string, unknown>) => M.Row | M.Row[] };
const DAY = 86400;
const asRows = (m: M.Row | M.Row[]): M.Row[] => (Array.isArray(m) ? m : [m]);

/** Oldest-to-newest scan of a list with no date filter. After the first full scan it stops as soon as a whole page is older than the last full scan (newest-first lists). */
async function sequential(spec: WSpec, ctx: Ctx, c: Counter) {
  const cut = ctx.full || !ctx.watermark ? null : ctx.watermark.getTime() - 3 * 86400_000;
  let newestFirst: boolean | null = null;
  for await (const { items } of walk(spec.path, { method: "POST", body: {}, sizes: spec.sizes, list: spec.list }, ctx.deps)) {
    const out = items.flatMap((r) => asRows(spec.mapRow(r)));
    c.pages++; c.seen += out.length;
    { const ch = await upsertRows(TABLES[spec.table], out); c.changed += ch; }
    await progress(ctx, c);
    const times = items.map((o) => Number(o[spec.timeKey]) * 1000).filter((n) => Number.isFinite(n));
    if (newestFirst === null && times.length > 1) newestFirst = times[0] >= times[times.length - 1];
    if (cut && newestFirst && times.length && Math.max(...times) < cut) return;
  }
}

/**
 * Fast path for lists TikTok can filter by creation time: the first sync reads the history in 30-day windows, three at a time, and stops
 * after three empty windows; later syncs read only the last few days. The filter is checked first (every returned record must really fall
 * inside the asked window); if TikTok rejects it or ignores it, the slower safe scan above is used instead.
 */
async function windowed(spec: WSpec, ctx: Ctx, c: Counter) {
  const nowS = Math.floor((ctx.deps.now?.() ?? new Date()).getTime() / 1000);
  const hiAll = nowS + 3600;
  const body = (lo: number, hi: number) => ({ create_time_ge: lo, create_time_lt: hi });
  const scan = async (lo: number, hi: number): Promise<number> => {
    let n = 0;
    for await (const { items } of walk(spec.path, { method: "POST", body: body(lo, hi), sizes: spec.sizes, list: spec.list }, ctx.deps)) {
      const out = items.flatMap((r) => asRows(spec.mapRow(r)));
      n += out.length; c.pages++; c.seen += out.length;
      { const ch = await upsertRows(TABLES[spec.table], out); c.changed += ch; }
      await progress(ctx, c);
    }
    return n;
  };
  /** Asks for a tiny window and checks every record that comes back really belongs inside it. */
  const insideWindow = async (lo: number, hi: number): Promise<boolean> => {
    try {
      for await (const { items } of walk(spec.path, { method: "POST", body: body(lo, hi), sizes: [10], list: spec.list }, ctx.deps)) {
        return items.every((it) => { const t = Number(it[spec.timeKey]); return Number.isFinite(t) && t >= lo - 3600 && t < hi + 3600; });
      }
      return true;
    } catch { return false; }
  };
  // A recent window and an ancient one: if TikTok ignored the filter, the ancient window would still return today's records.
  const filterWorks = async () => (await insideWindow(nowS - 7 * DAY, hiAll)) && (await insideWindow(nowS - 3650 * DAY, nowS - 3640 * DAY));
  if (!(await filterWorks())) return sequential(spec, ctx, c);
  if (!ctx.full && ctx.watermark && !ctx.backfill) { await scan(Math.floor(ctx.watermark.getTime() / 1000) - 2 * DAY, hiAll); return; }
  // Full read: the whole history back to "history from" when backfilling, otherwise the last 90 days (the daily re-read that catches status changes).
  const floorS = ctx.backfill ? Math.floor(Date.parse(ctx.historyFrom + "T00:00:00Z") / 1000) : nowS - 90 * DAY;
  const W = 30 * DAY;
  const wins: [number, number][] = [];
  for (let hi = hiAll; hi > floorS && wins.length < 400; hi -= W) wins.push([Math.max(hi - W, floorS), hi]);
  for (let k = 0; k < wins.length; k += 3) await Promise.all(wins.slice(k, k + 3).map(([lo, hi]) => scan(lo, hi)));
}

/** Date windows from "end" back to "floor", newest first. */
function backWindows(end: string, floor: string, days: number): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let e = end; e > floor && out.length < 400; e = addDaysISO(e, -days)) { const st = addDaysISO(e, -days); out.push({ start: st < floor ? floor : st, end: e }); }
  return out;
}

/**
 * Runs a report that is asked for by date window (videos, LIVE, shop performance), newest window first. The newest windows come from the
 * normal sync; with a backfill the older ones follow. If TikTok refuses a window because it is too old, the history stops there and the note says so.
 */
async function byWindows(ctx: Ctx, c: Counter, days: number, recentDays: number, each: (w: { start: string; end: string }) => Promise<void>) {
  const end = addDaysISO(todayKL(), 1);
  if (!ctx.backfill && ctx.watermark) { await each(backWindows(end, addDaysISO(end, -recentDays), recentDays)[0]); return; }
  const wins = backWindows(end, ctx.backfill ? ctx.historyFrom : addDaysISO(end, -3 * days), days);
  for (let i = 0; i < wins.length; i++) {
    try { await each(wins[i]); } catch (e) {
      if (i === 0) throw e; // the newest window must work
      c.note = `history stops at ${wins[i].end}: ${(e instanceof Error ? e.message : "").replace(/^TikTok said no \(\d+\): /, "").slice(0, 90)}`;
      return;
    }
  }
}

/** Runs the same job for a list of ids in groups, two groups at a time. */
async function inGroups<T>(items: T[], size: number, parallel: number, job: (group: T[]) => Promise<void>) {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, groups.length) }, async () => { while (next < groups.length) await job(groups[next++]); }));
}

const RUNNERS: Record<DatasetKey, (ctx: Ctx, c: Counter) => Promise<void>> = {
  products: (ctx, c) => simple("/product/202309/products/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("products") }, "tt_skus", M.skus, ctx, c),
  sample_requests: (ctx, c) => simple("/affiliate_seller/202409/sample_applications/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("sample_applications", "applications") }, "tt_sample_requests", M.sampleRequest, ctx, c),
  open_collabs: (ctx, c) => simple("/affiliate_seller/202409/open_collaborations/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("open_collaborations", "collaborations") }, "tt_open_collabs", M.openCollab, ctx, c),
  returns: (ctx, c) => windowed({ path: "/return_refund/202309/returns/search", sizes: [100, 50, 20, 10], list: pick("return_orders", "returns"), timeKey: "create_time", table: "tt_returns", mapRow: M.returnRow }, ctx, c),
  cancellations: (ctx, c) => windowed({ path: "/return_refund/202309/cancellations/search", sizes: [100, 50, 20, 10], list: pick("cancellations"), timeKey: "create_time", table: "tt_cancellations", mapRow: M.cancellation }, ctx, c),
  affiliate_orders: (ctx, c) => windowed({ path: "/affiliate_seller/202410/orders/search", sizes: [100, 50, 20, 10], list: pick("orders"), timeKey: "create_time", table: "tt_affiliate_order_lines", mapRow: M.affiliateOrderLines }, ctx, c),
  lives: (ctx, c) => byWindows(ctx, c, 28, 28, (w) => simple("/analytics/202509/shop_lives/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end }, sizes: [100, 50, 20, 10], list: pick("live_stream_sessions", "lives") }, "tt_lives", M.live, ctx, c)),
  videos: (ctx, c) => byWindows(ctx, c, 28, 28, async (w) => {
    for await (const { items } of walk("/analytics/202409/shop_videos/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end }, sizes: [100, 50, 20, 10], list: pick("videos") }, ctx.deps)) {
      c.pages++; c.seen += items.length;
      const a = await upsertRows(TABLES.tt_videos, items.map((v) => M.video(v, w)));
      const b = await upsertRows(TABLES.tt_video_windows, items.map((v) => M.videoWindow(v, w)));
      c.changed += Math.max(a, b);
      await progress(ctx, c);
    }
  }),
  shop_daily: (ctx, c) => byWindows(ctx, c, 28, 14, async (w) => {
    // The daily figures come back inside "performance.intervals".
    const list = (d: Record<string, unknown>) => { const perf = (d.performance && typeof d.performance === "object" ? d.performance : d) as Record<string, unknown>; return Array.isArray(perf.intervals) ? perf.intervals : []; };
    await simple("/analytics/202405/shop/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end, granularity: "1D" }, sizes: [50], list }, "tt_shop_daily", M.shopDay, ctx, c);
  }),
  sample_orders: async (ctx, c) => {
    // Only the orders behind sample requests (shipping facts, no customer data); finished orders (completed / cancelled) are not asked for again.
    const need = await rows<{ order_id: string }>(sql`
      select distinct r.order_id from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id
      where r.order_id is not null and r.order_id <> '' and (o.order_id is null or o.is_final = false) order by 1`);
    const state = { size: 0 };
    // If TikTok fails on a group of ids, split it in half until the one id TikTok cannot handle is found, skip that one and carry on.
    const fetchIds = async (ids: string[]): Promise<void> => {
      try {
        const data = await callRetry("/order/202309/orders", { method: "GET", query: { ids: ids.join(",") } }, ctx.deps, state);
        const out = (pick("orders")(data) as Record<string, unknown>[]).map(M.order);
        c.pages++; c.seen += out.length;
        const ch = await upsertRows(TABLES.tt_orders, out); c.changed += ch;
        await progress(ctx, c);
        await (ctx.deps.sleep ?? defaultSleep)(ctx.deps.pauseMs ?? 120);
      } catch (e) {
        if (ids.length === 1) { // this order cannot be read: it is left out, counted, and an example is kept so the reason can be seen
          c.skipped = (c.skipped ?? 0) + 1;
          if ((c.skipExamples ?? []).length < 3) c.skipExamples = [...(c.skipExamples ?? []), ids[0]];
          c.skipWhy = e instanceof Error ? e.message.replace(/^TikTok said no \(\d+\): /, "").slice(0, 80) : undefined;
          return;
        }
        if (!/36009003|internal error|invalid|not found|36004/i.test(e instanceof Error ? e.message : "")) throw e;
        const mid = Math.ceil(ids.length / 2);
        await fetchIds(ids.slice(0, mid));
        await fetchIds(ids.slice(mid));
      }
    };
    await inGroups(need.map((n) => n.order_id), 20, 2, fetchIds);
  },
};

const lastError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

/** Runs one dataset: logs the run, never throws (a failure is recorded and the next dataset can still run). */
export async function runDataset(key: DatasetKey, trigger: "manual" | "schedule", userId: string | null, deps: SyncDeps = {}): Promise<RunResult> {
  const ds = DATASETS.find((d) => d.key === key)!;
  const cfg = deps.cfg === undefined ? tiktokConfig() : deps.cfg;
  const [busy] = await rows<{ n: number }>(sql`select count(*)::int as n from tt_sync_runs where dataset = ${key} and status = 'running' and started_at > now() - (${REPEAT_WINDOW_MIN}::int * interval '1 minute')`);
  if (busy.n > 0) return { dataset: key, status: "skipped", pages: 0, seen: 0, changed: 0, error: "Already running" };
  const [run] = await rows<{ id: number }>(sql`insert into tt_sync_runs (dataset, trigger, user_id) values (${key}, ${trigger}, ${userId}) returning id`);
  const [st] = await rows<{ watermark: Date | null }>(sql`select watermark from tt_sync_state where dataset = ${key}`);
  const now = (deps.now ?? (() => new Date()))();
  const watermark = st?.watermark ? new Date(st.watermark) : null;
  const full = !watermark || now.getTime() - watermark.getTime() > 24 * 3600_000;
  const c: Counter = { pages: 0, seen: 0, changed: 0 };
  try {
    await RUNNERS[key]({ deps: { ...deps, cfg }, full, watermark, runId: run.id, backfill: !!deps.backfill || !watermark, historyFrom: (await getSyncSettings()).historyFrom }, c);
    const [cnt] = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(ds.table)}`);
    const note = [c.skipped ? `${c.skipped.toLocaleString("en-MY")} skipped (TikTok would not return them${c.skipWhy ? `: ${c.skipWhy}` : ""}; e.g. ${(c.skipExamples ?? []).join(", ")})` : null, c.note ?? null].filter(Boolean).join(" · ") || null;
    await rows(sql`update tt_sync_runs set status = 'ok', finished_at = now(), pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed}, error = ${note} where id = ${run.id}`);
    await rows(sql`
      insert into tt_sync_state (dataset, watermark, last_success_at, records, last_error)
      values (${key}, ${full ? now.toISOString() : (watermark ?? now).toISOString()}::timestamptz, now(), ${cnt.n}, null)
      on conflict (dataset) do update set watermark = excluded.watermark, last_success_at = now(), records = excluded.records, last_error = null, updated_at = now()`);
    return { dataset: key, status: "ok", pages: c.pages, seen: c.seen, changed: c.changed, ...(note ? { error: note } : {}) };
  } catch (e) {
    const msg = lastError(e);
    await rows(sql`update tt_sync_runs set status = 'failed', finished_at = now(), pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed}, error = ${msg} where id = ${run.id}`);
    await rows(sql`
      insert into tt_sync_state (dataset, last_error, last_error_at) values (${key}, ${msg}, now())
      on conflict (dataset) do update set last_error = ${msg}, last_error_at = now(), updated_at = now()`);
    return { dataset: key, status: "failed", ...c, error: msg };
  }
}

/** Every dataset in turn. A failed one is recorded and the rest still run. */
export async function runAll(trigger: "manual" | "schedule", userId: string | null, deps: SyncDeps = {}): Promise<RunResult[]> {
  const [busy] = await rows<{ n: number }>(sql`select count(*)::int as n from tt_sync_runs where dataset = ${CYCLE} and status = 'running' and started_at > now() - (${CYCLE_WINDOW_MIN}::int * interval '1 minute')`);
  if (busy.n > 0) return [];
  // One "cycle" row stays open for the whole batch, so the screen never looks finished between two datasets.
  const [cycle] = await rows<{ id: number }>(sql`insert into tt_sync_runs (dataset, trigger, user_id) values (${CYCLE}, ${trigger}, ${userId}) returning id`);
  const out: RunResult[] = [];
  try {
    // The biggest datasets start first; up to POOL run side by side. Results are returned in the display order.
    const order: DatasetKey[] = ["affiliate_orders", "videos", "sample_requests", "returns", "cancellations", "products", "lives", "open_collabs", "shop_daily"];
    const done = new Map<DatasetKey, RunResult>();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(POOL, order.length) }, async () => {
      while (next < order.length) {
        const key = order[next++];
        done.set(key, await runDataset(key, trigger, userId, deps));
      }
    }));
    // Second step: sample orders need the sample requests to be in first.
    done.set("sample_orders", await runDataset("sample_orders", trigger, userId, deps));
    for (const d of DATASETS) out.push(done.get(d.key)!);
  } finally {
    const failed = out.filter((r) => r.status === "failed").length;
    await rows(sql`update tt_sync_runs set status = ${failed ? "failed" : "ok"}, finished_at = now(), rows_changed = ${out.reduce((a, r) => a + r.changed, 0)}, rows_seen = ${out.reduce((a, r) => a + r.seen, 0)}, error = ${failed ? `${failed} of ${out.length} failed` : null} where id = ${cycle.id}`);
  }
  return out;
}

/** Marks every run still shown as "running" as interrupted. Used when the app starts (a restart kills any sync in progress) and by the Reset button. */
export async function clearInterrupted(reason = "Interrupted – the app was restarted"): Promise<number> {
  coolUntil = 0;
  const res = await rows<{ id: number }>(sql`update tt_sync_runs set status = 'failed', finished_at = now(), error = ${reason} where status = 'running' returning id`);
  return res.length;
}

// ───────── settings and schedule ─────────
export type SyncSettings = { enabled: boolean; everyMinutes: number; /** The first day to load when reading the whole history (YYYY-MM-DD). */ historyFrom: string };
export const DEFAULT_HISTORY_FROM = "2025-03-01";
export const SYNC_CHOICES = [30, 60, 180, 720, 1440] as const;
const SKEY = "tiktok_sync";
/** Which column holds each table's date. */
const DATE_COL: Record<string, string> = { tt_affiliate_order_lines: "created_at", tt_orders: "created_at", tt_videos: "posted_at", tt_lives: "started_at", tt_returns: "created_at", tt_cancellations: "created_at", tt_shop_daily: "day", tt_sample_requests: "first_seen_at", tt_open_collabs: "commission_start" };

export async function getSyncSettings(): Promise<SyncSettings> {
  const [r] = await rows<{ value: Partial<SyncSettings> }>(sql`select value from settings where key = ${SKEY}`);
  const v = r?.value ?? {};
  return { enabled: v.enabled !== false, everyMinutes: (SYNC_CHOICES as readonly number[]).includes(Number(v.everyMinutes)) ? Number(v.everyMinutes) : 60, historyFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(v.historyFrom)) ? String(v.historyFrom) : DEFAULT_HISTORY_FROM };
}
export async function saveSyncSettings(patch: Partial<SyncSettings>): Promise<void> {
  const s = { ...(await getSyncSettings()), ...patch };
  await rows(sql`insert into settings (key, value) values (${SKEY}, ${JSON.stringify(s)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

/** Pure: is a scheduled sync due? */
export function isDue(nowMs: number, lastStartedMs: number | null, s: Pick<SyncSettings, "enabled" | "everyMinutes">): boolean {
  return s.enabled && (lastStartedMs == null || nowMs - lastStartedMs >= s.everyMinutes * 60_000);
}

// ───────── what the screen shows ─────────
export type DatasetView = { key: DatasetKey; label: string; icon: string; what: string; records: number; lastSuccessAt: string | null; lastError: string | null; /** The oldest and newest record held (dates), so you can see how far back the data goes. */ oldest: string | null; newest: string | null; /** A warning from the latest successful run, e.g. how many records TikTok would not return. */ note: string | null; running: boolean; progress: number | null };
export type RunView = { id: number; dataset: DatasetKey; label: string; startedAt: string; durationSec: number | null; status: string; trigger: string; changed: number; seen: number; error: string | null; by: string | null };
export type SyncOverview = { /** The server's clock when this was built (lets the first browser render match the server's). */ now: number; datasets: DatasetView[]; runs: RunView[]; running: boolean; lastFullAt: string | null; nextAt: string | null; settings: SyncSettings };

export async function syncOverview(): Promise<SyncOverview> {
  const [states, running, runs, lastSched, settings, latest] = await Promise.all([
    rows<{ dataset: string; records: number; last_success_at: Date | null; last_error: string | null }>(sql`select dataset, records, last_success_at, last_error from tt_sync_state`),
    rows<{ dataset: string; seen: number }>(sql`select dataset, max(rows_seen)::int as seen from tt_sync_runs where status = 'running' and started_at > now() - (case when dataset = ${CYCLE} then ${CYCLE_WINDOW_MIN}::int else ${REPEAT_WINDOW_MIN}::int end * interval '1 minute') group by dataset`),
    rows<{ id: number; dataset: string; started_at: Date; finished_at: Date | null; status: string; trigger: string; rows_changed: number; rows_seen: number; error: string | null; by: string | null }>(sql`
      select r.id, r.dataset, r.started_at, r.finished_at, r.status, r.trigger, r.rows_changed, r.rows_seen, r.error, u.name as by
      from tt_sync_runs r left join users u on u.id = r.user_id where r.dataset <> ${CYCLE} order by r.started_at desc, r.id desc limit 30`),
    rows<{ t: Date | null }>(sql`select max(started_at) as t from tt_sync_runs where dataset = ${CYCLE}`),
    getSyncSettings(),
    rows<{ dataset: string; status: string; error: string | null }>(sql`select distinct on (dataset) dataset, status, error from tt_sync_runs where dataset <> ${CYCLE} order by dataset, started_at desc, id desc`),
  ]);
  const lastRun = new Map(latest.map((r) => [r.dataset, r]));
  const spans = new Map<string, { a: string | null; b: string | null }>();
  for (const d of DATASETS) {
    const col = DATE_COL[d.table];
    if (!col) continue;
    const [r] = await rows<{ a: string | null; b: string | null }>(sql`select to_char(min(${sql.raw(col)}), 'YYYY-MM-DD') as a, to_char(max(${sql.raw(col)}), 'YYYY-MM-DD') as b from ${sql.raw(d.table)}`);
    spans.set(d.key, r);
  }
  const st = new Map(states.map((s) => [s.dataset, s]));
  const run = new Map(running.map((r) => [r.dataset, r.seen]));
  const label = new Map(DATASETS.map((d) => [d.key, d.label]));
  const times = states.map((s) => s.last_success_at).filter((x): x is Date => !!x).map((x) => new Date(x).getTime());
  const last = lastSched[0]?.t ? new Date(lastSched[0].t).getTime() : null;
  return {
    now: Date.now(),
    datasets: DATASETS.map((d) => ({ key: d.key, label: d.label, icon: d.icon, what: d.what, records: st.get(d.key)?.records ?? 0, lastSuccessAt: st.get(d.key)?.last_success_at ? new Date(st.get(d.key)!.last_success_at!).toISOString() : null, lastError: lastRun.get(d.key)?.status === "ok" ? null : (st.get(d.key)?.last_error ?? null), note: lastRun.get(d.key)?.status === "ok" ? (lastRun.get(d.key)?.error ?? null) : null, oldest: spans.get(d.key)?.a ?? null, newest: spans.get(d.key)?.b ?? null, running: run.has(d.key), progress: run.has(d.key) ? (run.get(d.key) ?? 0) : null })),
    runs: runs.map((r) => ({ id: r.id, dataset: r.dataset as DatasetKey, label: label.get(r.dataset as DatasetKey) ?? r.dataset, startedAt: new Date(r.started_at).toISOString(), durationSec: r.finished_at ? Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)) : null, status: r.status, trigger: r.trigger, changed: r.rows_changed, seen: r.rows_seen, error: r.error, by: r.by })),
    running: running.length > 0,
    lastFullAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    nextAt: settings.enabled && last ? new Date(last + settings.everyMinutes * 60_000).toISOString() : null,
    settings,
  };
}

// ───────── trust check: API figures against the uploaded files ─────────
export type TrustCheck = { from: string; to: string; api: { orders: number; gmv: number }; upload: { orders: number; gmv: number } | null; diffPct: number | null };

/** The latest 28 days of affiliate sales, from the API tables and from the uploaded files, side by side. */
export async function trustCheck(): Promise<TrustCheck | null> {
  const [apiEnd] = await rows<{ d: string | null }>(sql`select to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as d from tt_affiliate_order_lines`);
  if (!apiEnd?.d) return null;
  // Compare the same days: the latest 28 days up to the earlier of the two last dates (uploaded files usually stop sooner than the API).
  let upEnd: string | null = null;
  try {
    const { AL } = await import("@/lib/analytics/sql");
    const [u] = await rows<{ d: string | null }>(sql`select to_char(max(al.created_at), 'YYYY-MM-DD') as d from ${AL}`);
    upEnd = u?.d ?? null;
  } catch { upEnd = null; }
  const ref = { d: upEnd && upEnd < apiEnd.d ? upEnd : apiEnd.d };
  const from = addDaysISO(ref.d, -27);
  const [a] = await rows<{ orders: number; gmv: number }>(sql`
    select count(distinct order_id)::int as orders, coalesce(sum(price * quantity) filter (where coalesce(fully_return, false) = false), 0)::float8 as gmv
    from tt_affiliate_order_lines where (created_at at time zone 'Asia/Kuala_Lumpur')::date between ${from}::date and ${ref.d}::date`);
  let upload: TrustCheck["upload"] = null;
  try {
    const { AL } = await import("@/lib/analytics/sql");
    const [u] = await rows<{ orders: number; gmv: number }>(sql`
      select (count(distinct al.order_id) filter (where al.valid))::int as orders, coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as gmv
      from ${AL} where al.created_at::date between ${from}::date and ${ref.d}::date`);
    if (u && u.orders > 0) upload = u;
  } catch { upload = null; }
  return { from, to: ref.d, api: a, upload, diffPct: upload && upload.gmv > 0 ? ((a.gmv - upload.gmv) / upload.gmv) * 100 : null };
}
