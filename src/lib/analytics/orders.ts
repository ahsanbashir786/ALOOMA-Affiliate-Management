import "server-only";
import { sql } from "drizzle-orm";
import type { Period } from "@/lib/period-core";
import { inPeriod, rows, safeDiv } from "./sql";

export type OrderHealth = {
  orders: number;
  gross: number;
  net: number;
  cancelledOrders: number;
  returnedOrders: number;
  cancelRate: number;
  aov: number;
  codShare: number;
  avgShipHours: number | null;
  avgDeliveryDays: number | null;
  cancelReasons: { reason: string; by: string | null; n: number }[];
  payments: { method: string; orders: number; cancelRate: number; gmv: number }[];
  states: { state: string; orders: number; gmv: number; cancelRate: number }[];
  statuses: { status: string; orders: number }[];
  providers: { name: string; orders: number; avgDays: number | null }[];
  hasData: boolean;
};

export async function getOrderHealth(period: Period): Promise<OrderHealth> {
  const w = inPeriod("created_at", period);
  const [k] = await rows<{
    orders: number; gross: number; net: number; canc: number; ret: number; cod: number; ship: number | null; deliv: number | null;
  }>(sql`
    select count(distinct order_id)::int as orders,
      coalesce(sum(subtotal_after),0)::float8 as gross,
      coalesce(sum(subtotal_after) filter (where status <> 'Canceled' and coalesce(cancel_type,'') <> 'Return/Refund'),0)::float8 as net,
      count(distinct order_id) filter (where status = 'Canceled')::int as canc,
      count(distinct order_id) filter (where coalesce(cancel_type,'') = 'Return/Refund')::int as ret,
      coalesce(sum(subtotal_after) filter (where payment_method = 'Cash on delivery'),0)::float8 as cod,
      (avg(extract(epoch from (shipped_at - created_at)) / 3600) filter (where shipped_at is not null))::float8 as ship,
      (avg(extract(epoch from (delivered_at - created_at)) / 86400) filter (where delivered_at is not null))::float8 as deliv
    from shop_order_lines where ${w}`);
  if (!k || k.orders === 0) {
    return { orders: 0, gross: 0, net: 0, cancelledOrders: 0, returnedOrders: 0, cancelRate: 0, aov: 0, codShare: 0, avgShipHours: null, avgDeliveryDays: null, cancelReasons: [], payments: [], states: [], statuses: [], providers: [], hasData: false };
  }
  const [reasons, payments, states, statuses, providers] = await Promise.all([
    rows<{ reason: string; by: string | null; n: number }>(sql`
      select coalesce(cancel_reason,'Not stated') as reason, max(cancel_by) as by, count(distinct order_id)::int as n
      from shop_order_lines where status = 'Canceled' and ${w} group by 1 order by n desc limit 8`),
    rows<{ method: string; orders: number; canc: number; gmv: number }>(sql`
      select coalesce(payment_method,'Unknown') as method, count(distinct order_id)::int as orders,
        count(distinct order_id) filter (where status = 'Canceled')::int as canc,
        coalesce(sum(subtotal_after) filter (where status <> 'Canceled'),0)::float8 as gmv
      from shop_order_lines where ${w} group by 1 order by orders desc`),
    rows<{ state: string; orders: number; canc: number; gmv: number }>(sql`
      select coalesce(state,'Unknown') as state, count(distinct order_id)::int as orders,
        count(distinct order_id) filter (where status = 'Canceled')::int as canc,
        coalesce(sum(subtotal_after) filter (where status <> 'Canceled' and coalesce(cancel_type,'') <> 'Return/Refund'),0)::float8 as gmv
      from shop_order_lines where ${w} group by 1 order by gmv desc limit 10`),
    rows<{ status: string; orders: number }>(sql`
      select coalesce(substatus, status) as status, count(distinct order_id)::int as orders
      from shop_order_lines where ${w} group by 1 order by orders desc`),
    rows<{ name: string; orders: number; days: number | null }>(sql`
      select coalesce(shipping_provider,'Not shipped') as name, count(distinct order_id)::int as orders,
        (avg(extract(epoch from (delivered_at - created_at)) / 86400) filter (where delivered_at is not null))::float8 as days
      from shop_order_lines where status <> 'Canceled' and ${w} group by 1 order by orders desc limit 5`),
  ]);
  return {
    orders: k.orders,
    gross: k.gross,
    net: k.net,
    cancelledOrders: k.canc,
    returnedOrders: k.ret,
    cancelRate: safeDiv(k.canc, k.orders),
    aov: safeDiv(k.net, k.orders - k.canc),
    codShare: safeDiv(k.cod, k.gross),
    avgShipHours: k.ship,
    avgDeliveryDays: k.deliv,
    cancelReasons: reasons,
    payments: payments.map((p) => ({ method: p.method, orders: p.orders, cancelRate: safeDiv(p.canc, p.orders), gmv: p.gmv })),
    states: states.map((s) => ({ state: s.state, orders: s.orders, gmv: s.gmv, cancelRate: safeDiv(s.canc, s.orders) })),
    statuses,
    providers: providers.map((p) => ({ name: p.name, orders: p.orders, avgDays: p.days })),
    hasData: true,
  };
}
