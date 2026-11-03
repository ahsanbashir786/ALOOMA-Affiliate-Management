import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getThresholds } from "@/lib/analytics/settings";
import { AL, rows } from "@/lib/analytics/sql";

/** Effective result: a correction made by the team wins over the automatic check. */
export const RESULT_EXPR = sql.raw(`coalesce(s.result_override, s.result)`);

// ───────────────────────── Creator matching ─────────────────────────

/**
 * TikTok masks the receiver on sample orders ("p***ha_love"): the first letter and
 * the end of the handle are visible. Match against known creators, most likely
 * pool first (creators TikTok says received samples), and only accept a single hit.
 */
export function maskMatcher(masked: string) {
  const parts = masked.toLowerCase().split(/\*+/);
  const prefix = parts[0] ?? "";
  const suffix = parts.length > 1 ? parts[parts.length - 1] : "";
  const min = prefix.length + suffix.length + 1;
  return (name: string) => {
    const n = name.toLowerCase();
    return n.length >= min && n.startsWith(prefix) && n.endsWith(suffix);
  };
}

async function matchSampleCreators(): Promise<number> {
  const pending = await rows<{ masked: string }>(sql`
    select distinct buyer_masked as masked from samples
    where creator is null and buyer_masked is not null and coalesce(creator_match, '') <> 'manual'`);
  if (!pending.length) return 0;

  const pools = await Promise.all([
    rows<{ u: string }>(sql`
      select distinct username as u from sample_snapshots where shipped > 0
      union select distinct username from creator_txn_snapshots where samples_shipped > 0`),
    rows<{ u: string }>(sql`select username as u from creators where phone is not null`),
    rows<{ u: string }>(sql`
      select distinct username as u from creator_list_snapshots
      union select distinct username from creator_txn_snapshots
      union select distinct creator from order_lines
      union select distinct creator from videos`),
  ]).then((ps) => ps.map((p) => p.map((r) => r.u).filter(Boolean)));

  let matched = 0;
  for (const { masked } of pending) {
    const test = maskMatcher(masked);
    let hit: string | null = null;
    for (const pool of pools) {
      const found = pool.filter(test);
      if (found.length === 1) {
        hit = found[0];
        break;
      }
      if (found.length > 1) break; // ambiguous – leave it for the team
    }
    if (!hit) continue;
    await db.execute(sql`
      update samples set creator = ${hit}, creator_match = 'auto', updated_at = now()
      where buyer_masked = ${masked} and creator is null`);
    matched++;
  }
  return matched;
}

// ───────────────────────── Posting check ─────────────────────────

/**
 * For every sample: did the creator post a video with that product (Video analysis, or a
 * new video already selling in the orders), go LIVE (LIVE orders), or does TikTok's sample
 * analysis report content with samples? Otherwise it is "waiting" until the deadline
 * (delivery + N days) and "not posted" after it. Also records how many videos were posted,
 * their views, and the valid sales of the sampled product made by that new content.
 */
