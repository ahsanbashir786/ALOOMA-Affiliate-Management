import { sql } from "drizzle-orm";

/**
 * Affiliate order lines from the TikTok sync (prepared in tt_aff_lines; call ensureAffLines() first), shaped like the old upload view: `pay` = unit price × quantity,
 * `valid` = not fully returned and not cancelled; `pk` = which of the 13 products (not-ALOOMA products such as toys are left out). One definition, used by every Creators query.
 */
export const TL = sql.raw(`(
  select l.order_id, l.sku_id, l.creator, l.product_id, l.seller_sku, l.sku_name, l.content_id, l.created_at, l.day,
    coalesce(pm.product_key, 'unmapped') as pk, l.content_type, l.pay, l.qty, l.comm, l.valid
  from tt_aff_lines l
  left join product_map pm on pm.product_id = l.product_id
  where coalesce(pm.product_key, 'unmapped') <> 'excluded'
) tl`);

/**
 * Which of the 13 products a listing is (worked out automatically), else "unmapped".
 * (SQL text for use inside queries; the argument is a column name, never user input.)
 */
export const PK_LISTING = (pid: string) => `coalesce((select m.product_key from product_map m where m.product_id = ${pid}), 'unmapped')`;

/** A timestamp as a Malaysian calendar day. */
export const kd = (col: string) => sql.raw(col === "tl.created_at" ? "tl.day" : `((${col}) at time zone 'Asia/Kuala_Lumpur')::date`);
