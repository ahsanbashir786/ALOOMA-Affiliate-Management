import "server-only";
import { cached } from "@/lib/swr";
import { sql as pg } from "@/db";
import { dayKL } from "@/lib/time";
import { explode, runFifoWithReturns, type BundleMap, type Costed, type Remaining, type Return, type Sale } from "./fifo";
import { loadBundles, loadLayers } from "./load";
import { normSku } from "./sku";

export type Platform = "tiktok" | "shopee";
export type SaleOrder = { platform: Platform; /** Shopee packs and ships it (no 3PL fee). */ isFbs: boolean; orderId: string; status: string | null; isSample: boolean; createdAt: Date; day: string; items: { sku: string; qty: number }[]; unknownPieces: number };

export type Costing = {
  orders: SaleOrder[];
  /** Cost of the pieces that left with each order (returns already taken off). */
  byOrder: Map<string, { cost: number; pieces: number; short: number; noCost: number; returnedPieces: number; returnedCost: number; lines: { sku: string; qty: number; cost: number; from: string }[] }>;
  costed: Costed[];
  remaining: Remaining[];
  unknownSkus: Map<string, number>;
  /** The first day that can be costed: the day after the opening stock was counted (or the first arrival). Earlier orders are left out. */
  costStart: string | null;
  /** Set when the opening stock is dated after an order that arrived earlier: almost always a report from the wrong year. */
  startWarning: string | null;
};

let version = 0;
/** Called after anything that changes stock or sales, so the next page reads fresh numbers. */
export const clearCosting = () => { version++; };

/**
 * Every TikTok sale costed First In, First Out against the stock layers, returns put back into stock.
 * Cancelled orders are left out. Every line of a TikTok order is one piece; a Shopee item counts as its quantity.
 */
