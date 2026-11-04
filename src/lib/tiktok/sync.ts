import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { addDaysISO, todayKL } from "@/lib/time";
import { callApi, tiktokConfig, type Fetch, type TikTokConfig } from "./client";
import * as M from "./map";
import { str } from "./map";

export type DatasetKey = "products" | "affiliate_orders" | "sample_requests" | "videos" | "lives" | "returns" | "cancellations" | "shop_daily";

export type SyncDeps = { cfg?: TikTokConfig | null; f?: Fetch; sleep?: (ms: number) => Promise<void>; pauseMs?: number; now?: () => Date };
export type RunResult = { dataset: DatasetKey; status: "ok" | "failed" | "skipped"; pages: number; seen: number; changed: number; error?: string };

/** Display order = run order. `table` is where the rows land. */
export const DATASETS: { key: DatasetKey; label: string; table: string; icon: string; what: string }[] = [
  { key: "products", label: "Products & stock", table: "tt_skus", icon: "package", what: "SKUs" },
  { key: "affiliate_orders", label: "Affiliate orders", table: "tt_affiliate_order_lines", icon: "receipt", what: "order lines" },
  { key: "sample_requests", label: "Sample requests", table: "tt_sample_requests", icon: "gift", what: "requests" },
  { key: "videos", label: "Videos", table: "tt_videos", icon: "video", what: "videos" },
  { key: "lives", label: "LIVE sessions", table: "tt_lives", icon: "radio", what: "sessions" },
  { key: "returns", label: "Returns", table: "tt_returns", icon: "undo", what: "returns" },
  { key: "cancellations", label: "Cancellations", table: "tt_cancellations", icon: "x", what: "cancellations" },
  { key: "shop_daily", label: "Shop performance", table: "tt_shop_daily", icon: "chart", what: "days" },
];

const MAX_PAGES = 600;
const REPEAT_WINDOW_MIN = 20;
/** The row that stays open while a whole sync (every dataset) is in progress. */
export const CYCLE = "_all";
const CYCLE_WINDOW_MIN = 90;
type Table = { name: string; pk: string[]; cols: Record<string, string> };

