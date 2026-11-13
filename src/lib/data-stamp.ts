import "server-only";
import { sql as pg } from "@/db";

let last: { at: number; value: string } | null = null;

/**
 * A short text that changes whenever new data arrives from TikTok or from the ads sync.
 * It reads only tiny tables and the database's own counters, so it takes a few milliseconds even with 100,000s of rows.
 */
export async function syncStamp(): Promise<string> {
  if (last && Date.now() - last.at < 2_000) return last.value;
  const [r] = await pg`select concat_ws('|',
    (select max(last_success_at)::text from tt_sync_state), (select max(last_success_at)::text from ads_sync_state),
    (select sum(n_tup_ins + n_tup_upd + n_tup_del) from pg_stat_user_tables where relname in ('tt_orders', 'tt_fin_transactions', 'tt_fin_unsettled', 'tt_fin_statements', 'tt_affiliate_order_lines', 'ads_campaign_daily', 'ads_creative_daily', 'ads_product_daily', 'ads_boosts', 'tt_videos'))) as s`;
  const value = String(r?.s ?? "");
  last = { at: Date.now(), value };
  return value;
}

/** Things the team changes by hand (boost log, product mapping): a screen must show these at once, so they are part of the "local" stamp. */
export async function localStamp(): Promise<string> {
  const [r] = await pg`select concat_ws('|',
    (select count(*) from ads_boost_batches), (select max(id) from ads_boost_batches), (select count(*) from ads_boost_batch_videos), (select max(id) from ads_boost_actions),
    (select count(*) from ads_auth_asks), (select max(updated_at)::text from product_map), (select count(*) from product_map)) as s`;
  return String(r?.s ?? "");
}
