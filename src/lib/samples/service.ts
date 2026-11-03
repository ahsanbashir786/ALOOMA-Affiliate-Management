import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getThresholds } from "@/lib/analytics/settings";
import { AL, rows } from "@/lib/analytics/sql";
import { spCte } from "./pid";
import { refreshContent } from "@/lib/workflow/content";
import { refreshCommitments } from "@/lib/workflow/commitments";

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
 * "Posted on or after delivery". Date-only exports (time 00:00) are compared by calendar day – a video dated the same day as
 * delivery cannot be proven earlier, but one dated the day before is genuinely earlier (no one-day allowance).
 * Exports with a real time are compared to the minute.
 */
const postedAfterDelivery = (posted: string, delivered: string) =>
  sql.raw(`(case when ${posted}::time = time '00:00' then ${posted}::date >= ${delivered}::date else ${posted} >= ${delivered} end)`);

/**
 * Content the system finds for each sample, and how sure it is.
 *  - confirmed: same creator, a video that lists (or has sold) the sampled product with a KNOWN posting date on/after delivery,
 *    or a LIVE that sold the sampled product after delivery (a LIVE is dated by its sales: it was on air when the order was placed).
 *  - uncertain: plausible but unproven – a video whose posting date is unknown (seen only in orders), a video with no product
 *    listed, a LIVE that sold other products, or TikTok's creator-level "content with samples" flag. These go to the review
 *    queue and never complete a sample by themselves.
 * Content that sold before delivery is genuinely older and is ignored. Staff decisions are applied afterwards and never rebuilt.
 */