const TABLES: Record<string, Table> = {
  tt_affiliate_order_lines: { name: "tt_affiliate_order_lines", pk: ["order_id", "sku_id"], cols: { order_id: "text", sku_id: "text", created_at: "timestamptz", delivery_at: "timestamptz", creator: "text", content_id: "text", content_type: "text", product_id: "text", seller_sku: "text", sku_name: "text", quantity: "int", price: "numeric", currency: "text", commission_rate: "numeric", est_commission: "numeric", paid_commission: "numeric", settlement_status: "text", fully_return: "boolean", open_collab_id: "text", target_collab_id: "text", campaign_id: "text" } },
  tt_videos: { name: "tt_videos", pk: ["video_id"], cols: { video_id: "text", creator: "text", title: "text", posted_at: "timestamptz", views: "bigint", gmv: "numeric", units_sold: "int", click_through_rate: "numeric", products: "jsonb", window_start: "date", window_end: "date" } },
  tt_lives: { name: "tt_lives", pk: ["live_id"], cols: { live_id: "text", creator: "text", title: "text", started_at: "timestamptz", ended_at: "timestamptz", gmv: "numeric", items_sold: "int", sku_orders: "int", customers: "int", viewers: "bigint", views: "bigint", avg_viewing_seconds: "numeric", new_followers: "int", likes: "int", comments: "int", shares: "int", product_clicks: "int", click_through_rate: "numeric", click_to_order_rate: "numeric" } },
  tt_sample_requests: { name: "tt_sample_requests", pk: ["id"], cols: { id: "text", status: "text", creator_id: "text", creator: "text", nickname: "text", followers: "bigint", creator_gmv: "numeric", creator_videos: "int", creator_video_views: "bigint", fulfilment_pct: "numeric", product_id: "text", sku_id: "text", product_title: "text", sku_name: "text", commission_rate: "numeric", order_id: "text", is_approvable: "boolean", expires_at: "timestamptz", available_quantity: "int" } },
  tt_skus: { name: "tt_skus", pk: ["sku_id"], cols: { sku_id: "text", product_id: "text", product_title: "text", seller_sku: "text", price: "numeric", currency: "text", stock: "int", product_status: "text", updated_at: "timestamptz" } },
  tt_returns: { name: "tt_returns", pk: ["return_id"], cols: { return_id: "text", order_id: "text", status: "text", return_type: "text", reason: "text", refund_amount: "numeric", currency: "text", skus: "jsonb", created_at: "timestamptz", updated_at: "timestamptz" } },
  tt_cancellations: { name: "tt_cancellations", pk: ["cancel_id"], cols: { cancel_id: "text", order_id: "text", status: "text", cancel_type: "text", reason: "text", skus: "jsonb", created_at: "timestamptz", updated_at: "timestamptz" } },
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

/** Walks every page of an endpoint: patient with TikTok's shared rate limit, and steps down the page size if TikTok refuses it. */
async function* walk(path: string, o: PageOpts, deps: SyncDeps): AsyncGenerator<{ items: Record<string, unknown>[]; page: number }> {
  const sleep = deps.sleep ?? defaultSleep;
  let size = 0;
  let token: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data: Record<string, unknown> | null = null;
    for (let attempt = 0; ; attempt++) {
      if (coolUntil > Date.now()) await sleep(coolUntil - Date.now());
      try {
        data = (await callApi<Record<string, unknown>>(path, { cfg: deps.cfg, f: deps.f, method: o.method, body: o.body, query: { ...(o.query ?? {}), page_size: String(o.sizes[size]), ...(token ? { page_token: token } : {}) } })) ?? {};
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/36009002|rate limit|too many requests/i.test(msg) && attempt < 6) { coolUntil = Date.now() + 3000 * (attempt + 1); await sleep(3000 * (attempt + 1)); continue; }
        if (/page.?size/i.test(msg) && size < o.sizes.length - 1) { size++; continue; }
        throw e;
      }
    }
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

type Ctx = { deps: SyncDeps; full: boolean; watermark: Date | null; runId: number };
type Counter = { pages: number; seen: number; changed: number };
/** Lets the screen show "1,200 so far" while a dataset runs. */
const progress = (ctx: Ctx, c: Counter) => rows(sql`update tt_sync_runs set pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed} where id = ${ctx.runId}`);

async function simple(path: string, o: PageOpts, table: string, mapRow: (r: Record<string, unknown>) => M.Row | M.Row[], ctx: Ctx, c: Counter) {
  for await (const { items, page } of walk(path, o, ctx.deps)) {
    const out = items.flatMap((r): M.Row[] => { const m = mapRow(r); return Array.isArray(m) ? m : [m]; });
    c.pages = page; c.seen += out.length;
    c.changed += await upsertRows(TABLES[table], out);
    await progress(ctx, c);
  }
}

const windowOf = (days: number, endOffset = 0) => {
  const end = addDaysISO(todayKL(), 1 - endOffset); // end is exclusive
  return { start: addDaysISO(end, -days), end };
};

const RUNNERS: Record<DatasetKey, (ctx: Ctx, c: Counter) => Promise<void>> = {
  products: (ctx, c) => simple("/product/202309/products/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("products") }, "tt_skus", M.skus, ctx, c),
  sample_requests: (ctx, c) => simple("/affiliate_seller/202409/sample_applications/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("sample_applications", "applications") }, "tt_sample_requests", M.sampleRequest, ctx, c),
  returns: (ctx, c) => simple("/return_refund/202309/returns/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("return_orders", "returns") }, "tt_returns", M.returnRow, ctx, c),
  cancellations: (ctx, c) => simple("/return_refund/202309/cancellations/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("cancellations") }, "tt_cancellations", M.cancellation, ctx, c),
  lives: async (ctx, c) => {
    const w = windowOf(28);
    await simple("/analytics/202509/shop_lives/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end }, sizes: [100, 50, 20, 10], list: pick("live_stream_sessions", "lives") }, "tt_lives", M.live, ctx, c);
  },
  videos: async (ctx, c) => {
    // First run also fills the two 28-day windows before, oldest first so the newest numbers win.
    const windows = ctx.watermark ? [windowOf(28)] : [windowOf(28, 56), windowOf(28, 28), windowOf(28)];
    for (const w of windows) await simple("/analytics/202409/shop_videos/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end }, sizes: [100, 50, 20, 10], list: pick("videos") }, "tt_videos", (v) => M.video(v, w), ctx, c);
  },
  shop_daily: async (ctx, c) => {
    const w = windowOf(ctx.watermark ? 14 : 90);
    for await (const { items } of walk("/analytics/202405/shop/performance", { method: "GET", query: { start_date_ge: w.start, end_date_lt: w.end, granularity: "1D" }, sizes: [50], list: (d) => (Array.isArray(d.intervals) ? d.intervals : firstList(d)) }, ctx.deps)) {
      const out = items.map(M.shopDay);
      c.pages++; c.seen += out.length; c.changed += await upsertRows(TABLES.tt_shop_daily, out);
      await progress(ctx, c);
    }
  },
  affiliate_orders: async (ctx, c) => {
    // Full scan the first time and once a day; in between stop as soon as a whole page is older than the last full scan (newest-first order).
    const cut = ctx.full || !ctx.watermark ? null : ctx.watermark.getTime() - 3 * 86400_000;
    let newestFirst: boolean | null = null;
    for await (const { items, page } of walk("/affiliate_seller/202410/orders/search", { method: "POST", body: {}, sizes: [100, 50, 20, 10], list: pick("orders") }, ctx.deps)) {
      const out = items.flatMap((o) => M.affiliateOrderLines(o));
      c.pages = page; c.seen += out.length;
      c.changed += await upsertRows(TABLES.tt_affiliate_order_lines, out);
      await progress(ctx, c);
      const times = items.map((o) => Number(o.create_time) * 1000).filter((n) => Number.isFinite(n));
      if (newestFirst === null && times.length > 1) newestFirst = times[0] >= times[times.length - 1];
      if (cut && newestFirst && times.length && Math.max(...times) < cut) return;
    }
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
    await RUNNERS[key]({ deps: { ...deps, cfg }, full, watermark, runId: run.id }, c);
    const [cnt] = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(ds.table)}`);
    await rows(sql`update tt_sync_runs set status = 'ok', finished_at = now(), pages = ${c.pages}, rows_seen = ${c.seen}, rows_changed = ${c.changed} where id = ${run.id}`);
    await rows(sql`
      insert into tt_sync_state (dataset, watermark, last_success_at, records, last_error)
      values (${key}, ${full ? now.toISOString() : (watermark ?? now).toISOString()}::timestamptz, now(), ${cnt.n}, null)
      on conflict (dataset) do update set watermark = excluded.watermark, last_success_at = now(), records = excluded.records, last_error = null, updated_at = now()`);
    return { dataset: key, status: "ok", ...c };
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
    const order: DatasetKey[] = ["affiliate_orders", "videos", "sample_requests", "products", "lives", "returns", "cancellations", "shop_daily"];
    const done = new Map<DatasetKey, RunResult>();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(POOL, order.length) }, async () => {
      while (next < order.length) {
        const key = order[next++];
        done.set(key, await runDataset(key, trigger, userId, deps));
      }
    }));
    for (const d of DATASETS) out.push(done.get(d.key)!);
  } finally {
    const failed = out.filter((r) => r.status === "failed").length;
    await rows(sql`update tt_sync_runs set status = ${failed ? "failed" : "ok"}, finished_at = now(), rows_changed = ${out.reduce((a, r) => a + r.changed, 0)}, rows_seen = ${out.reduce((a, r) => a + r.seen, 0)}, error = ${failed ? `${failed} of ${out.length} failed` : null} where id = ${cycle.id}`);
  }
  return out;
}

// ───────── settings and schedule ─────────
export type SyncSettings = { enabled: boolean; everyMinutes: number };
export const SYNC_CHOICES = [30, 60, 180, 720, 1440] as const;
const SKEY = "tiktok_sync";

export async function getSyncSettings(): Promise<SyncSettings> {
  const [r] = await rows<{ value: Partial<SyncSettings> }>(sql`select value from settings where key = ${SKEY}`);
  const v = r?.value ?? {};
  return { enabled: v.enabled !== false, everyMinutes: (SYNC_CHOICES as readonly number[]).includes(Number(v.everyMinutes)) ? Number(v.everyMinutes) : 60 };
}
export async function saveSyncSettings(s: SyncSettings): Promise<void> {
  await rows(sql`insert into settings (key, value) values (${SKEY}, ${JSON.stringify(s)}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

/** Pure: is a scheduled sync due? */
export function isDue(nowMs: number, lastStartedMs: number | null, s: SyncSettings): boolean {
  return s.enabled && (lastStartedMs == null || nowMs - lastStartedMs >= s.everyMinutes * 60_000);
}

// ───────── what the screen shows ─────────
export type DatasetView = { key: DatasetKey; label: string; icon: string; what: string; records: number; lastSuccessAt: string | null; lastError: string | null; running: boolean; progress: number | null };
export type RunView = { id: number; dataset: DatasetKey; label: string; startedAt: string; durationSec: number | null; status: string; trigger: string; changed: number; seen: number; error: string | null; by: string | null };
export type SyncOverview = { /** The server's clock when this was built (lets the first browser render match the server's). */ now: number; datasets: DatasetView[]; runs: RunView[]; running: boolean; lastFullAt: string | null; nextAt: string | null; settings: SyncSettings };

export async function syncOverview(): Promise<SyncOverview> {
  const [states, running, runs, lastSched, settings] = await Promise.all([
    rows<{ dataset: string; records: number; last_success_at: Date | null; last_error: string | null }>(sql`select dataset, records, last_success_at, last_error from tt_sync_state`),
    rows<{ dataset: string; seen: number }>(sql`select dataset, max(rows_seen)::int as seen from tt_sync_runs where status = 'running' and started_at > now() - (case when dataset = ${CYCLE} then ${CYCLE_WINDOW_MIN}::int else ${REPEAT_WINDOW_MIN}::int end * interval '1 minute') group by dataset`),
    rows<{ id: number; dataset: string; started_at: Date; finished_at: Date | null; status: string; trigger: string; rows_changed: number; rows_seen: number; error: string | null; by: string | null }>(sql`
      select r.id, r.dataset, r.started_at, r.finished_at, r.status, r.trigger, r.rows_changed, r.rows_seen, r.error, u.name as by
      from tt_sync_runs r left join users u on u.id = r.user_id where r.dataset <> ${CYCLE} order by r.started_at desc, r.id desc limit 30`),
    rows<{ t: Date | null }>(sql`select max(started_at) as t from tt_sync_runs where dataset = ${CYCLE}`),
    getSyncSettings(),
  ]);
  const st = new Map(states.map((s) => [s.dataset, s]));
  const run = new Map(running.map((r) => [r.dataset, r.seen]));
  const label = new Map(DATASETS.map((d) => [d.key, d.label]));
  const times = states.map((s) => s.last_success_at).filter((x): x is Date => !!x).map((x) => new Date(x).getTime());
  const last = lastSched[0]?.t ? new Date(lastSched[0].t).getTime() : null;
  return {
    now: Date.now(),
    datasets: DATASETS.map((d) => ({ key: d.key, label: d.label, icon: d.icon, what: d.what, records: st.get(d.key)?.records ?? 0, lastSuccessAt: st.get(d.key)?.last_success_at ? new Date(st.get(d.key)!.last_success_at!).toISOString() : null, lastError: st.get(d.key)?.last_error ?? null, running: run.has(d.key), progress: run.has(d.key) ? (run.get(d.key) ?? 0) : null })),
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
  const [ref] = await rows<{ d: string | null }>(sql`select to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as d from tt_affiliate_order_lines`);
  if (!ref?.d) return null;
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
