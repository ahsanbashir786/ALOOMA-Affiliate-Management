import "server-only";
import { sql as pg } from "@/db";
import { ShopeeApiError, shopeeCall, shopeeConfig, shopeeConnectionInfo, type Fetch, type ShopeeConfig } from "./client";
import { mapShopeeAdsDay, mapShopeeEscrow, mapShopeeOrder, mapShopeeRelease, mapShopeeReturn, mapShopeeStock, mapShopeeWallet } from "./map";

// Shopee orders and payments into our own tables. Orders are read by the time they were last changed, in windows of 14 days
// (Shopee allows at most 15), so a status change is picked up again. Payments (escrow) are read for every order that has none yet
// or whose order changed since. Two datasets, kept in tt_sync_state like the TikTok ones: shopee_orders and shopee_escrow.

const DAY = 86_400;
const WINDOW = 14 * DAY;
export const SHOPEE_DATASETS = { orders: "shopee_orders", escrow: "shopee_escrow", release: "shopee_release", returns: "shopee_returns", ads: "shopee_ads", wallet: "shopee_wallet", stock: "shopee_stock" } as const;
export type ShopeeDatasetKey = keyof typeof SHOPEE_DATASETS;
/** What each dataset is, in the order they run. */
export const SHOPEE_DATASET_LIST: { key: ShopeeDatasetKey; label: string; what: string }[] = [
  { key: "orders", label: "Orders", what: "Every order with its items and status" },
  { key: "escrow", label: "Payments", what: "What Shopee pays for each order and every fee it takes" },
  { key: "release", label: "Payment Release Dates", what: "The day Shopee released the money for each order" },
  { key: "returns", label: "Returns", what: "Returned and refunded orders; the pieces go back into stock" },
  { key: "ads", label: "Shopee Ads", what: "Ad spend and sales from ads, day by day" },
  { key: "wallet", label: "Wallet", what: "Money in and out of your Shopee wallet, withdrawals to the bank" },
  { key: "stock", label: "Stock At Shopee (FBS)", what: "What is in your warehouse and in Shopee's warehouse, per SKU" },
];
export const DEFAULT_HISTORY_DAYS = 180;
/** An order that was still moving is read again for this many days back, so late changes are never missed. */
const OVERLAP = 2 * DAY;

export type ShopeeSyncDeps = { f?: Fetch; cfg?: ShopeeConfig | null; nowSec?: number; sleep?: (ms: number) => Promise<void>; budgetMs?: number };
export type ShopeeDatasetResult = { key: ShopeeDatasetKey; label: string; ok: boolean; rows: number; error: string | null };
export type ShopeeSyncResult = { ok: boolean; orders: number; escrow: number; windows: number; error: string | null; note: string | null; datasets: ShopeeDatasetResult[] };

