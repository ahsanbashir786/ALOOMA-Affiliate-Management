import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getThresholds } from "@/lib/analytics/settings";
import { AL, rows } from "@/lib/analytics/sql";

/** Effective result: a manual override from the team wins over the automatic check. */
export const RESULT_EXPR = sql.raw(`coalesce(s.result_override, s.result)`);

export const RESULTS = {
  not_posted: { label: "Not posted – chase", tone: "critical" },
  in_window: { label: "Waiting to post", tone: "warn" },
  in_transit: { label: "On the way", tone: "neutral" },
  posted_video: { label: "Posted video", tone: "good" },
  did_live: { label: "Did LIVE", tone: "good" },
  posted_other: { label: "Posted, other product", tone: "brand" },
  no_creator: { label: "Creator unknown", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  requested: { label: "Requested", tone: "neutral" },
  history: { label: "From staff sheet", tone: "neutral" },
} as const;
export type ResultKey = keyof typeof RESULTS;
export const POSTED: ResultKey[] = ["posted_video", "did_live", "posted_other"];

// ───────────────────────── Creator matching ─────────────────────────

/**
 * TikTok masks the buyer on sample orders ("p***ha_love"): the first letter and
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
    where source = 'orders' and creator is null and buyer_masked is not null and coalesce(creator_match, '') <> 'manual'`);
  if (!pending.length) return 0;

  const pools = await Promise.all([
    rows<{ u: string }>(sql`
      select distinct username as u from sample_snapshots where shipped > 0
      union select distinct username from creator_txn_snapshots where samples_shipped > 0`),
    rows<{ u: string }>(sql`
      select username as u from creators where phone is not null
      union select distinct creator from samples where source = 'staff_sheet' and creator is not null`),
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
      where buyer_masked = ${masked} and creator is null and source = 'orders'`);
    matched++;
  }
  return matched;
}

/**
 * A sample the team logged by hand (requested/approved before TikTok created the
 * order) is merged into the matching order once it arrives: same creator, same
 * SKU (or no SKU given), order created on/after the request.
 */
async function mergeManualSamples(): Promise<number> {
  const pairs = await rows<{ manual_id: number; order_id: number }>(sql`
    select distinct on (m.id) m.id as manual_id, o.id as order_id
    from samples m
    join samples o on o.source = 'orders' and o.creator = m.creator
      and (m.seller_sku is null or upper(o.seller_sku) = upper(m.seller_sku))
      and (m.requested_at is null or o.approved_at >= m.requested_at::date - 3)
      and o.requested_at is null
    where m.source = 'manual' and m.order_id is null and m.creator is not null
    order by m.id, o.approved_at asc`);
  const usedOrders = new Set<number>();
  let merged = 0;
  for (const p of pairs) {
    if (usedOrders.has(p.order_id)) continue;
    usedOrders.add(p.order_id);
    await db.execute(sql`
      update samples o set
        requested_at = coalesce(o.requested_at, m.requested_at, m.created_at::date),
        owner_id = coalesce(o.owner_id, m.owner_id),
        note = coalesce(o.note, m.note),
        follow_up_at = coalesce(o.follow_up_at, m.follow_up_at),
        result_override = coalesce(o.result_override, m.result_override),
        raw_code = coalesce(o.raw_code, m.raw_code),
        updated_at = now()
      from samples m where o.id = ${p.order_id} and m.id = ${p.manual_id}`);
    await db.execute(sql`delete from samples where id = ${p.manual_id}`);
    merged++;
  }
  return merged;
}

// ───────────────────────── Posting check ─────────────────────────

/**
 * For every delivered sample: did the creator post a video with that product
 * (Video analysis), go LIVE (LIVE orders), or does TikTok's sample analysis
 * report content with samples? Otherwise it's "waiting" until the deadline
 * (delivery + N days) and "not posted" after it. Also records the valid sales
 * the creator made with the sampled product after delivery.
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
      from samples s where s.source in ('orders', 'manual')
    ),
    vid as (
      select distinct on (sp.id) sp.id, v.video_id, v.posted_at, v.link, coalesce(sp.pid = any(v.product_ids), false) as prod
      from sp join videos v on v.creator = sp.creator and v.posted_at >= sp.delivered_at - interval '1 day'
      where sp.delivered_at is not null
      order by sp.id, coalesce(sp.pid = any(v.product_ids), false) desc, v.posted_at asc
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
        when sp.creator is null and s.source = 'orders' then 'no_creator'
        when s.source = 'manual' and s.order_id is null and sp.delivered_at is null then 'requested'
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
      content_gmv = coalesce(gmv.gmv, 0),
      content_orders = coalesce(gmv.n, 0),
      checked_at = now()
    from sp
    cross join ref
    left join vid on vid.id = sp.id
    left join ovid on ovid.id = sp.id
    left join live on live.id = sp.id
    left join snap on snap.id = sp.id
    left join gmv on gmv.id = sp.id
    where s.id = sp.id`);
}

/** Matches creators, merges hand-logged samples and re-runs the posting check. Safe to run any time. */
export async function refreshSamples(): Promise<{ matched: number; merged: number }> {
  const t = await getThresholds();
  const matched = await matchSampleCreators();
  const merged = await mergeManualSamples();
  await computeSampleResults(t.samplePostDays);
  return { matched, merged };
}

/** Latest date the posting check can see (video/transaction reports or orders). */
export async function sampleDataDate(): Promise<string | null> {
  const [r] = await rows<{ d: string | null }>(sql`
    select to_char(greatest(
      (select max(period_end) from uploads where kind in ('video_list', 'creator_transactions')),
      (select max(created_at)::date from order_lines)), 'YYYY-MM-DD') as d`);
  return r?.d ?? null;
}
