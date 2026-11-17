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

export type ShopeeSyncDeps = { f?: Fetch; cfg?: ShopeeConfig | null; nowSec?: number; sleep?: (ms: number) => Promise<void>; budgetMs?: number; trigger?: "manual" | "schedule"; userId?: string | null; concurrency?: number; /** Notes from reading the payments, shown in the history. */ diag?: { note: string | null; single: boolean } };
export type ShopeeDatasetResult = { key: ShopeeDatasetKey; label: string; ok: boolean; rows: number; error: string | null };
export type ShopeeSyncResult = { ok: boolean; orders: number; escrow: number; windows: number; error: string | null; note: string | null; datasets: ShopeeDatasetResult[] };

let running = false;
export const isShopeeSyncRunning = () => running;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const text = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs `fn` over `items` with at most `n` at the same time, and gives the results in order. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

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
  const chunks: string[][] = [];
  for (let i = 0; i < sns.length; i += 50) chunks.push(sns.slice(i, i + 50));
  const counts = await mapLimit(chunks, deps.concurrency ?? 3, async (chunk) => {
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
    return rows.length;
  });
  return counts.reduce((x, y) => x + y, 0);
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
  const chunks: string[][] = [];
  for (let i = 0; i < sns.length; i += 50) chunks.push(sns.slice(i, i + 50));
  const doChunk = async (chunk: string[]): Promise<number> => {
    const diag = deps.diag;
    let list: Record<string, unknown>[] = [];
    if (!diag?.single) {
      const r = await call<unknown>("/api/v2/payment/get_escrow_detail_batch", deps, { method: "POST", body: { order_sn_list: chunk } });
      list = (Array.isArray(r) ? r : ["response", "escrow_detail_list", "escrow_list", "list", "result_list"].map((k) => (r as Record<string, unknown>)[k]).find((v) => Array.isArray(v)) ?? []) as Record<string, unknown>[];
      if (!list.map(mapShopeeEscrow).some(Boolean) && diag && !diag.note) {
        // Shopee answered but nothing could be read: say what the answer looks like (field names only), so it can be fixed.
        const first = (list[0] ?? (Array.isArray(r) ? undefined : r)) as Record<string, unknown> | undefined;
        const detail = (first?.escrow_detail ?? first) as Record<string, unknown> | undefined;
        diag.note = `Shopee's payment answer could not be read: ${list.length} entr${list.length === 1 ? "y" : "ies"}; fields ${Object.keys(first ?? {}).slice(0, 12).join(", ") || "none"}${detail && detail !== first ? `; inside: ${Object.keys(detail).slice(0, 12).join(", ")}` : ""}. Trying one order at a time.`;
        // Try the single-order call on a few orders; if it gives figures, use it for the rest.
        for (const sn of chunk.slice(0, 3)) {
          try {
            const one = await call<Record<string, unknown>>("/api/v2/payment/get_escrow_detail", deps, { query: { order_sn: sn } });
            if (mapShopeeEscrow({ escrow_detail: { order_sn: sn, ...one } })) { diag.single = true; diag.note += " That works, so it is used."; break; }
          } catch { /* try the next one */ }
        }
      }
    }
    if (diag?.single) {
      const parts = await mapLimit(chunk, 5, async (sn) => {
        try { const one = await call<Record<string, unknown>>("/api/v2/payment/get_escrow_detail", deps, { query: { order_sn: sn } }); return { escrow_detail: { order_sn: sn, ...(one.escrow_detail ? (one.escrow_detail as Record<string, unknown>) : one) } } as Record<string, unknown>; }
        catch { return null; }
      });
      list = parts.filter((x): x is Record<string, unknown> => !!x);
    }
    const rows = list.map(mapShopeeEscrow).filter((x): x is NonNullable<typeof x> => !!x);
    const got = new Set(rows.map((x) => x.orderSn));
    const unreadable = !rows.length && list.length > 0;
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
      // (not when the answer itself could not be read: then they must be asked again)
      if (!unreadable) for (const sn of chunk) if (!got.has(sn)) await tx`update shopee_orders set escrow_checked_at = now() where order_sn = ${sn}`;
    });
    return rows.length;
  };
  // The first batch goes alone: if Shopee's answer has to be read another way, the rest then use that way.
  const first = chunks.length ? await doChunk(chunks[0]) : 0;
  const rest = await mapLimit(chunks.slice(1), deps.concurrency ?? 3, doChunk);
  return rest.reduce((x, y) => x + y, first);
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
  // Several windows are read at the same time (Shopee allows it), a batch at a time; the progress is saved after each batch.
  const per = ctx.deps.concurrency ?? 3;
  let rows = 0, stopped = false;
  while (from < ctx.now) {
    if (Date.now() - ctx.started > ctx.budget) { ctx.res.note = "Stopped early to stay within the time limit; the next sync carries on."; stopped = true; break; }
    const wins: [number, number][] = [];
    for (let f = from; f < ctx.now && wins.length < per; f += step) wins.push([f, Math.min(f + step, ctx.now)]);
    const got = await Promise.all(wins.map(([a, b]) => fetchWindow(a, b)));
    const n = got.reduce((x, y) => x + y, 0);
    rows += n;
    if (key === "orders") ctx.res.windows += wins.length;
    await progress(ctx, n);
    from = wins[wins.length - 1][1];
    await saveState(dataset, { ok: true, watermark: new Date(from * 1000), records: 0 });
  }
  await saveState(dataset, { ok: true, watermark: stopped ? undefined : new Date(ctx.now * 1000), records: await countSql() });
  return rows;
}

