import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows, safeDiv } from "@/lib/analytics/sql";
import { getThresholds, type Thresholds } from "@/lib/analytics/settings";
import { RESULT_EXPR } from "./service";
import { lineState, type LineState, type ResultKey, type SampleVerdict } from "./states";

/** Optional date window (inclusive, YYYY-MM-DD) applied to when the sample was approved. */
export type DateRange = { start: string; end: string } | undefined;
export const rangeSql = (r: DateRange) => (r ? sql`and s.approved_at >= ${r.start}::date and s.approved_at < (${r.end}::date + 1)` : sql``);

// ───────────────────────── Creator content type ─────────────────────────

export type ContentType = "video" | "live" | "both";
export const CONTENT_TYPE_LABEL: Record<ContentType, string> = { video: "Video", live: "LIVE", both: "Video + LIVE" };

/** Video, LIVE or both – from what they actually posted/sold, falling back to how the team works with them. */
export function contentType(a: { videoGmv?: number; liveGmv?: number; videos?: number | null; lives?: number | null; approach?: string | null }): ContentType | null {
  const v = (a.videoGmv ?? 0) > 0 || (a.videos ?? 0) > 0;
  const l = (a.liveGmv ?? 0) > 0 || (a.lives ?? 0) > 0;
  if (v && l) return "both";
  if (v) return "video";
  if (l) return "live";
  return a.approach === "video" || a.approach === "live" || a.approach === "both" ? a.approach : null;
}

// ───────────────────────── Scorecard ─────────────────────────

export type ScoreRow = {
  username: string;
  phone: string | null;
  approach: string | null;
  doNotContact: boolean;
  samples: number;
  qty: number;
  delivered: number;
  judged: number;
  posted: number;
  notPosted: number;
  waiting: number;
  /** Samples with possible (uncertain) content that staff still need to confirm or reject. */
  review: number;
  postingRate: number | null;
  avgDaysToPost: number | null;
  contentGmv: number;
  contentOrders: number;
  oldestUnposted: string | null;
  firstDelivered: string | null;
  lastSample: string | null;
  products: string;
  /** Videos posted since the first sample was delivered (any product). */
  videosSince: number;
  newestVideo: string | null;
  /** Valid sales of the last 14 days of data, from all their videos and LIVEs. */
  recentGmv14: number;
  videos: number;
  lives: number;
  videoGmv: number;
  liveGmv: number;
  type: ContentType | null;
  verdict: SampleVerdict;
  advice: string;
  /** Rough RM at stake / to gain if the manager acts (conservative). */
  value: number;
};

const JUDGED = sql.raw(`('posted_video','did_live','not_posted')`);
const POSTED_SET = sql.raw(`('posted_video','did_live')`);

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const fmtDay = (d: string | null) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "recently";
const daysBetween = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type VerdictInput = Pick<
  ScoreRow,
  "posted" | "judged" | "notPosted" | "waiting" | "review" | "delivered" | "contentGmv" | "contentOrders" | "oldestUnposted" | "firstDelivered" | "videosSince" | "newestVideo" | "recentGmv14"
>;

export function verdictFor(r: VerdictInput, t: Thresholds, today: string): SampleVerdict {
  const stale = r.oldestUnposted != null && daysBetween(today, r.oldestUnposted) > t.samplePostDays * 2;
  if (r.posted === 0 && (r.judged >= 2 || (r.notPosted >= 1 && stale))) return "stop";
  if (r.notPosted >= 1) return "chase";
  if (r.review >= 1 && r.posted === 0) return "review";
  if (r.posted >= 1 && r.contentGmv >= t.sampleMoreMinGmv) {
    const weeks = Math.max(1, daysBetween(today, r.firstDelivered ?? today) / 7);
    return r.videosSince / weeks < t.targetVideosPerWeek ? "more_content" : "more";
  }
  const oldContent = r.newestVideo != null && daysBetween(today, r.newestVideo) >= t.oldContentDays && r.recentGmv14 >= t.minSellerGmv / 2;
  if (oldContent) return "refresh";
  if (r.posted >= 1 && r.contentOrders === 0) return "coach";
  if (r.waiting >= 1 || r.delivered === 0) return "wait";
  return "ok";
}

