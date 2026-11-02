import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { Period } from "@/lib/period-core";

/** Typed raw query helper. Cast counts with ::int and sums with ::float8 in SQL. */
export async function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

/**
 * Affiliate order lines enriched with the shop-wide order status, which is the
 * source of truth for cancellations and returns. When the shop export hasn't
 * been uploaded we fall back to TikTok's "Ineligible" commission status.
 *
 * Note: "Unpaid by customer" on the affiliate export is cash-on-delivery that
 * hasn't been collected yet – it's a real sale, not a lost one.
 */
export const AL = sql.raw(`(
  select
    a.order_id, a.sku_id, a.product_id, a.creator, a.content_type, a.content_id, a.created_at,
    a.payment_amount as pay, a.quantity as qty, a.cod, a.status as aff_status,
    case when a.actual_commission + a.actual_ads_commission > 0
         then a.actual_commission + a.actual_ads_commission
         else a.est_commission + a.est_ads_commission end as comm,
    s.status as shop_status, s.cancel_type, s.cancel_reason, s.state, s.payment_method,
    (case when s.order_id is not null then s.status = 'Canceled' else a.status = 'Ineligible' end) as canceled,
    (case when s.order_id is not null then coalesce(s.cancel_type,'') = 'Return/Refund' else a.fully_refunded end) as returned,
    (case when s.order_id is not null
          then (s.status <> 'Canceled' and coalesce(s.cancel_type,'') <> 'Return/Refund')
          else (a.status <> 'Ineligible' and not a.fully_refunded) end) as valid
  from order_lines a
  left join shop_order_lines s on s.order_id = a.order_id and s.sku_id = a.sku_id
) al`);

/** created_at within [start, end] inclusive (dates are YYYY-MM-DD). */
export const between = (col: string, start: string, end: string) =>
  sql`${sql.raw(col)} >= ${start}::date and ${sql.raw(col)} < (${end}::date + 1)`;

export const inPeriod = (col: string, p: Pick<Period, "start" | "end">) => between(col, p.start, p.end);
export const inPrev = (col: string, p: Pick<Period, "prevStart" | "prevEnd">) => between(col, p.prevStart, p.prevEnd);

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const safeDiv = (a: number, b: number) => (b ? a / b : 0);

/** Safe `text[]` literal – drizzle spreads JS arrays into separate params otherwise. */
export function textArr(values: string[]): SQL {
  if (!values.length) return sql`'{}'::text[]`;
  return sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}
