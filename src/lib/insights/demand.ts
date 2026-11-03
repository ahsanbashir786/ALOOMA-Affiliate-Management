import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { addDaysISO } from "@/lib/time";
import { changePct, holtForecast, type Forecast } from "./series";

/**
 * Demand per single item (bundles are broken into their parts using the bundle list). Sold = units on orders that were not cancelled or returned.
 * Sample units are shown separately. Only COMPLETE weeks (Monday–Sunday) are used. Stock on hand is not in the data yet, so this says how much
 * will be NEEDED, not how much to buy – that comes when stock counts exist.
 */
export type DemandItem = { sku: string; name: string; weekly: number[]; samples: number[]; sold4: number; sample4: number; trendPct: number | null; forecast: Forecast | null; next4: number | null };
export type Demand = { weeks: string[]; items: DemandItem[]; total: { weekly: number[]; forecast: Forecast | null; next4: number | null; trendPct: number | null }; note: string | null };

export async function getDemand(topN = 12): Promise<Demand> {
  const [r] = await rows<{ s: string | null; e: string | null }>(sql`select to_char(min(created_at), 'YYYY-MM-DD') as s, to_char(max(created_at), 'YYYY-MM-DD') as e from shop_order_lines`);
  if (!r?.e || !r.s) return { weeks: [], items: [], total: { weekly: [], forecast: null, next4: null, trendPct: null }, note: "No shop orders loaded yet." };
  const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  // first complete Monday on/after the first order; last complete Sunday on/before the last order
  let first = r.s;
  while (dow(first) !== 1) first = addDaysISO(first, 1);
  let last = r.e;
  while (dow(last) !== 0) last = addDaysISO(last, -1);
  const weeks: string[] = [];
  for (let w = first; addDaysISO(w, 6) <= last; w = addDaysISO(w, 7)) weeks.push(w);
  if (weeks.length < 2) return { weeks, items: [], total: { weekly: [], forecast: null, next4: null, trendPct: null }, note: "Less than two complete weeks of orders – nothing to chart yet." };

  const data = await rows<{ wk: string; item: string; name: string | null; sold: number; smp: number }>(sql`
    with l as (select date_trunc('week', created_at)::date as wk, upper(seller_sku) as sku, quantity, is_sample, status, cancel_type from shop_order_lines where seller_sku is not null and created_at::date between ${first}::date and ${last}::date),
    x as (select l.wk, coalesce(upper(b.component_sku), l.sku) as item, l.quantity * coalesce(b.qty, 1) as units, l.is_sample, (l.status = 'Canceled' or coalesce(l.cancel_type, '') = 'Return/Refund') as lost, l.status
          from l left join sku_bom b on upper(b.set_sku) = l.sku)
    select to_char(x.wk, 'YYYY-MM-DD') as wk, x.item, max(k.name) as name,
      coalesce(sum(x.units) filter (where not x.is_sample and not x.lost), 0)::int as sold,
      coalesce(sum(x.units) filter (where x.is_sample and x.status <> 'Canceled'), 0)::int as smp
    from x left join sku_items k on upper(k.sku) = x.item group by 1, 2`);
  const byItem = new Map<string, { name: string; sold: Map<string, number>; smp: Map<string, number> }>();
  for (const d of data) {
    const cur = byItem.get(d.item) ?? { name: d.name ?? d.item, sold: new Map(), smp: new Map() };
    cur.sold.set(d.wk, d.sold);
    cur.smp.set(d.wk, d.smp);
    byItem.set(d.item, cur);
  }
  const items: DemandItem[] = [...byItem].map(([sku, v]) => {
    const weekly = weeks.map((w) => v.sold.get(w) ?? 0);
    const samples = weeks.map((w) => v.smp.get(w) ?? 0);
    const fc = holtForecast(weekly, 4);
    return {
      sku, name: v.name, weekly, samples,
      sold4: weekly.slice(-4).reduce((a, b) => a + b, 0), sample4: samples.slice(-4).reduce((a, b) => a + b, 0),
      trendPct: changePct(weekly, Math.min(4, Math.floor(weekly.length / 2))), forecast: fc, next4: fc ? Math.round(fc.points.reduce((a, p) => a + p.value, 0)) : null,
    };
  }).sort((a, b) => b.sold4 - a.sold4).slice(0, topN);
  const totalWeekly = weeks.map((_, i) => [...byItem.values()].reduce((a, v) => a + (v.sold.get(weeks[i]) ?? 0), 0));
  const tf = holtForecast(totalWeekly, 4);
  return {
    weeks, items,
    total: { weekly: totalWeekly, forecast: tf, next4: tf ? Math.round(tf.points.reduce((a, p) => a + p.value, 0)) : null, trendPct: changePct(totalWeekly, Math.min(4, Math.floor(totalWeekly.length / 2))) },
    note: weeks.length < 6 ? `Only ${weeks.length} complete weeks of orders so far – forecasts need at least 6.` : null,
  };
}