function adviceFor(r: ScoreRow, t: Thresholds, today: string): string {
  switch (r.verdict) {
    case "review":
      return `${plural(r.review, "sample")} may have content, but the match is uncertain – confirm or reject it.`;
    case "chase":
      return `${plural(r.notPosted, "sample")} delivered (oldest ${fmtDay(r.oldestUnposted)}) – nothing posted after ${t.samplePostDays} days.`;
    case "stop":
      return `${plural(r.judged, "sample")} past the posting deadline and nothing posted.`;
    case "coach":
      return `${plural(r.videosSince, "video")} posted since the sample, but no orders yet – check the video, add a voucher or a stronger hook.`;
    case "more_content": {
      const weeks = Math.max(1, daysBetween(today, r.firstDelivered ?? today) / 7);
      return `Sample content sold ${rm(r.contentGmv)} but they post only ${(r.videosSince / weeks).toFixed(1)} video/week – ask for more.`;
    }
    case "more":
      return `Posted for ${r.posted} of ${r.judged}; sample content sold ${rm(r.contentGmv)}. Reward with another product.`;
    case "refresh":
      return `Newest video is ${daysBetween(today, r.newestVideo!)} days old (${fmtDay(r.newestVideo)}) yet it sold ${rm(r.recentGmv14)} in the last 14 days – ask for a fresh video.`;
    case "wait":
      return `${plural(r.waiting, "sample")} on the way or inside the ${t.samplePostDays}-day posting window.`;
    default:
      return "";
  }
}

