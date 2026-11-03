import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { addDaysISO } from "@/lib/time";
import { unusualPoints, type Flag } from "./series";

/**
 * Order health from the shop-order export: how many orders, how many were cancelled or returned, and why – plus how fast orders move.
 * Counts are distinct ORDERS (not lines). Free sample orders are excluded. The window ends at the latest order date we hold (never "today"),
 * so a missing upload is not read as a quiet period.
 */
export type OrderHealth = {
  start: string | null;
  end: string | null;
  days: { day: string; orders: number; cancelled: number; returned: number; ratePct: number | null }[];
  flags: (Flag & { day: string })[];
  totals: { orders: number; cancelled: number; returned: number; cancelPct: number | null; returnPct: number | null };
  previous: { cancelPct: number | null; returnPct: number | null };
  reasons: { label: string; n: number }[];
  cancelBy: { label: string; n: number }[];
  payment: { label: string; orders: number; cancelPct: number }[];
  skus: { sku: string; name: string; orders: number; cancelPct: number; returnPct: number }[];
  heat: { rows: string[]; cols: string[]; cells: (number | null)[][] };
  shipHours: { label: string; value: number }[];
  deliverDays: { label: string; value: number }[];
  couriers: { name: string; orders: number; medianDays: number }[];
};

const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);