async function buildSampleEvidence(ids?: number[]): Promise<void> {
  await db.execute(sql`delete from sample_content where sample_id in (select id from samples s where s.source = 'orders' ${ids ? sql`and s.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``})`);
  await db.execute(sql`
    with ${spCte(ids)},
    ev as (
      -- confirmed: dated video of the sampled product, posted on/after delivery
      select sp.id as sample_id, ci.content_id, 'video' as kind, ci.link, ci.posted_at, ci.views,
        'confirmed' as confidence, 'Video lists the sampled product and was posted on or after delivery' as reason
      from sp join content_items ci on ci.creator = sp.creator and ci.kind = 'video' and ci.posted_at is not null
        and sp.pid = any(ci.product_ids) and ${postedAfterDelivery("ci.posted_at", "sp.delivered_at")}
      where sp.delivered_at is not null and sp.pid is not null
      union all
      -- uncertain: sells the sampled product, but when it was posted is unknown (not in Video analysis). Skipped if it sold before delivery.
      select sp.id, ci.content_id, 'video', ci.link, null, ci.views,
        'uncertain', 'Selling the sampled product, but its posting date is unknown (it is not in Video analysis) – it may be older than the sample'
      from sp join content_items ci on ci.creator = sp.creator and ci.kind = 'video' and ci.posted_at is null and ci.source = 'orders'
        and sp.pid = any(ci.product_ids) and ci.first_observed_on >= sp.delivered_at::date
      where sp.delivered_at is not null and sp.pid is not null
      union all
      -- confirmed LIVE: it sold the sampled product after delivery
      select sp.id, ci.content_id, 'live', null, null, 0,
        'confirmed', 'A LIVE sold the sampled product after delivery'
      from sp join content_items ci on ci.creator = sp.creator and ci.kind = 'live' and sp.pid = any(ci.product_ids)
      where sp.delivered_at is not null and sp.pid is not null
        and exists (select 1 from order_lines o where o.content_id is not distinct from (case when ci.content_id like 'live:%' then null else ci.content_id end)
          and o.creator = ci.creator and o.content_type = 'Livestream' and o.product_id = sp.pid and o.created_at >= sp.delivered_at)
      union all
      -- uncertain: dated video, but it lists no product at all
      select sp.id, ci.content_id, 'video', ci.link, ci.posted_at, ci.views,
        'uncertain', 'A video posted after delivery has no product listed – it may or may not be the sample'
      from sp join content_items ci on ci.creator = sp.creator and ci.kind = 'video' and ci.posted_at is not null
        and coalesce(cardinality(ci.product_ids), 0) = 0 and ${postedAfterDelivery("ci.posted_at", "sp.delivered_at")}
      where sp.delivered_at is not null
      union all
      select sp.id, ci.content_id, 'live', null, null, 0,
        'uncertain', 'A LIVE sold other products after delivery – not proven to be about the sample'
      from sp join content_items ci on ci.creator = sp.creator and ci.kind = 'live'
      where sp.delivered_at is not null and (sp.pid is null or not (sp.pid = any(ci.product_ids)))
        and exists (select 1 from order_lines o where o.creator = ci.creator and o.content_type = 'Livestream' and o.created_at >= sp.delivered_at
          and o.content_id is not distinct from (case when ci.content_id like 'live:%' then null else ci.content_id end))
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
 * THE sales attribution rule – the only place sample sales are calculated. Every other screen and export reads sample_sales.
 *  • A sale line (order + SKU) is credited to at most ONE sample: the creator's most recent sample of that product delivered
 *    before the content was posted (or before the order, for LIVEs and undated content). Repeated samples never multiply sales.
 *  • Only the same product counts. If a sample's product cannot be established, nothing is credited to it.
 *  • basis "content": the sale came from a LIVE after delivery, from a video with a known posting date on/after delivery, or from
 *    content staff verified for that sample.  basis "observed": sold after delivery from older or undated content – shown separately.
 */
async function attributeSales(ids?: number[]): Promise<void> {
  await db.execute(sql`delete from sample_sales where sample_id in (select id from samples s where s.source = 'orders' ${ids ? sql`and s.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``})`);
  await db.execute(sql`
    with ${spCte(ids)},
    cand as (
      select al.order_id, al.sku_id, sp.id as sample_id, sp.creator, sp.pid, sp.delivered_at, al.content_id, al.pay,
        (al.content_type = 'Livestream'
          or (ci.posted_at is not null and ${postedAfterDelivery("ci.posted_at", "sp.delivered_at")})
          or exists (select 1 from content_decisions d where d.decision = 'verified' and d.reverted_at is null
               and d.content_id = al.content_id and d.username = sp.creator and (d.sample_id = sp.id or d.sample_id is null))) as is_content
      from sp
      join ${AL} on al.creator = sp.creator and al.product_id = sp.pid and al.created_at >= sp.delivered_at and al.valid
      left join content_items ci on ci.content_id = al.content_id
      where sp.delivered_at is not null and sp.pid is not null 
    )
    insert into sample_sales (order_id, sku_id, sample_id, creator, product_id, content_id, basis, pay)
    select distinct on (order_id, sku_id) order_id, sku_id, sample_id, creator, pid, content_id,
      case when is_content then 'content' else 'observed' end, pay
    from cand
    order by order_id, sku_id, is_content desc, delivered_at desc, sample_id desc
    on conflict (order_id, sku_id) do nothing`);
}

/**
 * Sets every sample's result from the evidence, the staff decisions and the deadline.
 * Result: confirmed content → posted (video / LIVE); else uncertain evidence → "needs review";
 * else waiting until the post-by date (the earliest OUTSTANDING promised deadline for the sample replaces delivery + default days),
 * then "not posted". Sales figures are read from sample_sales.
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
      -- the earliest CURRENT deadline among commitments for this sample that are still outstanding (same state the queue uses)
      select x.id as sample_id, min(cs.due_on) as d
      from sp x
      join commitments c on x.id = any(c.sample_ids)
      join staff_events e on e.id = c.event_id and e.reverted_at is null
      join commitment_status cs on cs.commitment_id = c.id and cs.state <> 'fulfilled'
      group by x.id
    ),
    gmv as (
      select sample_id,
        coalesce(sum(pay) filter (where basis = 'content'), 0)::float8 as cg,
        (count(distinct order_id) filter (where basis = 'content'))::int as co,
        coalesce(sum(pay) filter (where basis = 'observed'), 0)::float8 as og,
        (count(distinct order_id) filter (where basis = 'observed'))::int as oo
      from sample_sales group by sample_id
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
      content_gmv = coalesce(gmv.cg, 0),
      content_orders = coalesce(gmv.co, 0),
      observed_gmv = coalesce(gmv.og, 0),
      observed_orders = coalesce(gmv.oo, 0),
      checked_at = now()
    from sp
    cross join ref
    left join cnf on cnf.sample_id = sp.id
    left join unc on unc.sample_id = sp.id
    left join ver on ver.sample_id = sp.id
    left join agreed on agreed.sample_id = sp.id
    left join gmv on gmv.sample_id = sp.id
    where s.id = sp.id`);
}

/**
 * Matches creators and re-runs the content layer, commitments, posting check and sales attribution
 * (all samples, or only the given ones plus the other samples of the same creators, because attribution is per creator + product).
 * Safe to run any time; staff actions and decisions are never touched.
 */
export async function refreshSamples(opts: { sampleIds?: number[] } = {}): Promise<{ matched: number }> {
  // Earlier versions also kept hand-logged and staff-sheet samples; samples now come from orders only.
  await db.execute(sql`delete from samples where source <> 'orders'`);
  const t = await getThresholds();
  const matched = opts.sampleIds ? 0 : await matchSampleCreators();
  let ids = opts.sampleIds;
  if (ids?.length) {
    const wider = await rows<{ id: number }>(sql`select id from samples where source = 'orders' and creator in (select creator from samples where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) and creator is not null)`);
    ids = [...new Set([...ids, ...wider.map((w) => w.id)])];
  }
  await refreshContent();
  await refreshCommitments();
  await buildSampleEvidence(ids);
  await attributeSales(ids);
  await computeSampleResults(t.samplePostDays, ids);
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