/** One row per creator who received samples (free-sample orders), with the next step for the manager. */
export async function getSampleScorecard(range?: DateRange): Promise<{ rows: ScoreRow[]; dataDate: string; perPosted: number }> {
  const t = await getThresholds();
  const [{ d }] = await rows<{ d: string }>(sql`
    select to_char(greatest(
      coalesce((select max(period_end) from uploads where kind in ('video_list','creator_transactions')), date '1970-01-01'),
      coalesce((select max(created_at)::date from order_lines), current_date)), 'YYYY-MM-DD') as d`);
  const data = await rows<{
    creator: string; phone: string | null; approach: string | null; dnc: boolean | null; samples: number; qty: number;
    delivered: number; judged: number; posted: number; not_posted: number; waiting: number; review: number; days: number | null;
    gmv: number; orders: number; oldest: string | null; first: string | null; last: string | null; products: string | null;
    videos_since: number | null; newest: string | null; recent: number | null;
    videos: number | null; lives: number | null; vgmv: number | null; lgmv: number | null;
  }>(sql`
    with s as (
      select s.*, ${RESULT_EXPR} as r from samples s
      where s.source = 'orders' and s.creator is not null ${rangeSql(range)}
    ),
    agg as (
      select creator,
        count(*)::int as samples, sum(quantity)::int as qty,
        (count(*) filter (where delivered_at is not null))::int as delivered,
        (count(*) filter (where r in ${JUDGED}))::int as judged,
        (count(*) filter (where r in ${POSTED_SET}))::int as posted,
        (count(*) filter (where r = 'not_posted'))::int as not_posted,
        (count(*) filter (where r in ('in_window', 'in_transit')))::int as waiting,
        (count(*) filter (where r = 'uncertain'))::int as review,
        (avg(extract(epoch from (posted_at - delivered_at)) / 86400) filter (where r in ${POSTED_SET} and posted_at is not null))::float8 as days,
        to_char(min(delivered_at) filter (where r = 'not_posted'), 'YYYY-MM-DD') as oldest,
        to_char(min(delivered_at), 'YYYY-MM-DD') as first,
        to_char(max(approved_at), 'YYYY-MM-DD') as last,
        string_agg(distinct coalesce(k.name, s.variation, s.seller_sku), ', ') as products
      from s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
      group by creator
    ),
    -- Every qualifying sale line is already credited to exactly one sample (sample_sales), so plain sums cannot double count.
    gm as (
      select creator, coalesce(sum(content_gmv), 0)::float8 as gmv, coalesce(sum(content_orders), 0)::int as orders
      from s group by creator
    ),
    first_d as (select creator, min(delivered_at) as d from s where delivered_at is not null group by creator),
    -- Videos with a KNOWN posting date on/after the first delivery (calendar-day rule for date-only exports; no one-day allowance).
    -- Videos seen only in orders have no posting date, so they are not counted as new here.
    vids as (
      select v.creator, count(distinct v.video_id)::int as n, to_char(max(v.posted_at), 'YYYY-MM-DD') as last
      from videos v join first_d f on f.creator = v.creator
        and (case when v.posted_at::time = time '00:00' then v.posted_at::date >= f.d::date else v.posted_at >= f.d end)
      group by v.creator
    ),
    lastv as (
      select v.creator, to_char(max(v.posted_at), 'YYYY-MM-DD') as newest
      from videos v where v.creator in (select creator from agg) group by v.creator
    ),
    recent as (
      select creator, coalesce(sum(pay) filter (where valid), 0)::float8 as gmv
      from ${AL}
      where created_at >= (${d}::date - 13) and created_at < (${d}::date + 1) and creator in (select creator from agg)
      group by creator
    ),
    snap as (select username, sum(videos)::int as videos, sum(live_streams)::int as lives from creator_txn_snapshots group by username),
    sold as (
      select creator,
        coalesce(sum(payment_amount) filter (where content_type = 'Video'), 0)::float8 as vgmv,
        coalesce(sum(payment_amount) filter (where content_type = 'Livestream'), 0)::float8 as lgmv
      from order_lines group by creator
    )
    select agg.*, gm.gmv, gm.orders, c.phone, c.approach, c.do_not_contact as dnc,
      vids.n as videos_since, greatest(lastv.newest, vids.last) as newest, recent.gmv as recent,
      snap.videos, snap.lives, sold.vgmv, sold.lgmv
    from agg
    left join gm on gm.creator = agg.creator
    left join creators c on c.username = agg.creator
    left join vids on vids.creator = agg.creator
    left join lastv on lastv.creator = agg.creator
    left join recent on recent.creator = agg.creator
    left join snap on snap.username = agg.creator
    left join sold on sold.creator = agg.creator`);

  const postedTotal = data.reduce((a, r) => a + r.posted, 0);
  const perPosted = safeDiv(data.reduce((a, r) => a + (r.posted ? r.gmv : 0), 0), postedTotal);

  const out = data.map((r): ScoreRow => {
    const row: ScoreRow = {
      username: r.creator,
      phone: r.phone,
      approach: r.approach,
      doNotContact: !!r.dnc,
      samples: r.samples,
      qty: r.qty,
      delivered: r.delivered,
      judged: r.judged,
      posted: r.posted,
      notPosted: r.not_posted,
      waiting: r.waiting,
      review: r.review,
      postingRate: r.judged ? r.posted / r.judged : null,
      avgDaysToPost: r.days,
      contentGmv: r.gmv,
      contentOrders: r.orders,
      oldestUnposted: r.oldest,
      firstDelivered: r.first,
      lastSample: r.last,
      products: r.products ?? "",
      videosSince: r.videos_since ?? 0,
      newestVideo: r.newest,
      recentGmv14: r.recent ?? 0,
      videos: r.videos ?? 0,
      lives: r.lives ?? 0,
      videoGmv: r.vgmv ?? 0,
      liveGmv: r.lgmv ?? 0,
      type: contentType({ videoGmv: r.vgmv ?? 0, liveGmv: r.lgmv ?? 0, videos: r.videos, lives: r.lives, approach: r.approach }),
      verdict: "ok",
      advice: "",
      value: 0,
    };
    row.verdict = verdictFor(row, t, d);
    row.advice = adviceFor(row, t, d);
    const weeks = Math.max(1, daysBetween(d, row.firstDelivered ?? d) / 7);
    switch (row.verdict) {
      case "chase": row.value = perPosted * row.notPosted * t.upliftHaircut; break;
      case "more_content": row.value = safeDiv(row.contentGmv, Math.max(1, row.videosSince)) * 2 * t.upliftHaircut; break;
      case "more": row.value = safeDiv(row.contentGmv, Math.max(1, row.posted)) * t.upliftHaircut; break;
      case "refresh": row.value = row.recentGmv14 * 2; break; // monthly sales that depend on the old videos
      default: row.value = 0;
    }
    void weeks;
    return row;
  });
  return { rows: out, dataDate: d, perPosted };
}

