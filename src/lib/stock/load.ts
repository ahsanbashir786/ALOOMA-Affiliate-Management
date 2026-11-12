import "server-only";
import { sql as pg } from "@/db";
import type { BundleMap, Layer } from "./fifo";

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