/** Adds to the "records so far" of the part that is running, so the screen can show live progress. */
async function progress(ctx: Ctx, n: number) {
  if (ctx.runId && n) await pg`update shopee_sync_runs set rows_seen = rows_seen + ${n} where id = ${ctx.runId}`;
}

type Ctx = { runId: number | null; deps: ShopeeSyncDeps; now: number; started: number; budget: number; historyDays?: number; res: ShopeeSyncResult; shopId: string | null; force: boolean };
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
    const got = await saveEscrow(sns, ctx.deps); // orders Shopee has no figures for are marked as asked, so the next round moves on
    n += got; await progress(ctx, got);
  }
  ctx.res.escrow += n;
  if (ctx.deps.diag?.note) ctx.res.note = ctx.deps.diag.note;
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
  await progress(ctx, rows.length);
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
 * `historyDays` only matters the first time (or when asked to read further back). Every part leaves one line in the history.
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
  const ctx: Ctx = { runId: null, deps: { ...deps, cfg, diag: { note: null, single: false } }, now: deps.nowSec ?? Math.floor(Date.now() / 1000), started: Date.now(), budget: deps.budgetMs ?? 25 * 60_000, historyDays: deps.historyDays, res, shopId: info.shopIds[0] ?? null, force: !!deps.force };
  try {
    for (const d of SHOPEE_DATASET_LIST) {
      if (deps.only && !deps.only.includes(d.key)) continue;
      const [run] = await pg`insert into shopee_sync_runs (dataset, trigger, user_id) values (${SHOPEE_DATASETS[d.key]}, ${deps.trigger ?? "manual"}, ${deps.userId ?? null}) returning id`;
      ctx.runId = Number(run.id);
      res.note = null;
      try {
        const rows = await RUNNERS[d.key](ctx);
        res.datasets.push({ key: d.key, label: d.label, ok: true, rows, error: null });
        await pg`update shopee_sync_runs set status = 'ok', finished_at = now(), rows_changed = ${rows}, error = ${res.note} where id = ${ctx.runId}`;
      } catch (e) {
        const msg = friendly(e, d.label);
        res.datasets.push({ key: d.key, label: d.label, ok: false, rows: 0, error: msg });
        await pg`update shopee_sync_runs set status = 'failed', finished_at = now(), error = ${msg} where id = ${ctx.runId}`;
        await saveState(SHOPEE_DATASETS[d.key], { error: msg });
        if (!res.error) res.error = msg;
        res.ok = false;
        if (e instanceof ShopeeApiError && e.isAuth) break; // the login itself is refused: the rest would fail the same way
      }
    }
    return res;
  } finally { running = false; }
}

/** A restart kills a sync in progress; its "running" lines would wait forever. */
export async function clearShopeeInterrupted(): Promise<void> {
  await pg`update shopee_sync_runs set status = 'failed', finished_at = now(), error = 'Stopped (the server restarted). The next sync carries on.' where status = 'running'`;
}