// ───────────────────────── Sample lines (tracker) ─────────────────────────

export type BundlePart = { sku: string; name: string; qty: number };

export type SampleVideo = { id: string; link: string | null; postedAt: string | null; views: number; gmv: number; orders: number; product: boolean };

export type SampleLine = {
  id: number;
  creator: string | null;
  buyerMasked: string | null;
  creatorMatch: string | null;
  sku: string | null;
  productId: string | null;
  name: string | null;
  variation: string | null;
  /** Contents of a bundle (SET) SKU, from the SKU lists. Empty for single items. */
  parts: BundlePart[];
  quantity: number;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  dueAt: string | null;
  postedAt: string | null;
  postLink: string | null;
  result: ResultKey;
  autoResult: ResultKey | null;
  overridden: boolean;
  state: LineState;
  videoCount: number;
  otherVideoCount: number;
  /** Every video posted since delivery (this product first), with its link, views and sales. */
  videos: SampleVideo[];
  /** Possible (uncertain) content staff still need to confirm or reject, and why the system is unsure. */
  candidates: { contentId: string; kind: string; link: string | null; postedAt: string | null; views: number; reason: string }[];
  /** "agreed" when the date comes from a creator's promise, otherwise the default window. */
  postBySource: string | null;
  contentViews: number;
  contentGmv: number;
  contentOrders: number;
  /** Sold after delivery from older or undated content (shown separately; never mixed into content sales). */
  observedGmv: number;
  observedOrders: number;
  ownerId: string | null;
  ownerName: string | null;
  followUpAt: string | null;
  note: string | null;
  orderSubstatus: string | null;
  trackingId: string | null;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null);
const day = (v: unknown) => (iso(v) ? iso(v)!.slice(0, 10) : null);
const addDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10);

async function queryLines(where: ReturnType<typeof sql>): Promise<SampleLine[]> {
  const t = await getThresholds();
  const list = await rows<Record<string, unknown>>(sql`
    select s.*, ${RESULT_EXPR} as r, k.name, u.name as owner_name,
      (select coalesce(jsonb_agg(jsonb_build_object('sku', b.component_sku, 'name', coalesce(ki.name, b.component_sku), 'qty', b.qty) order by b.component_sku), '[]'::jsonb)
         from sku_bom b left join sku_items ki on ki.sku = b.component_sku where upper(b.set_sku) = upper(s.seller_sku)) as parts
    from samples s
    left join sku_items k on upper(k.sku) = upper(s.seller_sku)
    left join users u on u.id = s.owner_id
    where s.source = 'orders' and ${where}
    order by s.approved_at desc nulls last, s.id desc`);
  const lines = list.map((r) => {
    const result = ((r.r as ResultKey) ?? "in_transit") as ResultKey;
    const delivered = day(r.delivered_at);
    return {
      id: r.id as number,
      creator: (r.creator as string) ?? null,
      buyerMasked: (r.buyer_masked as string) ?? null,
      creatorMatch: (r.creator_match as string) ?? null,
      sku: (r.seller_sku as string) ?? null,
      productId: (r.product_id as string) ?? null,
      name: (r.name as string) ?? null,
      variation: (r.variation as string) ?? null,
      parts: (r.parts as BundlePart[]) ?? [],
      quantity: r.quantity as number,
      approvedAt: day(r.approved_at),
      shippedAt: day(r.shipped_at),
      deliveredAt: delivered,
      dueAt: day(r.post_by) ?? (delivered ? addDays(delivered, t.samplePostDays) : null),
      postBySource: (r.post_by_source as string) ?? null,
      candidates: [],
      postedAt: day(r.posted_at),
      postLink: (r.post_link as string) ?? null,
      result,
      autoResult: (r.result as ResultKey) ?? null,
      overridden: r.result_override != null,
      state: lineState(result, Number(r.content_orders ?? 0)),
      videoCount: Number(r.video_count ?? 0),
      otherVideoCount: Number(r.other_video_count ?? 0),
      videos: [],
      contentViews: Number(r.content_views ?? 0),
      contentGmv: Number(r.content_gmv ?? 0),
      contentOrders: Number(r.content_orders ?? 0),
      observedGmv: Number(r.observed_gmv ?? 0),
      observedOrders: Number(r.observed_orders ?? 0),
      ownerId: (r.owner_id as string) ?? null,
      ownerName: (r.owner_name as string) ?? null,
      followUpAt: day(r.follow_up_at),
      note: (r.note as string) ?? null,
      orderSubstatus: (r.order_substatus as string) ?? null,
      trackingId: (r.tracking_id as string) ?? null,
    } as SampleLine;
  });
  await attachVideos(lines);
  await attachCandidates(lines);
  return lines;
}