let running = false;
export const isShopeeSyncRunning = () => running;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const text = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Shopee limits how fast it can be asked: wait a little and try again a few times before giving up. */
async function call<T>(path: string, deps: ShopeeSyncDeps, o: { query?: Record<string, unknown>; body?: unknown; method?: "GET" | "POST" }): Promise<T> {
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try { return await shopeeCall<T>(path, { cfg: deps.cfg ?? undefined, f: deps.f, ...o }); }
    catch (e) {
      if (e instanceof ShopeeApiError && (e.isRateLimit || e.isServer) && attempt < 4) { await sleep(1500 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

async function saveState(dataset: string, patch: { watermark?: Date | null; ok?: boolean; error?: string | null; records?: number }) {
  if (patch.ok) {
    await pg`insert into tt_sync_state (dataset, watermark, last_success_at, records, last_error) values (${dataset}, ${patch.watermark ? patch.watermark.toISOString() : null}, now(), ${patch.records ?? 0}, null)
      on conflict (dataset) do update set watermark = coalesce(excluded.watermark, tt_sync_state.watermark), last_success_at = now(), records = excluded.records, last_error = null, updated_at = now()`;
  } else {
    await pg`insert into tt_sync_state (dataset, last_error, last_error_at) values (${dataset}, ${patch.error ?? "failed"}, now())
      on conflict (dataset) do update set last_error = ${patch.error ?? "failed"}, last_error_at = now(), updated_at = now()`;
  }
}

async function listOrderSns(from: number, to: number, deps: ShopeeSyncDeps): Promise<string[]> {
  const out: string[] = [];
  let cursor = "";
  for (let page = 0; page < 500; page++) {
    const r = await call<{ more?: boolean; next_cursor?: string; order_list?: { order_sn?: string }[] }>("/api/v2/order/get_order_list", deps, {
      query: { time_range_field: "update_time", time_from: from, time_to: to, page_size: 100, ...(cursor ? { cursor } : {}) },
    });
    for (const o of r.order_list ?? []) if (o.order_sn) out.push(String(o.order_sn));
    if (!r.more || !r.next_cursor) break;
    cursor = String(r.next_cursor);
  }
  return out;
}

const DETAIL_FIELDS = "item_list,pay_time,total_amount,fulfillment_flag,payment_method";

async function saveOrders(sns: string[], deps: ShopeeSyncDeps, shopId: string | null): Promise<number> {
  let saved = 0;
  for (let i = 0; i < sns.length; i += 50) {
    const chunk = sns.slice(i, i + 50);
    const r = await call<{ order_list?: Record<string, unknown>[] }>("/api/v2/order/get_order_detail", deps, { query: { order_sn_list: chunk.join(","), response_optional_fields: DETAIL_FIELDS } });
    const rows = (r.order_list ?? []).map(mapShopeeOrder).filter((x): x is NonNullable<typeof x> => !!x);
    await pg.begin(async (tx) => {
      for (const o of rows) {
        await tx`insert into shopee_orders (order_sn, shop_id, status, created_at, paid_at, remote_updated_at, total_amount, currency, is_fbs, items, pieces, synced_at)
          values (${o.orderSn}, ${shopId}, ${o.status}, ${o.createdAt}, ${o.paidAt}, ${o.updatedAt}, ${o.totalAmount}, ${o.currency}, ${o.isFbs}, ${JSON.stringify(o.items)}::jsonb, ${o.pieces}, now())
          on conflict (order_sn) do update set status = excluded.status, paid_at = excluded.paid_at, remote_updated_at = excluded.remote_updated_at, total_amount = excluded.total_amount,
            currency = excluded.currency, is_fbs = excluded.is_fbs, items = excluded.items, pieces = excluded.pieces,
            -- only a real change makes the order "new" again (its payment figures are then read again)
            synced_at = case when shopee_orders.remote_updated_at is distinct from excluded.remote_updated_at or shopee_orders.status is distinct from excluded.status then now() else shopee_orders.synced_at end`;
      }
    });
    saved += rows.length;
  }
  return saved;
}

/** Orders whose payment figures are missing, or that changed after the figures were read. Newest first. */
async function escrowCandidates(limit: number): Promise<string[]> {
  const r = await pg`
    select o.order_sn from shopee_orders o left join shopee_escrow e on e.order_sn = o.order_sn
    where o.status in ('READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED', 'RETURNED', 'TO_RETURN')
      and ((e.order_sn is null and (o.escrow_checked_at is null or o.escrow_checked_at < now() - interval '6 hours' or o.synced_at > o.escrow_checked_at)) or o.synced_at > e.synced_at)
    order by o.created_at desc limit ${limit}`;
  return r.map((x) => String(x.order_sn));
}

async function saveEscrow(sns: string[], deps: ShopeeSyncDeps): Promise<number> {
  let saved = 0;
  for (let i = 0; i < sns.length; i += 50) {
    const chunk = sns.slice(i, i + 50);
    const r = await call<unknown>("/api/v2/payment/get_escrow_detail_batch", deps, { method: "POST", body: { order_sn_list: chunk } });
    const list = (Array.isArray(r) ? r : Array.isArray((r as { response?: unknown }).response) ? (r as { response: unknown[] }).response : []) as Record<string, unknown>[];
    const rows = list.map(mapShopeeEscrow).filter((x): x is NonNullable<typeof x> => !!x);
    const got = new Set(rows.map((x) => x.orderSn));
    await pg.begin(async (tx) => {
      for (const e of rows) {
        await tx`insert into shopee_escrow (order_sn, escrow_amount, original_price, seller_discount, voucher_seller, commission_fee, service_fee, transaction_fee, ams_fee, actual_shipping_fee, buyer_shipping_fee, shipping_rebate, reverse_shipping_fee, refund_amount, compensation, raw, synced_at)
          values (${e.orderSn}, ${e.escrowAmount}, ${e.originalPrice}, ${e.sellerDiscount}, ${e.voucherSeller}, ${e.commissionFee}, ${e.serviceFee}, ${e.transactionFee}, ${e.amsFee}, ${e.actualShippingFee}, ${e.buyerShippingFee}, ${e.shippingRebate}, ${e.reverseShippingFee}, ${e.refundAmount}, ${e.compensation}, ${JSON.stringify(e.raw)}::jsonb, now())
          on conflict (order_sn) do update set escrow_amount = excluded.escrow_amount, original_price = excluded.original_price, seller_discount = excluded.seller_discount, voucher_seller = excluded.voucher_seller,
            commission_fee = excluded.commission_fee, service_fee = excluded.service_fee, transaction_fee = excluded.transaction_fee, ams_fee = excluded.ams_fee, actual_shipping_fee = excluded.actual_shipping_fee,
            buyer_shipping_fee = excluded.buyer_shipping_fee, shipping_rebate = excluded.shipping_rebate, reverse_shipping_fee = excluded.reverse_shipping_fee, refund_amount = excluded.refund_amount,
            compensation = excluded.compensation, raw = excluded.raw, synced_at = now()`;
      }
      // An order Shopee has no figures for yet is not asked again for a few hours: remember we looked.
      for (const sn of chunk) if (!got.has(sn)) await tx`update shopee_orders set escrow_checked_at = now() where order_sn = ${sn}`;
    });
    saved += rows.length;
  }
  return saved;
}

// ───────── The other datasets ─────────

/** Walks from `from` to `to` in windows, saving the progress after each, so a stopped sync carries on where it was. */
async function windowed(key: ShopeeDatasetKey, ctx: Ctx, step: number, fetchWindow: (from: number, to: number) => Promise<number>, countSql: () => Promise<number>): Promise<number> {
  const dataset = SHOPEE_DATASETS[key];
  const [st] = await pg`select watermark from tt_sync_state where dataset = ${dataset}`;
  const wm = st?.watermark ? Math.floor(new Date(st.watermark as Date).getTime() / 1000) : null;
  const history = (ctx.historyDays ?? DEFAULT_HISTORY_DAYS) * DAY;
  let from = wm ? wm - OVERLAP : ctx.now - history;
  if (ctx.historyDays && wm) from = Math.min(from, ctx.now - history); // asked to read further back
  let rows = 0, stopped = false;
  while (from < ctx.now) {
    if (Date.now() - ctx.started > ctx.budget) { ctx.res.note = "Stopped early to stay within the time limit; the next sync carries on."; stopped = true; break; }
    const to = Math.min(from + step, ctx.now);
    rows += await fetchWindow(from, to);
    if (key === "orders") ctx.res.windows++;
    await saveState(dataset, { ok: true, watermark: new Date(to * 1000), records: 0 });
    from = to;
  }
  await saveState(dataset, { ok: true, watermark: stopped ? undefined : new Date(ctx.now * 1000), records: await countSql() });
  return rows;
}

type Ctx = { deps: ShopeeSyncDeps; now: number; started: number; budget: number; historyDays?: number; res: ShopeeSyncResult; shopId: string | null; force: boolean };
const arr = (r: unknown, ...keys: string[]): Record<string, unknown>[] => {
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  const o = (r ?? {}) as Record<string, unknown>;
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  return [];
};
const count = async (table: string) => Number((await pg.unsafe(`select count(*)::int as n from ${table}`))[0].n);
const ddmmyyyy = (sec: number) => { const d = new Date((sec + 8 * 3600) * 1000); return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`; };

/** Pages by page_no (starting at 0) until Shopee says there is no more. */
async function paged(path: string, ctx: Ctx, query: Record<string, unknown>, pick: (r: Record<string, unknown>) => Record<string, unknown>[], size = 100): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < 300; page++) {
    const r = await call<Record<string, unknown>>(path, ctx.deps, { query: { ...query, page_no: page, page_size: size } });
    out.push(...pick(r));
    if (!r.more) break;
  }
  return out;
}

async function runOrders(ctx: Ctx): Promise<number> {
  const rows = await windowed("orders", ctx, WINDOW, async (from, to) => saveOrders(await listOrderSns(from, to, ctx.deps), ctx.deps, ctx.shopId), () => count("shopee_orders"));
  ctx.res.orders += rows;
  return rows;
}

async function runEscrow(ctx: Ctx): Promise<number> {
  let n = 0;
  for (let round = 0; round < 60; round++) {
    if (Date.now() - ctx.started > ctx.budget) { ctx.res.note = "Stopped early to stay within the time limit; the next sync carries on."; break; }
    const sns = await escrowCandidates(200);
    if (!sns.length) break;
    n += await saveEscrow(sns, ctx.deps); // orders Shopee has no figures for are marked as asked, so the next round moves on
  }
  ctx.res.escrow += n;
  await saveState(SHOPEE_DATASETS.escrow, { ok: true, watermark: new Date(ctx.now * 1000), records: await count("shopee_escrow") });
  return n;
}

/** The day Shopee released the money for each order (get_escrow_list). */
async function runRelease(ctx: Ctx): Promise<number> {
  return windowed("release", ctx, WINDOW, async (from, to) => {
    const rows = (await paged("/api/v2/payment/get_escrow_list", ctx, { release_time_from: from, release_time_to: to }, (r) => arr(r, "escrow_list"))).map(mapShopeeRelease).filter((x): x is NonNullable<typeof x> => !!x);
    if (rows.length) await pg.begin(async (tx) => {
      for (const r of rows) await tx`update shopee_escrow set released_at = ${r.releasedAt}, payout_amount = ${r.payoutAmount} where order_sn = ${r.orderSn}`;
    });
    return rows.length;
  }, async () => Number((await pg`select count(*)::int as n from shopee_escrow where released_at is not null`)[0].n));
}

async function runReturns(ctx: Ctx): Promise<number> {
  return windowed("returns", ctx, WINDOW, async (from, to) => {
    const rows = (await paged("/api/v2/returns/get_return_list", ctx, { update_time_from: from, update_time_to: to }, (r) => arr(r, "return", "return_list"), 50)).map(mapShopeeReturn).filter((x): x is NonNullable<typeof x> => !!x);
    await pg.begin(async (tx) => {
      for (const r of rows) await tx`insert into shopee_returns (return_sn, order_sn, status, reason, created_at, remote_updated_at, refund_amount, currency, items, pieces, synced_at)
        values (${r.returnSn}, ${r.orderSn}, ${r.status}, ${r.reason}, ${r.createdAt}, ${r.updatedAt}, ${r.refundAmount}, ${r.currency}, ${JSON.stringify(r.items)}::jsonb, ${r.pieces}, now())
        on conflict (return_sn) do update set status = excluded.status, reason = excluded.reason, remote_updated_at = excluded.remote_updated_at, refund_amount = excluded.refund_amount, items = excluded.items, pieces = excluded.pieces, synced_at = now()`;
    });
    return rows.length;
  }, () => count("shopee_returns"));
}

/** Shop-wide ad spend per day (Shopee Ads). */
async function runAds(ctx: Ctx): Promise<number> {
  return windowed("ads", ctx, WINDOW, async (from, to) => {
    const r = await call<unknown>("/api/v2/ads/get_all_cpc_ads_daily_performance", ctx.deps, { query: { start_date: ddmmyyyy(from), end_date: ddmmyyyy(to - 1) } });
    const rows = arr(r, "response", "data", "daily_performance").map(mapShopeeAdsDay).filter((x): x is NonNullable<typeof x> => !!x);
    await pg.begin(async (tx) => {
      for (const d of rows) await tx`insert into shopee_ads_daily (day, impressions, clicks, expense, orders, gmv, raw, synced_at)
        values (${d.day}, ${d.impressions}, ${d.clicks}, ${d.expense}, ${d.orders}, ${d.gmv}, ${JSON.stringify(d.raw)}::jsonb, now())
        on conflict (day) do update set impressions = excluded.impressions, clicks = excluded.clicks, expense = excluded.expense, orders = excluded.orders, gmv = excluded.gmv, raw = excluded.raw, synced_at = now()`;
    });
    return rows.length;
  }, () => count("shopee_ads_daily"));
}

async function runWallet(ctx: Ctx): Promise<number> {
  return windowed("wallet", ctx, WINDOW, async (from, to) => {
    const rows = (await paged("/api/v2/payment/get_wallet_transaction_list", ctx, { create_time_from: from, create_time_to: to }, (r) => arr(r, "transaction_list"))).map(mapShopeeWallet).filter((x): x is NonNullable<typeof x> => !!x);
    await pg.begin(async (tx) => {
      for (const w of rows) await tx`insert into shopee_wallet_tx (tx_key, created_at, transaction_type, money_flow, amount, balance, status, order_sn, withdrawal_id, description, synced_at)
        values (${w.key}, ${w.createdAt}, ${w.type}, ${w.flow}, ${w.amount}, ${w.balance}, ${w.status}, ${w.orderSn}, ${w.withdrawalId}, ${w.description}, now())
        on conflict (tx_key) do update set status = excluded.status, description = excluded.description, synced_at = now()`;
    });
    return rows.length;
  }, () => count("shopee_wallet_tx"));
}

/** Stock per SKU, from the product list: your own warehouse and Shopee's (FBS). Read at most every 3 hours (it is one call per listing). */
async function runStock(ctx: Ctx): Promise<number> {
  const [st] = await pg`select last_success_at from tt_sync_state where dataset = ${SHOPEE_DATASETS.stock}`;
  if (!ctx.force && st?.last_success_at && Date.now() - new Date(st.last_success_at as Date).getTime() < 3 * 3600_000) return 0;
  const ids: number[] = [];
  for (let offset = 0, more = true; more && offset < 20_000;) {
    const r = await call<{ item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number }>("/api/v2/product/get_item_list", ctx.deps, { query: { offset, page_size: 100, item_status: "NORMAL" } });
    for (const i of r.item ?? []) ids.push(Number(i.item_id));
    more = !!r.has_next_page; offset = Number(r.next_offset ?? offset + 100);
  }
  const rows: ReturnType<typeof mapShopeeStock>[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    if (Date.now() - ctx.started > ctx.budget) { ctx.res.note = "Stopped early to stay within the time limit; the next sync carries on."; break; }
    const r = await call<{ item_list?: Record<string, unknown>[] }>("/api/v2/product/get_item_base_info", ctx.deps, { query: { item_id_list: ids.slice(i, i + 50).join(",") } });
    for (const it of r.item_list ?? []) {
      const itemId = Number(it.item_id), name = (it.item_name as string) ?? null;
      if (it.has_model) {
        const m = await call<{ model?: Record<string, unknown>[] }>("/api/v2/product/get_model_list", ctx.deps, { query: { item_id: itemId } });
        for (const x of m.model ?? []) rows.push(mapShopeeStock(itemId, Number(x.model_id), (x.model_sku as string) ?? null, [name, x.model_name].filter(Boolean).join(" · "), x.stock_info_v2));
      } else rows.push(mapShopeeStock(itemId, 0, (it.item_sku as string) ?? null, name, it.stock_info_v2));
    }
  }
  if (rows.length) await pg.begin(async (tx) => {
    await tx`delete from shopee_stock`; // the list above is the whole shop: what is no longer listed is gone
    for (const x of rows) await tx`insert into shopee_stock (item_id, model_id, sku, name, seller_stock, shopee_stock, reserved, synced_at) values (${x.itemId}, ${x.modelId}, ${x.sku}, ${x.name}, ${x.sellerStock}, ${x.shopeeStock}, ${x.reserved}, now())
      on conflict (item_id, model_id) do update set sku = excluded.sku, name = excluded.name, seller_stock = excluded.seller_stock, shopee_stock = excluded.shopee_stock, reserved = excluded.reserved, synced_at = now()`;
  });
  await saveState(SHOPEE_DATASETS.stock, { ok: true, watermark: new Date(ctx.now * 1000), records: await count("shopee_stock") });
  return rows.length;
}

const RUNNERS: Record<ShopeeDatasetKey, (c: Ctx) => Promise<number>> = { orders: runOrders, escrow: runEscrow, release: runRelease, returns: runReturns, ads: runAds, wallet: runWallet, stock: runStock };

/** Shopee's way of saying "this app may not use that part of the API": said plainly. */
function friendly(e: unknown, label: string): string {
  const m = text(e);
  if (e instanceof ShopeeApiError && /permission|no_access|not.?authori|api.?access|error_forbidden|access denied|not support|can't be called|cannot be called/i.test(`${e.error ?? ""} ${e.message}`))
    return `Shopee has not given this app access to ${label} (${e.error ?? "permission"}). In the Shopee Open Platform Console, add the matching API group to the app and press Reconnect.`;
  return m;
}

/**
 * One sync of everything: orders, payments, release dates, returns, ads, wallet and stock. Each part is separate: a part that fails
 * (for example a permission Shopee has not given) is reported and the others still run. `only` runs just some of them.
 * `historyDays` only matters the first time (or when asked to read further back).
 */
export async function runShopeeSync(deps: ShopeeSyncDeps & { historyDays?: number; only?: ShopeeDatasetKey[]; force?: boolean } = {}): Promise<ShopeeSyncResult> {
  const fail = (error: string): ShopeeSyncResult => ({ ok: false, orders: 0, escrow: 0, windows: 0, error, note: null, datasets: [] });
  if (running) return fail("A Shopee sync is already running.");
  const cfg = deps.cfg === undefined ? shopeeConfig() : deps.cfg;
  if (!cfg) return fail("The Shopee partner ID and key are not set on the server.");
  const info = await shopeeConnectionInfo();
  if (!info.connected) return fail("Shopee is not connected yet.");
  running = true;
  const res: ShopeeSyncResult = { ok: true, orders: 0, escrow: 0, windows: 0, error: null, note: null, datasets: [] };
  const ctx: Ctx = { deps: { ...deps, cfg }, now: deps.nowSec ?? Math.floor(Date.now() / 1000), started: Date.now(), budget: deps.budgetMs ?? 8 * 60_000, historyDays: deps.historyDays, res, shopId: info.shopIds[0] ?? null, force: !!deps.force };
  try {
    for (const d of SHOPEE_DATASET_LIST) {
      if (deps.only && !deps.only.includes(d.key)) continue;
      try {
        const rows = await RUNNERS[d.key](ctx);
        res.datasets.push({ key: d.key, label: d.label, ok: true, rows, error: null });
      } catch (e) {
        const msg = friendly(e, d.label);
        res.datasets.push({ key: d.key, label: d.label, ok: false, rows: 0, error: msg });
        await saveState(SHOPEE_DATASETS[d.key], { error: msg });
        if (!res.error) res.error = msg;
        res.ok = false;
        if (e instanceof ShopeeApiError && e.isAuth) break; // the login itself is refused: the rest would fail the same way
        if (d.key === "orders") continue; // payments still work on what we have
      }
    }
    return res;
  } finally { running = false; }
}

export type ShopeeDatasetStatus = { key: ShopeeDatasetKey; label: string; what: string; at: Date | null; records: number; error: string | null };
export type ShopeeSyncStatus = { datasets: ShopeeDatasetStatus[]; orders: { at: Date | null; records: number; error: string | null }; escrow: { at: Date | null; records: number; error: string | null }; awaiting: number; firstOrder: string | null; lastOrder: string | null };

export async function shopeeSyncStatus(): Promise<ShopeeSyncStatus> {
  const st = await pg`select dataset, last_success_at, records, last_error from tt_sync_state where dataset like 'shopee\\_%'`;
  const datasets = SHOPEE_DATASET_LIST.map((d): ShopeeDatasetStatus => { const r = st.find((x) => x.dataset === SHOPEE_DATASETS[d.key]); return { ...d, at: (r?.last_success_at as Date) ?? null, records: Number(r?.records ?? 0), error: (r?.last_error as string) ?? null }; });
  const [a] = await pg`select count(*)::int as n, to_char(min(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as first, to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as last,
    (select count(*)::int from shopee_orders o left join shopee_escrow e on e.order_sn = o.order_sn where e.order_sn is null and o.status in ('COMPLETED', 'SHIPPED', 'TO_CONFIRM_RECEIVE')) as awaiting from shopee_orders`;
  const o = datasets[0], e = datasets[1];
  return { datasets, orders: { at: o.at, records: o.records, error: o.error }, escrow: { at: e.at, records: e.records, error: e.error }, awaiting: Number(a?.awaiting ?? 0), firstOrder: (a?.first as string) ?? null, lastOrder: (a?.last as string) ?? null };
}

/** The same check as the TikTok scheduler: run when connected and at least `minutes` have passed since the last good run. */
export async function shopeeSchedulerTick(minutes = 30, nowMs = Date.now()): Promise<"ran" | "idle" | "off"> {
  if (running || !shopeeConfig()) return "off";
  if (!(await shopeeConnectionInfo()).connected) return "off";
  const [r] = await pg`select max(coalesce(last_success_at, last_error_at)) as t from tt_sync_state where dataset = ${SHOPEE_DATASETS.orders}`;
  if (r?.t && nowMs - new Date(r.t as Date).getTime() < minutes * 60_000) return "idle";
  await runShopeeSync();
  return "ran";
}