// ───────── What the screen shows ─────────
export type ShopeeSyncSettings = { enabled: boolean; everyMinutes: number };
export async function getShopeeSyncSettings(): Promise<ShopeeSyncSettings> {
  const [r] = await pg`select value from settings where key = 'shopee_sync_settings'`;
  const v = (r?.value ?? {}) as Partial<ShopeeSyncSettings>;
  return { enabled: v.enabled !== false, everyMinutes: [30, 60, 180, 720, 1440].includes(Number(v.everyMinutes)) ? Number(v.everyMinutes) : 30 };
}
export async function setShopeeSyncSettings(minutes: number): Promise<ShopeeSyncSettings> {
  const v: ShopeeSyncSettings = minutes > 0 ? { enabled: true, everyMinutes: [30, 60, 180, 720, 1440].includes(minutes) ? minutes : 30 } : { enabled: false, everyMinutes: 30 };
  await pg`insert into settings (key, value) values ('shopee_sync_settings', ${JSON.stringify(v)}::jsonb) on conflict (key) do update set value = excluded.value`;
  return v;
}

export type ShopeeDatasetView = { key: ShopeeDatasetKey; label: string; what: string; icon: string; records: number; lastSuccessAt: string | null; lastError: string | null; running: boolean; progress: number | null; oldest: string | null; newest: string | null; note: string | null };
export type ShopeeRunView = { id: number; label: string; startedAt: string; durationSec: number | null; status: string; trigger: string; by: string | null; changed: number; error: string | null };
export type ShopeeOverview = {
  now: number; datasets: ShopeeDatasetView[]; runs: ShopeeRunView[]; running: boolean; lastFullAt: string | null; nextAt: string | null; settings: ShopeeSyncSettings;
  shop: { id: string | null; name: string | null; region: string | null; env: string | null }; walletSummary: { moneyIn: number; moneyOut: number; balance: number | null } | null;
  needsReconnect: boolean;
};

const ICONS: Record<ShopeeDatasetKey, string> = { orders: "bag", escrow: "wallet", release: "calendar", returns: "undo", ads: "rocket", wallet: "bank", stock: "package" };

export async function shopeeOverview(): Promise<ShopeeOverview> {
  const [states, runs, active, settings, info, counts, w, lastCycle] = await Promise.all([
    pg`select dataset, last_success_at, last_error from tt_sync_state where dataset like 'shopee\\_%'`,
    pg`select r.id, r.dataset, r.started_at, r.finished_at, r.status, r.trigger, r.rows_changed, r.error, u.name as by from shopee_sync_runs r left join users u on u.id = r.user_id order by r.started_at desc, r.id desc limit 40`,
    pg`select dataset, max(rows_seen)::int as seen from shopee_sync_runs where status = 'running' and started_at > now() - interval '40 minutes' group by dataset`,
    getShopeeSyncSettings(),
    shopeeConnectionInfo(),
    pg`select
      (select count(*)::int from shopee_orders) as orders, (select count(*)::int from shopee_escrow) as escrow, (select count(*)::int from shopee_escrow where released_at is not null) as release,
      (select count(*)::int from shopee_returns) as returns, (select count(*)::int from shopee_ads_daily) as ads, (select count(*)::int from shopee_wallet_tx) as wallet, (select count(*)::int from shopee_stock) as stock,
      (select to_char(min(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_orders) as o_min, (select to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_orders) as o_max,
      (select to_char(min(day), 'YYYY-MM-DD') from shopee_ads_daily) as a_min, (select to_char(max(day), 'YYYY-MM-DD') from shopee_ads_daily) as a_max,
      (select to_char(min(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_wallet_tx) as w_min, (select to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_wallet_tx) as w_max,
      (select to_char(min(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_returns) as r_min, (select to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_returns) as r_max,
      (select to_char(min(released_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_escrow) as e_min, (select to_char(max(released_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') from shopee_escrow) as e_max`,
    pg`select coalesce(sum(amount) filter (where amount > 0), 0)::float8 as money_in, coalesce(-sum(amount) filter (where amount < 0), 0)::float8 as money_out, count(*)::int as n,
      (select balance::float8 from shopee_wallet_tx where balance is not null order by created_at desc limit 1) as balance from shopee_wallet_tx where created_at > now() - interval '30 days'`,
    pg`select max(started_at) as t from shopee_sync_runs where dataset = ${SHOPEE_DATASETS.orders}`,
  ]);
  const c = counts[0], st = new Map(states.map((x) => [String(x.dataset), x]));
  const lastRun = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastRun.has(String(r.dataset))) lastRun.set(String(r.dataset), r); // newest first
  const seen = new Map(active.map((x) => [String(x.dataset), Number(x.seen)]));
  const range: Record<ShopeeDatasetKey, [string | null, string | null]> = { orders: [c.o_min, c.o_max], escrow: [c.o_min, c.o_max], release: [c.e_min, c.e_max], returns: [c.r_min, c.r_max], ads: [c.a_min, c.a_max], wallet: [c.w_min, c.w_max], stock: [null, null] };
  const datasets = SHOPEE_DATASET_LIST.map((d): ShopeeDatasetView => {
    const key = SHOPEE_DATASETS[d.key], s2 = st.get(key), lr = lastRun.get(key);
    const isRunning = lr?.status === "running" && seen.has(key);
    return {
      ...d, icon: ICONS[d.key], records: Number(c[d.key === "escrow" ? "escrow" : d.key]), lastSuccessAt: s2?.last_success_at ? new Date(s2.last_success_at as Date).toISOString() : null,
      lastError: (s2?.last_error as string) ?? null, running: isRunning, progress: isRunning ? seen.get(key) ?? 0 : null, oldest: range[d.key][0] as string | null, newest: range[d.key][1] as string | null, note: lr?.status === "ok" ? ((lr.error as string) ?? null) : null,
    };
  });
  const lastAt = lastCycle[0]?.t ? new Date(lastCycle[0].t as Date).getTime() : null;
  return {
    now: Date.now(), datasets, running: running || datasets.some((d) => d.running), settings,
    runs: runs.map((r): ShopeeRunView => ({ id: Number(r.id), label: SHOPEE_DATASET_LIST.find((d) => SHOPEE_DATASETS[d.key] === r.dataset)?.label ?? String(r.dataset), startedAt: new Date(r.started_at as Date).toISOString(), durationSec: r.finished_at ? Math.round((new Date(r.finished_at as Date).getTime() - new Date(r.started_at as Date).getTime()) / 1000) : null, status: String(r.status), trigger: String(r.trigger), by: (r.by as string) ?? null, changed: Number(r.rows_changed), error: (r.error as string) ?? null })),
    lastFullAt: lastAt ? new Date(lastAt).toISOString() : null, nextAt: settings.enabled && lastAt ? new Date(lastAt + settings.everyMinutes * 60_000).toISOString() : null,
    shop: { id: info.shopIds[0] ?? null, name: info.shopName, region: info.region, env: info.env },
    walletSummary: w[0] && Number(w[0].n) > 0 ? { moneyIn: Number(w[0].money_in), moneyOut: Number(w[0].money_out), balance: w[0].balance == null ? null : Number(w[0].balance) } : null,
    needsReconnect: datasets.some((d) => d.lastError && /error_auth|invalid_access_token|login|connect again/i.test(d.lastError)),
  };
}

