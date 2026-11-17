import "server-only";
import { sql as pg } from "@/db";
import { ShopeeApiError, shopeeCall, shopeeConfig, shopeeConnectionInfo, type Fetch, type ShopeeConfig } from "./client";
import { mapShopeeEscrow, mapShopeeOrder } from "./map";

// Shopee orders and payments into our own tables. Orders are read by the time they were last changed, in windows of 14 days
// (Shopee allows at most 15), so a status change is picked up again. Payments (escrow) are read for every order that has none yet
// or whose order changed since. Two datasets, kept in tt_sync_state like the TikTok ones: shopee_orders and shopee_escrow.

const DAY = 86_400;
const WINDOW = 14 * DAY;
export const SHOPEE_DATASETS = { orders: "shopee_orders", escrow: "shopee_escrow" } as const;
export const DEFAULT_HISTORY_DAYS = 180;
/** An order that was still moving is read again for this many days back, so late changes are never missed. */
const OVERLAP = 2 * DAY;

export type ShopeeSyncDeps = { f?: Fetch; cfg?: ShopeeConfig | null; nowSec?: number; sleep?: (ms: number) => Promise<void>; budgetMs?: number };
export type ShopeeSyncResult = { ok: boolean; orders: number; escrow: number; windows: number; error: string | null; note: string | null };

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

/**
 * One sync: new and changed orders, then the payment figures of the orders that need them.
 * `historyDays` only matters the first time (or when asked to read further back).
 */
export async function runShopeeSync(deps: ShopeeSyncDeps & { historyDays?: number } = {}): Promise<ShopeeSyncResult> {
  if (running) return { ok: false, orders: 0, escrow: 0, windows: 0, error: "A Shopee sync is already running.", note: null };
  const cfg = deps.cfg === undefined ? shopeeConfig() : deps.cfg;
  if (!cfg) return { ok: false, orders: 0, escrow: 0, windows: 0, error: "The Shopee partner ID and key are not set on the server.", note: null };
  const info = await shopeeConnectionInfo();
  if (!info.connected) return { ok: false, orders: 0, escrow: 0, windows: 0, error: "Shopee is not connected yet.", note: null };
  running = true;
  const d: ShopeeSyncDeps = { ...deps, cfg };
  const started = Date.now();
  const budget = deps.budgetMs ?? 8 * 60_000;
  const now = deps.nowSec ?? Math.floor(Date.now() / 1000);
  const res: ShopeeSyncResult = { ok: true, orders: 0, escrow: 0, windows: 0, error: null, note: null };
  try {
    // 1. Orders
    try {
      const [st] = await pg`select watermark from tt_sync_state where dataset = ${SHOPEE_DATASETS.orders}`;
      const wm = st?.watermark ? Math.floor(new Date(st.watermark as Date).getTime() / 1000) : null;
      const history = (deps.historyDays ?? DEFAULT_HISTORY_DAYS) * DAY;
      let from = wm ? wm - OVERLAP : now - history;
      if (deps.historyDays && wm) from = Math.min(from, now - history); // asked to read further back
      let stopped = false;
      while (from < now) {
        if (Date.now() - started > budget) { res.note = "Stopped early to stay within the time limit; the next sync carries on."; stopped = true; break; }
        const to = Math.min(from + WINDOW, now);
        const sns = await listOrderSns(from, to, d);
        res.orders += await saveOrders(sns, d, info.shopIds[0] ?? null);
        res.windows++;
        await saveState(SHOPEE_DATASETS.orders, { ok: true, watermark: new Date(to * 1000), records: 0 });
        from = to;
      }
      const [{ n }] = await pg`select count(*)::int as n from shopee_orders`;
      await saveState(SHOPEE_DATASETS.orders, { ok: true, watermark: stopped ? undefined : new Date(now * 1000), records: Number(n) });
    } catch (e) {
      res.ok = false; res.error = text(e);
      await saveState(SHOPEE_DATASETS.orders, { error: res.error });
      return res;
    }
    // 2. Payments
    try {
      for (let round = 0; round < 60; round++) {
        if (Date.now() - started > budget) { res.note = "Stopped early to stay within the time limit; the next sync carries on."; break; }
        const sns = await escrowCandidates(200);
        if (!sns.length) break;
        res.escrow += await saveEscrow(sns, d); // orders Shopee has no figures for are marked as asked, so the next round moves on
      }
      const [{ n }] = await pg`select count(*)::int as n from shopee_escrow`;
      await saveState(SHOPEE_DATASETS.escrow, { ok: true, watermark: new Date(now * 1000), records: Number(n) });
    } catch (e) {
      res.ok = false; res.error = text(e);
      await saveState(SHOPEE_DATASETS.escrow, { error: res.error });
    }
    return res;
  } finally { running = false; }
}

export type ShopeeSyncStatus = { orders: { at: Date | null; records: number; error: string | null }; escrow: { at: Date | null; records: number; error: string | null }; awaiting: number; firstOrder: string | null; lastOrder: string | null };

export async function shopeeSyncStatus(): Promise<ShopeeSyncStatus> {
  const st = await pg`select dataset, last_success_at, records, last_error from tt_sync_state where dataset in (${SHOPEE_DATASETS.orders}, ${SHOPEE_DATASETS.escrow})`;
  const g = (k: string) => { const r = st.find((x) => x.dataset === k); return { at: (r?.last_success_at as Date) ?? null, records: Number(r?.records ?? 0), error: (r?.last_error as string) ?? null }; };
  const [a] = await pg`select count(*)::int as n, to_char(min(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as first, to_char(max(created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as last,
    (select count(*)::int from shopee_orders o left join shopee_escrow e on e.order_sn = o.order_sn where e.order_sn is null and o.status in ('COMPLETED', 'SHIPPED', 'TO_CONFIRM_RECEIVE')) as awaiting from shopee_orders`;
  return { orders: g(SHOPEE_DATASETS.orders), escrow: g(SHOPEE_DATASETS.escrow), awaiting: Number(a?.awaiting ?? 0), firstOrder: (a?.first as string) ?? null, lastOrder: (a?.last as string) ?? null };
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
