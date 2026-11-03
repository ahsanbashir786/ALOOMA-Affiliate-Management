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

/** The sample lines being checked with the product each one belongs to (all samples, or just the given ones). */
const spCte = (ids?: number[]) => sql`
  sp as (
    select s.id, s.creator, s.delivered_at, s.order_status,
      coalesce(
        (select o.product_id from order_lines o where s.sku_id is not null and o.sku_id = s.sku_id limit 1),
        (select o.product_id from order_lines o where s.seller_sku is not null and upper(o.seller_sku) = upper(s.seller_sku) limit 1),
        (select p.product_id from products p where s.product_name is not null and p.name = s.product_name limit 1)
      ) as pid
    from samples s where s.source = 'orders' ${ids ? sql`and s.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}
  )`;

/**
 * Content the system finds for each sample, and how sure it is.
 *  - confirmed: same creator, a video that lists the sampled product (or a new video / LIVE already selling that
 *    product), posted on/after delivery. These complete the sample.
 *  - uncertain: plausible but unproven – a video with no product listed, a LIVE that sold other products, or TikTok's
 *    creator-level "content with samples" flag. These go to the review queue and never complete a sample by themselves.
 * A video about other products is unrelated and is ignored. Staff decisions are applied afterwards and are never rebuilt.
 */
async function buildSampleEvidence(ids?: number[]): Promise<void> {
  await db.execute(sql`delete from sample_content where sample_id in (select id from samples s where s.source = 'orders' ${ids ? sql`and s.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``})`);
  await db.execute(sql`
    with ${spCte(ids)},
    ev as (
      select sp.id as sample_id, v.video_id as content_id, 'video' as kind, v.link, v.posted_at,
        coalesce((select max(s2.views) from video_snapshots s2 where s2.video_id = v.video_id), 0)::int as views,
        'confirmed' as confidence, 'Video lists the sampled product and was posted after delivery' as reason
      from sp join videos v on v.creator = sp.creator and v.posted_at >= sp.delivered_at - interval '1 day' and sp.pid = any(v.product_ids)
      where sp.delivered_at is not null and sp.pid is not null
      union all
      select sp.id, o.content_id, 'video', 'https://www.tiktok.com/@' || sp.creator || '/video/' || o.content_id, min(o.created_at), 0,
        'confirmed', 'A new video is already selling the sampled product (not in Video analysis yet)'
      from sp join order_lines o on o.creator = sp.creator and o.content_type = 'Video' and o.content_id is not null and o.product_id = sp.pid
      where sp.delivered_at is not null and not exists (select 1 from videos v2 where v2.video_id = o.content_id)
      group by sp.id, o.content_id, sp.creator, sp.delivered_at
      having min(o.created_at) >= sp.delivered_at
      union all
      select sp.id, coalesce(o.content_id, 'live-' || o.created_at::date::text), 'live', null, min(o.created_at), 0,
        'confirmed', 'A LIVE sold the sampled product after delivery'
      from sp join order_lines o on o.creator = sp.creator and o.content_type = 'Livestream' and o.created_at >= sp.delivered_at and o.product_id = sp.pid
      where sp.delivered_at is not null
      group by sp.id, coalesce(o.content_id, 'live-' || o.created_at::date::text)
      union all
      select sp.id, v.video_id, 'video', v.link, v.posted_at,
        coalesce((select max(s2.views) from video_snapshots s2 where s2.video_id = v.video_id), 0)::int,
        'uncertain', 'A video posted after delivery has no product listed – it may or may not be the sample'
      from sp join videos v on v.creator = sp.creator and v.posted_at >= sp.delivered_at - interval '1 day' and coalesce(cardinality(v.product_ids), 0) = 0
      where sp.delivered_at is not null
      union all
      select sp.id, coalesce(o.content_id, 'live-' || o.created_at::date::text), 'live', null, min(o.created_at), 0,
        'uncertain', 'A LIVE sold other products after delivery – not proven to be about the sample'
      from sp join order_lines o on o.creator = sp.creator and o.content_type = 'Livestream' and o.created_at >= sp.delivered_at
        and (sp.pid is null or o.product_id <> sp.pid)
      where sp.delivered_at is not null
      group by sp.id, coalesce(o.content_id, 'live-' || o.created_at::date::text)
      union all
      select sp.id, 'report:' || sp.creator, 'report', null, null, 0,
        'uncertain', 'TikTok''s sample report says this creator posted content with samples – not tied to this product or date'
      from sp
      where sp.delivered_at is not null and exists (
        select 1 from sample_snapshots ss join uploads u on u.id = ss.upload_id
        where ss.username = sp.creator and (ss.videos_with_samples > 0 or ss.live_with_samples > 0) and u.period_end >= sp.delivered_at::date)
    )
    insert into sample_content (sample_id, content_id, kind, link, posted_at, views, confidence, reason)
    select distinct on (sample_id, content_id) sample_id, content_id, kind, link, posted_at, views, confidence, reason from ev
    order by sample_id, content_id, (confidence = 'confirmed') desc`);
  // Once a sample has confirmed content, the weaker evidence is just noise.
  await db.execute(sql`
    delete from sample_content a where a.confidence = 'uncertain'
      and exists (select 1 from sample_content b where b.sample_id = a.sample_id and b.confidence = 'confirmed')
      ${ids ? sql`and a.sample_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}`);
}

/**
 * Sets every sample's result from the evidence, the staff decisions and the deadline.
 * Result: confirmed content → posted (video / LIVE); else uncertain evidence → "needs review";
 * else waiting until the post-by date (an agreed date from a promise wins over delivery + default days), then "not posted".
 */
async function computeSampleResults(postDays: number, ids?: number[]): Promise<void> {
  const notRejected = sql`not exists (select 1 from content_decisions d where d.decision = 'rejected' and d.reverted_at is null
    and d.sample_id = sc.sample_id and d.content_id = sc.content_id)`;
  await db.execute(sql`
    with ref as (
      select greatest(
        coalesce((select max(period_end) from uploads where kind in ('video_list', 'creator_transactions')), date '1970-01-01'),
        coalesce((select max(created_at)::date from order_lines), date '1970-01-01')
      ) as d
    ),
    ${spCte(ids)},
    cnf as (
      select sample_id,
        (count(*) filter (where kind = 'video'))::int as vids, (count(*) filter (where kind = 'live'))::int as lives,
        min(posted_at) as first_at, min(link) filter (where link is not null) as link,
        coalesce(sum(views) filter (where kind = 'video'), 0)::int as views, min(content_id) filter (where kind = 'video') as first_id
      from sample_content sc where sc.confidence = 'confirmed' and ${notRejected}
      group by sample_id
    ),
    unc as (select sample_id, count(*)::int as n from sample_content sc where sc.confidence = 'uncertain' and ${notRejected} group by sample_id),
    ver as (
      select sample_id, count(*)::int as n, min(link) as link, min(content_id) as cid, min(at) as at
      from content_decisions where decision = 'verified' and sample_id is not null and reverted_at is null group by sample_id
    ),
    agreed as (
      select x.id as sample_id, max(c.promised_on) as d
      from sp x join commitments c on x.id = any(c.sample_ids) join staff_events e on e.id = c.event_id and e.reverted_at is null
      group by x.id
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
        when coalesce(cnf.vids, 0) + coalesce(ver.n, 0) > 0 then 'posted_video'
        when coalesce(cnf.lives, 0) > 0 then 'did_live'
        when coalesce(unc.n, 0) > 0 then 'uncertain'
        when coalesce(agreed.d, sp.delivered_at::date + ${postDays}::int) >= ref.d then 'in_window'
        else 'not_posted' end,
      post_by = case when sp.delivered_at is null then null else coalesce(agreed.d, sp.delivered_at::date + ${postDays}::int) end,
      post_by_source = case when sp.delivered_at is null then null when agreed.d is not null then 'agreed' else 'default' end,
      posted_at = coalesce(cnf.first_at, ver.at),
      post_video_id = coalesce(cnf.first_id, ver.cid),
      post_link = coalesce(cnf.link, ver.link),
      product_id = sp.pid,
      video_count = coalesce(cnf.vids, 0) + coalesce(ver.n, 0),
      other_video_count = 0,
      content_views = coalesce(cnf.views, 0),
      content_gmv = coalesce(gmv.gmv, 0),
      content_orders = coalesce(gmv.n, 0),
      checked_at = now()
    from sp
    cross join ref
    left join cnf on cnf.sample_id = sp.id
    left join unc on unc.sample_id = sp.id
    left join ver on ver.sample_id = sp.id
    left join agreed on agreed.sample_id = sp.id
    left join gmv on gmv.id = sp.id
    where s.id = sp.id`);
}

/** Matches creators and re-runs the posting check (all samples, or only the given ones). Safe to run any time. */
export async function refreshSamples(opts: { sampleIds?: number[] } = {}): Promise<{ matched: number }> {
  // Earlier versions also kept hand-logged and staff-sheet samples; samples now come from orders only.
  await db.execute(sql`delete from samples where source <> 'orders'`);
  const t = await getThresholds();
  const matched = opts.sampleIds ? 0 : await matchSampleCreators();
  await buildSampleEvidence(opts.sampleIds);
  await computeSampleResults(t.samplePostDays, opts.sampleIds);
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
