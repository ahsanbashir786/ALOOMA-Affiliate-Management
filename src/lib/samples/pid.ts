import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";

/** The sample lines being checked with the product each one belongs to (all samples, or just the given ones). */
export const spCte = (ids?: number[]) => sql`
  sp as (
    select s.id, s.creator, s.delivered_at, s.order_status,
      coalesce(
        (select o.product_id from order_lines o where s.sku_id is not null and o.sku_id = s.sku_id limit 1),
        (select o.product_id from order_lines o where s.seller_sku is not null and upper(o.seller_sku) = upper(s.seller_sku) limit 1),
        (select p.product_id from products p where s.product_name is not null and p.name = s.product_name limit 1)
      ) as pid
    from samples s where s.source = 'orders' ${ids ? sql`and s.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}
  )`;

/** Product of each given sample line (null when it cannot be established – then no sales are ever credited to it). */
export async function sampleProducts(ids: number[]): Promise<Map<number, string | null>> {
  if (!ids.length) return new Map();
  const r = await rows<{ id: number; pid: string | null }>(sql`with ${spCte(ids)} select id, pid from sp`);
  return new Map(r.map((x) => [x.id, x.pid]));
}

