import "server-only";
import { sql as pg } from "@/db";

/**
 * Keeps `tt_aff_lines` (affiliate order lines with their Malaysian day, content type, value and "counts" flag worked out once) in step
 * with the TikTok tables. Every screen calls `ensureAffLines()` before reading; it costs one tiny check when nothing changed, and a
 * rebuild of a second or two after new data arrives (once, shared by all screens and processes).
 */
const STAMP_KEY = "aff_lines_stamp";
let checked: string | null = null;
let running: Promise<void> | null = null;

async function sourceStamp(): Promise<string> {
  const [r] = await pg`select concat_ws('|',
    (select count(*) from tt_affiliate_order_lines), (select max(synced_at)::text from tt_affiliate_order_lines),
    (select count(*) from tt_cancellations), (select max(synced_at)::text from tt_cancellations)) as s`;
  return String(r?.s ?? "");
}

async function rebuild(stamp: string) {
  await pg.begin(async (tx) => {
    // One rebuild at a time, across the web server and the worker. The second one finds the work already done.
    await tx`select pg_advisory_xact_lock(hashtext('tt_aff_lines'))`;
    const [have] = await tx`select value from settings where key = ${STAMP_KEY}`;
    if ((have?.value as { s?: string } | undefined)?.s === stamp) return;
    await tx`delete from tt_aff_lines`;
    await tx`
      insert into tt_aff_lines (order_id, sku_id, creator, product_id, seller_sku, sku_name, content_id, created_at, day, content_type, pay, qty, comm, valid)
      select a.order_id, a.sku_id, a.creator, a.product_id, a.seller_sku, a.sku_name, a.content_id, a.created_at,
        (a.created_at at time zone 'Asia/Kuala_Lumpur')::date,
        case when upper(coalesce(a.content_type, '')) like '%LIVE%' then 'Livestream'
             when upper(coalesce(a.content_type, '')) like '%VIDEO%' then 'Video' else coalesce(a.content_type, 'Other') end,
        coalesce(a.price, 0) * coalesce(a.quantity, 1), coalesce(a.quantity, 1), coalesce(a.paid_commission, a.est_commission, 0),
        not (coalesce(a.fully_return, false) or c.order_id is not null)
      from tt_affiliate_order_lines a
      left join (select distinct order_id from tt_cancellations where status ~* '(success|complete|done)') c on c.order_id = a.order_id`;
    await tx`insert into settings (key, value) values (${STAMP_KEY}, ${JSON.stringify({ s: stamp })}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  });
  await pg`analyze tt_aff_lines`;
}

/** Makes sure the prepared lines match the TikTok tables. Cheap when nothing changed (one small check; screens call it only when they rebuild). */
export async function ensureAffLines(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const stamp = await sourceStamp();
    if (checked !== stamp) {
      const [have] = await pg`select value from settings where key = ${STAMP_KEY}`;
      if ((have?.value as { s?: string } | undefined)?.s !== stamp) await rebuild(stamp);
    }
    checked = stamp;
  })().finally(() => { running = null; });
  return running;
}