export type ShopeeDatasetStatus = { key: ShopeeDatasetKey; label: string; what: string; at: Date | null; records: number; error: string | null };
export type ShopeeSyncStatus = { datasets: ShopeeDatasetStatus[]; orders: { at: Date | null; records: number; error: string | null }; escrow: { at: Date | null; records: number; error: string | null }; awaiting: number; firstOrder: string | null; lastOrder: string | null };

export async function shopeeSyncStatus(): Promise<ShopeeSyncStatus> {
  const ov = await shopeeOverview();
  const datasets = ov.datasets.map((d): ShopeeDatasetStatus => ({ key: d.key, label: d.label, what: d.what, at: d.lastSuccessAt ? new Date(d.lastSuccessAt) : null, records: d.records, error: d.lastError }));
  const [a] = await pg`select (select count(*)::int from shopee_orders o left join shopee_escrow e on e.order_sn = o.order_sn where e.order_sn is null and o.status in ('COMPLETED', 'SHIPPED', 'TO_CONFIRM_RECEIVE')) as awaiting`;
  const o = datasets[0], e = datasets[1];
  return { datasets, orders: { at: o.at, records: o.records, error: o.error }, escrow: { at: e.at, records: e.records, error: e.error }, awaiting: Number(a?.awaiting ?? 0), firstOrder: ov.datasets[0].oldest, lastOrder: ov.datasets[0].newest };
}

/** The same check as the TikTok scheduler: when auto-sync is on and the set time has passed since the last run started, sync. */
export async function shopeeSchedulerTick(nowMs = Date.now()): Promise<"ran" | "idle" | "off"> {
  if (running || !shopeeConfig()) return "off";
  const settings = await getShopeeSyncSettings();
  if (!settings.enabled || !(await shopeeConnectionInfo()).connected) return "off";
  const [r] = await pg`select max(started_at) as t from shopee_sync_runs where dataset = ${SHOPEE_DATASETS.orders}`;
  if (r?.t && nowMs - new Date(r.t as Date).getTime() < settings.everyMinutes * 60_000) return "idle";
  await runShopeeSync({ trigger: "schedule" });
  return "ran";
}