export async function getOrderHealth(windowDays = 90): Promise<OrderHealth> {
  const [r] = await rows<{ s: string | null; e: string | null }>(sql`select to_char(min(created_at), 'YYYY-MM-DD') as s, to_char(max(created_at), 'YYYY-MM-DD') as e from shop_order_lines where not is_sample`);
  if (!r?.e) return { start: null, end: null, days: [], flags: [], totals: { orders: 0, cancelled: 0, returned: 0, cancelPct: null, returnPct: null }, previous: { cancelPct: null, returnPct: null }, reasons: [], cancelBy: [], payment: [], skus: [], heat: { rows: [], cols: [], cells: [] }, shipHours: [], deliverDays: [], couriers: [] };
  const end = r.e;
  const wanted = addDaysISO(end, -(windowDays - 1));
  const start = r.s && r.s > wanted ? r.s : wanted; // never chart days before the first order we hold
  const prevStart = addDaysISO(start, -windowDays);

  // one row per order, so counts are orders
  const ord = sql`
    (select order_id, min(created_at) as created, bool_or(status = 'Canceled') as cancelled,
        bool_or(coalesce(cancel_type, '') = 'Return/Refund' or (coalesce(return_qty, 0) > 0 and status <> 'Canceled')) as returned,
        max(cancel_reason) filter (where status = 'Canceled') as reason, max(cancel_by) filter (where status = 'Canceled') as by,
        max(payment_method) as pay, min(shipped_at) as shipped, min(delivered_at) as delivered, max(shipping_provider) as courier
      from shop_order_lines where not is_sample group by order_id) o`;

  const daily = await rows<{ d: string; orders: number; cancelled: number; returned: number }>(sql`
    select to_char(created::date, 'YYYY-MM-DD') as d, count(*)::int as orders, (count(*) filter (where cancelled))::int as cancelled, (count(*) filter (where returned))::int as returned
    from ${ord} where created::date between ${start}::date and ${end}::date group by 1 order by 1`);
  const byDay = new Map(daily.map((x) => [x.d, x]));
  const days: OrderHealth["days"] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    const x = byDay.get(d);
    days.push({ day: d, orders: x?.orders ?? 0, cancelled: x?.cancelled ?? 0, returned: x?.returned ?? 0, ratePct: x?.orders ? pct(x.cancelled, x.orders) : null });
  }
  // unusual days: cancellation rate against the previous 28 days (needs enough orders that day to mean anything)
  const rates = days.map((x) => x.ratePct ?? 0);
  const flags = unusualPoints(rates, 28, 2.5, 1.5).filter((f) => days[f.index].orders >= 15 && f.z > 0).map((f) => ({ ...f, day: days[f.index].day }));

  const tot = days.reduce((a, x) => ({ orders: a.orders + x.orders, cancelled: a.cancelled + x.cancelled, returned: a.returned + x.returned }), { orders: 0, cancelled: 0, returned: 0 });
  const [prev] = await rows<{ orders: number; cancelled: number; returned: number }>(sql`
    select count(*)::int as orders, (count(*) filter (where cancelled))::int as cancelled, (count(*) filter (where returned))::int as returned
    from ${ord} where created::date between ${prevStart}::date and ${addDaysISO(start, -1)}::date`);

  const reasons = await rows<{ label: string; n: number }>(sql`
    select coalesce(nullif(reason, ''), 'No reason given') as label, count(*)::int as n from ${ord} where cancelled and created::date between ${start}::date and ${end}::date group by 1 order by 2 desc limit 7`);
  const cancelBy = await rows<{ label: string; n: number }>(sql`
    select coalesce(nullif(by, ''), 'Unknown') as label, count(*)::int as n from ${ord} where cancelled and created::date between ${start}::date and ${end}::date group by 1 order by 2 desc`);
  const payment = await rows<{ label: string; orders: number; c: number }>(sql`
    select coalesce(nullif(pay, ''), 'Unknown') as label, count(*)::int as orders, (count(*) filter (where cancelled))::int as c
    from ${ord} where created::date between ${start}::date and ${end}::date group by 1 having count(*) >= 30 order by 2 desc limit 5`);
  const skus = await rows<{ sku: string; name: string | null; orders: number; c: number; rt: number }>(sql`
    select upper(l.seller_sku) as sku, max(coalesce(k.name, l.variation, l.seller_sku)) as name, count(distinct l.order_id)::int as orders,
      (count(distinct l.order_id) filter (where l.status = 'Canceled'))::int as c,
      (count(distinct l.order_id) filter (where coalesce(l.cancel_type, '') = 'Return/Refund' or (coalesce(l.return_qty, 0) > 0 and l.status <> 'Canceled')))::int as rt
    from shop_order_lines l left join sku_items k on upper(k.sku) = upper(l.seller_sku)
    where not l.is_sample and l.seller_sku is not null and l.created_at::date between ${start}::date and ${end}::date
    group by upper(l.seller_sku) having count(distinct l.order_id) >= 30
    order by (count(distinct l.order_id) filter (where l.status = 'Canceled' or coalesce(l.cancel_type, '') = 'Return/Refund'))::float / count(distinct l.order_id) desc limit 8`);

  // weekday x week heat map (last 8 weeks that end at the data end)
  const heatStart = addDaysISO(end, -55);
  const hm = await rows<{ w: string; dow: number; n: number }>(sql`
    select to_char(date_trunc('week', created::date), 'YYYY-MM-DD') as w, extract(isodow from created::date)::int as dow, count(*)::int as n
    from ${ord} where created::date between ${heatStart}::date and ${end}::date group by 1, 2`);
  const cols = [...new Set(hm.map((x) => x.w))].sort();
  const cells = [1, 2, 3, 4, 5, 6, 7].map((dow) => cols.map((w) => hm.find((x) => x.w === w && x.dow === dow)?.n ?? null));

  const ship = await rows<{ b: string; n: number }>(sql`
    select case when h < 12 then '<12h' when h < 24 then '12–24h' when h < 48 then '1–2d' when h < 72 then '2–3d' else '3d+' end as b, count(*)::int as n
    from (select extract(epoch from (shipped - created)) / 3600 as h from ${ord} where shipped is not null and not cancelled and created::date between ${start}::date and ${end}::date) x group by 1`);
  const del = await rows<{ b: string; n: number }>(sql`
    select case when dd <= 2 then '≤2d' when dd <= 3 then '3d' when dd <= 4 then '4d' when dd <= 5 then '5d' when dd <= 7 then '6–7d' else '8d+' end as b, count(*)::int as n
    from (select extract(epoch from (delivered - shipped)) / 86400 as dd from ${ord} where delivered is not null and shipped is not null and created::date between ${start}::date and ${end}::date) x group by 1`);
  const cour = await rows<{ name: string; orders: number; med: number }>(sql`
    select coalesce(nullif(courier, ''), 'Unknown') as name, count(*)::int as orders,
      (percentile_cont(0.5) within group (order by extract(epoch from (delivered - shipped)) / 86400))::float8 as med
    from ${ord} where delivered is not null and shipped is not null and created::date between ${start}::date and ${end}::date
    group by 1 having count(*) >= 20 order by 2 desc limit 4`);
  const orderBins = (labels: string[], data: { b: string; n: number }[]) => labels.map((l) => ({ label: l, value: data.find((d) => d.b === l)?.n ?? 0 }));

  return {
    start,
    end,
    days,
    flags,
    totals: { ...tot, cancelPct: pct(tot.cancelled, tot.orders), returnPct: pct(tot.returned, tot.orders) },
    previous: { cancelPct: pct(prev?.cancelled ?? 0, prev?.orders ?? 0), returnPct: pct(prev?.returned ?? 0, prev?.orders ?? 0) },
    reasons,
    cancelBy,
    payment: payment.map((p) => ({ label: p.label, orders: p.orders, cancelPct: (p.c / p.orders) * 100 })),
    skus: skus.map((s) => ({ sku: s.sku, name: s.name ?? s.sku, orders: s.orders, cancelPct: (s.c / s.orders) * 100, returnPct: (s.rt / s.orders) * 100 })),
    heat: { rows: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], cols, cells },
    shipHours: orderBins(["<12h", "12–24h", "1–2d", "2–3d", "3d+"], ship),
    deliverDays: orderBins(["≤2d", "3d", "4d", "5d", "6–7d", "8d+"], del),
    couriers: cour.map((c) => ({ name: c.name, orders: c.orders, medianDays: c.med })),
  };
}