/** Uncertain evidence per sample that staff have not rejected. */
async function attachCandidates(lines: SampleLine[]): Promise<void> {
  const ids = lines.filter((l) => l.result === "uncertain").map((l) => l.id);
  if (!ids.length) return;
  const found = await rows<{ sid: number; cid: string; kind: string; link: string | null; at: string | null; views: number; reason: string }>(sql`
    select sc.sample_id as sid, sc.content_id as cid, sc.kind, sc.link, to_char(sc.posted_at, 'YYYY-MM-DD') as at, sc.views, sc.reason
    from sample_content sc
    where sc.confidence = 'uncertain' and sc.sample_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      and coalesce((select d.decision from content_decisions d where d.reverted_at is null and d.sample_id = sc.sample_id
        and d.content_id = sc.content_id order by d.at desc, d.id desc limit 1), '') <> 'rejected'
    order by sc.posted_at desc nulls last`);
  const by = new Map(lines.map((l) => [l.id, l]));
  for (const f of found) by.get(f.sid)?.candidates.push({ contentId: f.cid, kind: f.kind, link: f.link, postedAt: f.at, views: f.views, reason: f.reason });
}

/** Adds the list of videos posted since delivery (with link, views and sales) to every delivered sample line. */
async function attachVideos(lines: SampleLine[]): Promise<void> {
  const ids = lines.filter((l) => l.creator && l.deliveredAt).map((l) => l.id);
  if (!ids.length) return;
  const idList = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const vids = await rows<{ sid: number; vid: string; link: string | null; posted: string | null; views: number; prod: boolean }>(sql`
    with sp as (
      select s.id, s.creator, s.delivered_at,
        coalesce(
          (select o.product_id from order_lines o where s.sku_id is not null and o.sku_id = s.sku_id limit 1),
          (select o.product_id from order_lines o where s.seller_sku is not null and upper(o.seller_sku) = upper(s.seller_sku) limit 1),
          (select p.product_id from products p where s.product_name is not null and p.name = s.product_name limit 1)
        ) as pid
      from samples s where s.id in (${idList}) and s.creator is not null and s.delivered_at is not null
    )
    select sp.id as sid, v.video_id as vid, v.link, to_char(v.posted_at, 'YYYY-MM-DD') as posted,
      coalesce((select max(s2.views) from video_snapshots s2 where s2.video_id = v.video_id), 0)::int as views,
      coalesce(sp.pid = any(v.product_ids), false) as prod
    from sp join videos v on v.creator = sp.creator
      and (case when v.posted_at::time = time '00:00' then v.posted_at::date >= sp.delivered_at::date else v.posted_at >= sp.delivered_at end)
    order by posted`);
  if (!vids.length) return;
  const sales = await rows<{ content_id: string; gmv: number; n: number }>(sql`
    select content_id, coalesce(sum(pay) filter (where valid), 0)::float8 as gmv, (count(distinct order_id) filter (where valid))::int as n
    from ${AL}
    where content_id in (${sql.join([...new Set(vids.map((v) => v.vid))].map((i) => sql`${i}`), sql`, `)})
    group by content_id`);
  const sale = new Map(sales.map((x) => [x.content_id, x]));
  const by = new Map<number, SampleVideo[]>();
  for (const v of vids) {
    const x = sale.get(v.vid);
    by.set(v.sid, [...(by.get(v.sid) ?? []), { id: v.vid, link: v.link, postedAt: v.posted, views: v.views, gmv: x?.gmv ?? 0, orders: x?.n ?? 0, product: v.prod }]);
  }
  for (const l of lines) {
    const list = by.get(l.id);
    // this product first, then by date
    if (list) l.videos = [...list].sort((a, b) => Number(b.product) - Number(a.product) || (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
  }
}

/** Sample lines of the given creators, grouped by creator. */
export async function getSampleLines(creators: string[], range?: DateRange): Promise<Map<string, SampleLine[]>> {
  const out = new Map<string, SampleLine[]>();
  if (!creators.length) return out;
  const lines = await queryLines(sql`s.creator in (${sql.join(creators.map((c) => sql`${c}`), sql`, `)}) ${rangeSql(range)}`);
  for (const l of lines) out.set(l.creator!, [...(out.get(l.creator!) ?? []), l]);
  return out;
}

/** Samples whose receiver couldn't be matched to a creator yet, grouped by the masked name TikTok shows. */
export async function getUnknownLines(range?: DateRange): Promise<{ buyer: string; lines: SampleLine[] }[]> {
  const lines = await queryLines(sql`s.creator is null ${rangeSql(range)}`);
  const by = new Map<string, SampleLine[]>();
  for (const l of lines) by.set(l.buyerMasked ?? "?", [...(by.get(l.buyerMasked ?? "?") ?? []), l]);
  return [...by].map(([buyer, ls]) => ({ buyer, lines: ls }));
}

/** Creators with at least one sample that matches the search, owner or follow-up filter. */
export async function getCreatorsMatching(f: { q?: string; owner?: string | null; due?: boolean }, range?: DateRange): Promise<Set<string> | null> {
  if (!f.q && !f.owner && !f.due) return null;
  const conds = [sql`s.source = 'orders' and s.creator is not null`];
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    conds.push(sql`(lower(s.creator) like ${like} or coalesce(c.phone, '') like ${like} or lower(coalesce(s.seller_sku, '')) like ${like}
      or lower(coalesce(k.name, '')) like ${like} or lower(coalesce(s.variation, '')) like ${like})`);
  }
  if (f.owner) conds.push(sql`s.owner_id = ${f.owner}`);
  if (f.due) conds.push(sql`s.follow_up_at <= current_date`);
  const r = await rows<{ creator: string }>(sql`
    select distinct s.creator from samples s
    left join creators c on c.username = s.creator
    left join sku_items k on upper(k.sku) = upper(s.seller_sku)
    where ${sql.join(conds, sql` and `)} ${rangeSql(range)}`);
  return new Set(r.map((x) => x.creator));
}

/** Count of samples by line state – used by the KPI strip. */
export async function getSampleTotals(range?: DateRange): Promise<{ sent: number; qty: number; delivered: number; chase: number; noSales: number; selling: number; gmv: number; unknown: number }> {
  const [r] = await rows<{ sent: number; qty: number; delivered: number; chase: number; nosales: number; selling: number; gmv: number; unknown: number }>(sql`
    with s as (select s.*, ${RESULT_EXPR} as r from samples s where s.source = 'orders' ${rangeSql(range)})
    select count(*)::int as sent, coalesce(sum(quantity), 0)::int as qty,
      (count(*) filter (where delivered_at is not null))::int as delivered,
      (count(*) filter (where r = 'not_posted'))::int as chase,
      (count(*) filter (where r in ('posted_video','did_live') and content_orders = 0))::int as nosales,
      (count(*) filter (where r in ('posted_video','did_live') and content_orders > 0))::int as selling,
      coalesce(sum(content_gmv), 0)::float8 as gmv,
      (count(*) filter (where creator is null))::int as unknown
    from s`);
  return { sent: r.sent, qty: r.qty, delivered: r.delivered, chase: r.chase, noSales: r.nosales, selling: r.selling, gmv: r.gmv, unknown: r.unknown };
}

// ───────────────────────── Product view ─────────────────────────

export type SampleProductRow = {
  sku: string;
  name: string;
  family: string | null;
  isSet: boolean;
  contents: string | null;
  samples: number;
  qty: number;
  creators: number;
  judged: number;
  posted: number;
  postingRate: number | null;
  avgDaysToPost: number | null;
  contentGmv: number;
  contentOrders: number;
  gmvPerSample: number;
};

/** Sampled SKUs: how many went out, how many turned into content, and the sales that followed. */
export async function getSampleProducts(range?: DateRange): Promise<SampleProductRow[]> {
  const data = await rows<{
    sku: string; name: string | null; family: string | null; is_set: boolean | null; contents: string | null; samples: number;
    qty: number; creators: number; judged: number; posted: number; days: number | null; gmv: number; orders: number;
  }>(sql`
    with s as (
      select s.*, ${RESULT_EXPR} as r, coalesce(s.seller_sku, 'Unknown') as key
      from samples s where s.source = 'orders' ${rangeSql(range)}
    )
    select s.key as sku, max(coalesce(k.name, s.variation)) as name, max(k.family) as family, bool_or(k.is_set) as is_set,
      (select string_agg(b.qty || '× ' || coalesce(ki.name, b.component_sku), ', ' order by b.component_sku)
         from sku_bom b left join sku_items ki on ki.sku = b.component_sku where upper(b.set_sku) = upper(s.key)) as contents,
      count(*)::int as samples, sum(s.quantity)::int as qty, count(distinct s.creator)::int as creators,
      (count(*) filter (where s.r in ${JUDGED}))::int as judged,
      (count(*) filter (where s.r in ${POSTED_SET}))::int as posted,
      (avg(extract(epoch from (s.posted_at - s.delivered_at)) / 86400) filter (where s.r in ${POSTED_SET} and s.posted_at is not null))::float8 as days,
      coalesce(sum(s.content_gmv), 0)::float8 as gmv, coalesce(sum(s.content_orders), 0)::int as orders
    from s left join sku_items k on upper(k.sku) = upper(s.key)
    group by s.key
    order by samples desc`);
  return data.map((r) => ({
    sku: r.sku,
    name: r.name ?? r.sku,
    family: r.family,
    isSet: !!r.is_set,
    contents: r.contents,
    samples: r.samples,
    qty: r.qty,
    creators: r.creators,
    judged: r.judged,
    posted: r.posted,
    postingRate: r.judged ? r.posted / r.judged : null,
    avgDaysToPost: r.days,
    contentGmv: r.gmv,
    contentOrders: r.orders,
    gmvPerSample: safeDiv(r.gmv, r.samples),
  }));
}

/** Single items sent, with bundles broken down into their contents (needs the SKU list). */
export async function getSampleItems(range?: DateRange): Promise<{ sku: string; name: string; qty: number; creators: number }[]> {
  return rows(sql`
    with s as (select s.* from samples s where s.source = 'orders' and coalesce(s.order_status, '') <> 'Canceled' ${rangeSql(range)}),
    items as (
      select coalesce(b.component_sku, s.seller_sku, 'Unknown') as sku, s.quantity * coalesce(b.qty, 1) as qty, s.creator
      from s left join sku_bom b on upper(b.set_sku) = upper(s.seller_sku)
    )
    select i.sku, coalesce(max(k.name), i.sku) as name, sum(i.qty)::int as qty, count(distinct i.creator)::int as creators
    from items i left join sku_items k on upper(k.sku) = upper(i.sku)
    group by i.sku order by qty desc`);
}

/** Samples of one creator (profile page). */
export async function getCreatorSamples(username: string) {
  return rows<{
    id: number; sku: string | null; name: string | null; variation: string | null;
    approved: string | null; delivered: string | null; posted: string | null; post_link: string | null; r: ResultKey; gmv: number; orders: number;
  }>(sql`
    select s.id, s.seller_sku as sku, k.name, s.variation,
      to_char(s.approved_at, 'YYYY-MM-DD') as approved, to_char(s.delivered_at, 'YYYY-MM-DD') as delivered,
      to_char(s.posted_at, 'YYYY-MM-DD') as posted, s.post_link, ${RESULT_EXPR} as r, s.content_gmv::float8 as gmv, s.content_orders as orders
    from samples s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
    where s.creator = ${username} and s.source = 'orders'
    order by coalesce(s.approved_at, s.created_at) desc
    limit 50`);
}