export const loadCosting = (): Promise<Costing> => cached("costing", "all", computeCosting, version);
async function computeCosting(): Promise<Costing> {
  const [{ layers }, bundles] = await Promise.all([loadLayers(), loadBundles()]);
  const [ttRows, spRows] = await Promise.all([
    pg`select order_id, status, is_sample, created_at, coalesce(paid_at, created_at) as at, lines from tt_orders where coalesce(upper(status), '') <> 'CANCELLED' and created_at is not null and lines is not null`,
    // Shopee: an item can have a quantity. It is counted as that many pieces, the same as a TikTok order with that many lines.
    pg`select order_sn, status, created_at, coalesce(paid_at, created_at) as at, items, is_fbs from shopee_orders where status is not null and status not in ('UNPAID', 'CANCELLED', 'IN_CANCEL')`,
  ]);
  type Raw = { platform: Platform; isFbs: boolean; id: string; status: string | null; isSample: boolean; createdAt: Date; at: Date; lines: { seller_sku?: string | null }[] };
  const orderRows: Raw[] = [
    ...ttRows.map((r): Raw => ({ platform: "tiktok", isFbs: false, id: String(r.order_id), status: (r.status as string) ?? null, isSample: !!r.is_sample, createdAt: r.created_at as Date, at: r.at as Date, lines: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as Raw["lines"] })),
    ...spRows.map((r): Raw => {
      const items = (typeof r.items === "string" ? JSON.parse(r.items) : r.items) as { sku?: string; qty?: number }[];
      const lines: Raw["lines"] = [];
      for (const i of items ?? []) for (let k = 0; k < (Number(i.qty) || 0); k++) lines.push({ seller_sku: i.sku ?? null });
      return { platform: "shopee", isFbs: !!r.is_fbs, id: String(r.order_sn), status: (r.status as string) ?? null, isSample: false, createdAt: r.created_at as Date, at: r.at as Date, lines };
    }),
  ];
  // The inventory file has every delivery from the very first order, so costing starts the day the first stock arrived.
  const [st] = await pg`select to_char(min(coalesce(l.arrival_date, o.arrival_date)), 'YYYY-MM-DD') as first from stock_layers l join stock_orders o on o.order_no = l.order_no`;
  const startWarning: string | null = null;
  const costStart: string | null = (st?.first as string) ?? null;
  const orders: SaleOrder[] = [];
  const sales: Sale[] = [];
  const unknownSkus = new Map<string, number>();
  for (const r of orderRows) {
    const lines = r.lines;
    const count = new Map<string, number>();
    let unknownPieces = 0;
    for (const l of lines) {
      const s = normSku(l.seller_sku);
      if (!s) { unknownPieces++; continue; }
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    if (costStart && dayKL(r.createdAt) < costStart) continue; // before the stock records start: no cost can be worked out
    const day = dayKL(r.at);
    const items: { sku: string; qty: number }[] = [];
    for (const [sku, qty] of count) for (const p of explode(sku, qty, bundles)) { items.push(p); sales.push({ ref: r.id, day, sku: p.sku, qty: p.qty }); }
    orders.push({ platform: r.platform, isFbs: r.isFbs, orderId: r.id, status: r.status, isSample: r.isSample, createdAt: r.createdAt, day: dayKL(r.createdAt), items, unknownPieces });
  }

  const returns = await loadReturns(bundles, new Set(orders.map((o) => o.orderId)), new Map(orders.map((o) => [o.orderId, o])));
  const { costed, remaining, returnedCost } = runFifoWithReturns(layers, sales, returns);
  const hasLayer = new Set(layers.map((l) => l.sku));

  const byOrder: Costing["byOrder"] = new Map();
  for (const c of costed) {
    if (!c) continue;
    const o = byOrder.get(c.ref) ?? { cost: 0, pieces: 0, short: 0, noCost: 0, returnedPieces: 0, returnedCost: 0, lines: [] };
    o.pieces += c.qty;
    if (!hasLayer.has(c.sku)) { o.noCost += c.qty; unknownSkus.set(c.sku, (unknownSkus.get(c.sku) ?? 0) + c.qty); }
    else { o.cost += c.cost; o.short += c.shortQty; }
    o.lines.push({ sku: c.sku, qty: c.qty, cost: c.cost, from: c.takes.map((t) => `${t.orderNo} ×${t.qty}`).join(", ") + (c.shortQty ? `${c.takes.length ? ", " : ""}no stock ×${c.shortQty}` : "") });
    byOrder.set(c.ref, o);
  }
  for (const r of returns) { const o = byOrder.get(r.ref); if (o) o.returnedPieces += r.qty; }
  for (const [ref, cost] of returnedCost) { const o = byOrder.get(ref); if (o) { o.returnedCost = cost; o.cost -= cost; } }

  const value: Costing = { orders, byOrder, costed, remaining, unknownSkus, costStart, startWarning };
  return value;
}

/** Return orders where the goods came back. A refund without the goods coming back does not put anything into stock. */
async function loadReturns(bundles: BundleMap, known: Set<string>, orders: Map<string, SaleOrder>): Promise<Return[]> {
  const rows = await pg`select order_id, skus, coalesce(updated_at, created_at) as at from tt_returns
    where order_id is not null and coalesce(upper(return_type), '') like '%RETURN%' and coalesce(upper(status), '') !~ '(CANCEL|REJECT|CLOSE)'`;
  const out: Return[] = [];
  for (const r of rows) {
    const id = String(r.order_id);
    if (!known.has(id) || !r.at) continue;
    const day = dayKL(r.at);
    const skus = ((typeof r.skus === "string" ? JSON.parse(r.skus) : r.skus) ?? []) as { seller_sku?: string | null }[];
    const count = new Map<string, number>();
    if (skus.length) for (const l of skus) { const s = normSku(l.seller_sku); if (s) count.set(s, (count.get(s) ?? 0) + 1); }
    else for (const it of orders.get(id)?.items ?? []) count.set(it.sku, (count.get(it.sku) ?? 0) + it.qty); // no SKUs given: the whole order came back (already split into parts)
    const whole = !skus.length;
    for (const [sku, qty] of count) for (const p of whole ? [{ sku, qty }] : explode(sku, qty, bundles)) out.push({ ref: id, day, sku: p.sku, qty: p.qty });
  }
  return out;
}