async function computeSampleResults(postDays: number): Promise<void> {
  await db.execute(sql`
    with ref as (
      select greatest(
        coalesce((select max(period_end) from uploads where kind in ('video_list', 'creator_transactions')), date '1970-01-01'),
        coalesce((select max(created_at)::date from order_lines), date '1970-01-01')
      ) as d
    ),
    sp as (
      select s.id, s.creator, s.delivered_at, s.order_status,
        coalesce(
          (select o.product_id from order_lines o where s.sku_id is not null and o.sku_id = s.sku_id limit 1),
          (select o.product_id from order_lines o where s.seller_sku is not null and upper(o.seller_sku) = upper(s.seller_sku) limit 1),
          (select p.product_id from products p where s.product_name is not null and p.name = s.product_name limit 1)
        ) as pid
      from samples s where s.source = 'orders'
    ),
    vid as (
      select distinct on (sp.id) sp.id, v.video_id, v.posted_at, v.link, coalesce(sp.pid = any(v.product_ids), false) as prod
      from sp join videos v on v.creator = sp.creator and v.posted_at >= sp.delivered_at - interval '1 day'
      where sp.delivered_at is not null
      order by sp.id, coalesce(sp.pid = any(v.product_ids), false) desc, v.posted_at asc
    ),
    vstats as (
      select sp.id,
        (count(*) filter (where coalesce(sp.pid = any(v.product_ids), false)))::int as vp,
        (count(*) filter (where not coalesce(sp.pid = any(v.product_ids), false)))::int as vo,
        coalesce(sum(vv.views) filter (where coalesce(sp.pid = any(v.product_ids), false)), 0)::int as views
      from sp
      join videos v on v.creator = sp.creator and v.posted_at >= sp.delivered_at - interval '1 day'
      left join lateral (select max(s2.views) as views from video_snapshots s2 where s2.video_id = v.video_id) vv on true
      where sp.delivered_at is not null
      group by sp.id
    ),
    ovid as (
      -- A video that only shows up in orders (not yet in the video report) and first sold after delivery is new content.
      select distinct on (sp.id) sp.id, o.content_id as video_id, min(o.created_at) as at, bool_or(o.product_id = sp.pid) as prod
      from sp
      join order_lines o on o.creator = sp.creator and o.content_type = 'Video' and o.content_id is not null
      where sp.delivered_at is not null and not exists (select 1 from videos v where v.video_id = o.content_id)
      group by sp.id, o.content_id
      having min(o.created_at) >= min(sp.delivered_at)
      order by sp.id, bool_or(o.product_id = sp.pid) desc, min(o.created_at) asc
    ),
    ocnt as (
      select x.id, count(*)::int as n from (
        select sp.id, o.content_id
        from sp
        join order_lines o on o.creator = sp.creator and o.content_type = 'Video' and o.content_id is not null
          and (sp.pid is null or o.product_id = sp.pid)
        where sp.delivered_at is not null and not exists (select 1 from videos v where v.video_id = o.content_id)
        group by sp.id, o.content_id
        having min(o.created_at) >= min(sp.delivered_at)
      ) x group by x.id
    ),
    live as (
      select sp.id, min(o.created_at) as at
      from sp join order_lines o on o.creator = sp.creator and o.content_type = 'Livestream' and o.created_at >= sp.delivered_at
      where sp.delivered_at is not null
      group by sp.id
    ),
    snap as (
      select sp.id, bool_or(ss.videos_with_samples > 0) as v, bool_or(ss.live_with_samples > 0) as l
      from sp
      join sample_snapshots ss on ss.username = sp.creator
      join uploads u on u.id = ss.upload_id
      where sp.delivered_at is not null and u.period_end >= sp.delivered_at::date
      group by sp.id
    ),
    gmv as (
      select sp.id,
        coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as gmv,
        (count(distinct al.order_id) filter (where al.valid))::int as n
      from sp
      join ${AL} on al.creator = sp.creator and al.created_at >= sp.delivered_at and (sp.pid is null or al.product_id = sp.pid)
      left join videos v on v.video_id = al.content_id
      -- Only content made after the sample arrived: new videos and LIVEs (not old videos that keep selling).
      where sp.delivered_at is not null
        and (al.content_type = 'Livestream'
          or (al.content_type = 'Video' and (v.video_id is null or v.posted_at >= sp.delivered_at - interval '1 day')))
      group by sp.id
    )
    update samples s set
      result = case
        when sp.order_status = 'Canceled' then 'cancelled'
        when sp.creator is null then 'no_creator'
        when sp.delivered_at is null then 'in_transit'
        when vid.prod or ovid.prod then 'posted_video'
        when live.at is not null then 'did_live'
        when snap.v then 'posted_video'
        when snap.l then 'did_live'
        when vid.video_id is not null or ovid.video_id is not null then 'posted_other'
        when sp.delivered_at::date + ${postDays}::int > ref.d then 'in_window'
        else 'not_posted' end,
      posted_at = case
        when vid.prod then vid.posted_at when ovid.prod then ovid.at when live.at is not null then live.at
        else coalesce(vid.posted_at, ovid.at) end,
      post_video_id = case when vid.prod or (vid.video_id is not null and not coalesce(ovid.prod, false)) then vid.video_id else ovid.video_id end,
      post_link = case
        when vid.prod or (vid.video_id is not null and not coalesce(ovid.prod, false)) then vid.link
        when ovid.video_id is not null then 'https://www.tiktok.com/@' || sp.creator || '/video/' || ovid.video_id end,
      product_id = sp.pid,
      video_count = coalesce(vstats.vp, 0) + coalesce(ocnt.n, 0),
      other_video_count = coalesce(vstats.vo, 0),
      content_views = coalesce(vstats.views, 0),
      content_gmv = coalesce(gmv.gmv, 0),
      content_orders = coalesce(gmv.n, 0),
      checked_at = now()
    from sp
    cross join ref
    left join vid on vid.id = sp.id
    left join vstats on vstats.id = sp.id
    left join ovid on ovid.id = sp.id
    left join ocnt on ocnt.id = sp.id
    left join live on live.id = sp.id
    left join snap on snap.id = sp.id
    left join gmv on gmv.id = sp.id
    where s.id = sp.id`);
}

/** Matches creators and re-runs the posting check. Safe to run any time. */
export async function refreshSamples(): Promise<{ matched: number }> {
  // Earlier versions also kept hand-logged and staff-sheet samples; samples now come from orders only.
  await db.execute(sql`delete from samples where source <> 'orders'`);
  const t = await getThresholds();
  const matched = await matchSampleCreators();
  await computeSampleResults(t.samplePostDays);
  return { matched };
}

/** Latest date the posting check can see (video/transaction reports or orders). */
export async function sampleDataDate(): Promise<string | null> {
  const [r] = await rows<{ d: string | null }>(sql`
    select to_char(greatest(
      (select max(period_end) from uploads where kind in ('video_list', 'creator_transactions')),
      (select max(created_at)::date from order_lines)), 'YYYY-MM-DD') as d`);
  return r?.d ?? null;
}
