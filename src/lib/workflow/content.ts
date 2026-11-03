import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Rebuilds the general content layer: one row per creator video or LIVE, whether or not a sample exists.
 *  • Videos from Video analysis carry a posting date (from the report) and the products they list.
 *  • Videos and LIVEs seen only in orders have NO posting date – only the first day a sale was seen (a different thing).
 *  • Content ids staff verified by pasting a link are added with no dates at all.
 * Products are the report's list plus products that content actually sold. Safe to run any time; staff decisions are never touched.
 */
export async function refreshContent(): Promise<void> {
  await db.execute(sql`delete from content_items`);
  await db.execute(sql`
    insert into content_items (content_id, creator, kind, product_ids, posted_at, first_observed_on, link, views, source)
    select v.video_id, v.creator, 'video',
      (select coalesce(array_agg(distinct x), '{}') from unnest(v.product_ids || coalesce((select array_agg(distinct o.product_id) from order_lines o where o.content_id = v.video_id), '{}')) x),
      v.posted_at,
      (select min(u.period_start) from video_snapshots vs join uploads u on u.id = vs.upload_id where vs.video_id = v.video_id),
      v.link,
      coalesce((select max(s.views) from video_snapshots s where s.video_id = v.video_id), 0),
      'video_report'
    from videos v`);
  await db.execute(sql`
    insert into content_items (content_id, creator, kind, product_ids, posted_at, first_observed_on, link, views, source)
    select coalesce(o.content_id, 'live:' || o.creator || ':' || min(o.created_at)::date::text),
      o.creator,
      case when o.content_type = 'Livestream' then 'live' else 'video' end,
      array_agg(distinct o.product_id),
      null,
      min(o.created_at)::date,
      case when o.content_type = 'Video' and o.content_id is not null then 'https://www.tiktok.com/@' || o.creator || '/video/' || o.content_id end,
      0,
      'orders'
    from order_lines o
    where o.content_type in ('Video', 'Livestream') and o.creator is not null and o.creator <> '(unknown)'
      and (o.content_id is not null or o.content_type = 'Livestream')
    group by o.content_id, o.creator, o.content_type
    on conflict (content_id) do nothing`);
  // manually verified links that no report has seen yet: known to exist, nothing else known
  await db.execute(sql`
    insert into content_items (content_id, creator, kind, product_ids, posted_at, first_observed_on, link, views, source)
    select distinct on (d.content_id) d.content_id, d.username, 'video', '{}', null, null, d.link, 0, 'manual'
    from content_decisions d
    where d.decision = 'verified' and d.reverted_at is null and d.content_id is not null
    order by d.content_id, d.at
    on conflict (content_id) do nothing`);
}
