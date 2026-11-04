import { sql } from "drizzle-orm";

/**
 * Affiliate order lines from the TikTok sync, shaped like the old upload view: `pay` = unit price × quantity,
 * `valid` = not fully returned and not cancelled. One definition, used by every Creators query.
 */
export const TL = sql.raw(`(
  select
    a.order_id, a.sku_id, a.creator, a.product_id, a.seller_sku, a.sku_name, a.content_id, a.created_at,
    case when upper(coalesce(a.content_type, '')) like '%LIVE%' then 'Livestream'
         when upper(coalesce(a.content_type, '')) like '%VIDEO%' then 'Video' else coalesce(a.content_type, 'Other') end as content_type,
    coalesce(a.price, 0) * coalesce(a.quantity, 1) as pay,
    coalesce(a.quantity, 1) as qty,
    coalesce(a.paid_commission, a.est_commission, 0) as comm,
    not (coalesce(a.fully_return, false)
         or exists (select 1 from tt_cancellations c where c.order_id = a.order_id and c.status ~* '(success|complete|done)')) as valid
  from tt_affiliate_order_lines a
) tl`);

/** A timestamp as a Malaysian calendar day. */
export const kd = (col: string) => sql.raw(`((${col}) at time zone 'Asia/Kuala_Lumpur')::date`);
