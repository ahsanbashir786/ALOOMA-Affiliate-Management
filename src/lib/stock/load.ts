import "server-only";
import { sql as pg } from "@/db";
import { dayKL } from "@/lib/time";
import type { BundleMap, Layer, Sale } from "./fifo";
import { explode } from "./fifo";
import { normSku } from "./sku";

/** Every stock layer that has an arrival date. Layers of an order with no date yet cannot be used and are reported separately. */
export async function loadLayers(): Promise<{ layers: Layer[]; undated: string[] }> {
  const rows = await pg`
    select l.id::int as id, l.order_no, o.sort_no, to_char(o.arrival_date, 'YYYY-MM-DD') as arrival, l.sku, (l.paid_qty + l.free_qty)::int as qty, l.total_cost_rm::float8 as total
    from stock_layers l join stock_orders o on o.order_no = l.order_no`;
  const undated = new Set<string>();
  const layers: Layer[] = [];
  for (const r of rows) {
    if (!r.arrival) { undated.add(String(r.order_no)); continue; }
    layers.push({ id: Number(r.id), orderNo: String(r.order_no), sortNo: Number(r.sort_no), arrival: String(r.arrival), sku: String(r.sku), qty: Number(r.qty), totalCost: Number(r.total) });
  }
  return { layers, undated: [...undated] };
}

export async function loadBundles(): Promise<BundleMap> {
  const m: BundleMap = new Map();
  for (const r of await pg`select set_sku, part_sku, qty::int as qty from stock_bundle_parts order by set_sku, part_sku`) {
    const a = m.get(String(r.set_sku)) ?? [];
    a.push({ sku: String(r.part_sku), qty: Number(r.qty) });
    m.set(String(r.set_sku), a);
  }
  return m;
}

/**
 * TikTok sales as pieces, one entry per order and SKU, with bundles already split into their parts.
 * Cancelled orders are left out. Every line of a TikTok order is one piece.
 */
export async function loadTikTokSales(bundles: BundleMap): Promise<{ sales: Sale[]; unknown: Map<string, number> }> {
  const rows = await pg`select order_id, coalesce(paid_at, created_at) as at, lines from tt_orders where coalesce(upper(status), '') <> 'CANCELLED' and lines is not null`;
  const sales: Sale[] = [];
  const unknown = new Map<string, number>();
  for (const r of rows) {
    if (!r.at) continue;
    const lines = (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as { seller_sku?: string | null }[];
    const count = new Map<string, number>();
    for (const l of lines) {
      const s = normSku(l.seller_sku);
      if (!s) { unknown.set("(no SKU)", (unknown.get("(no SKU)") ?? 0) + 1); continue; }
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    const day = dayKL(r.at as Date);
    for (const [sku, qty] of count) for (const p of explode(sku, qty, bundles)) sales.push({ ref: String(r.order_id), day, sku: p.sku, qty: p.qty });
  }
  return { sales, unknown };
}
