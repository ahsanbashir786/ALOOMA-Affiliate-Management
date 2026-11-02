import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { rows, safeDiv } from "@/lib/analytics/sql";
import { getThresholds, type Thresholds } from "@/lib/analytics/settings";
import { RESULT_EXPR, type ResultKey } from "./service";

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

export type SampleVerdict = "more" | "stop" | "chase" | "wait" | "ok";
export const VERDICTS: Record<SampleVerdict, { label: string; tone: "good" | "critical" | "serious" | "warn" | "neutral" }> = {
  more: { label: "Send more samples", tone: "good" },
  stop: { label: "Stop samples", tone: "critical" },
  chase: { label: "Chase to post", tone: "serious" },
  wait: { label: "Waiting", tone: "warn" },
  ok: { label: "OK", tone: "neutral" },
};

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
  postingRate: number | null;
  avgDaysToPost: number | null;
  contentGmv: number;
  contentOrders: number;
  oldestUnposted: string | null;
  lastSample: string | null;
  products: string;
  history: number;
  videos: number;
  lives: number;
  videoGmv: number;
  liveGmv: number;
  type: ContentType | null;
  verdict: SampleVerdict;
};

const JUDGED = sql.raw(`('posted_video','did_live','posted_other','not_posted')`);
const POSTED_SET = sql.raw(`('posted_video','did_live','posted_other')`);

export function verdictFor(r: Pick<ScoreRow, "posted" | "judged" | "notPosted" | "waiting" | "delivered" | "contentGmv" | "oldestUnposted">, t: Thresholds, today: string): SampleVerdict {
  const stale =
    r.oldestUnposted != null &&
    (Date.parse(today) - Date.parse(r.oldestUnposted)) / 86_400_000 > t.samplePostDays * 2;
  if (r.posted === 0 && (r.judged >= 2 || (r.notPosted >= 1 && stale))) return "stop";
  if (r.posted >= 1 && r.notPosted === 0 && r.contentGmv >= t.sampleMoreMinGmv) return "more";
  if (r.notPosted >= 1) return "chase";
  if (r.waiting >= 1 || r.delivered === 0) return "wait";
  return "ok";
}

/** One row per creator who received samples (TikTok sample orders and hand-logged samples). */
export async function getSampleScorecard(): Promise<{ rows: ScoreRow[]; dataDate: string }> {
  const t = await getThresholds();
  const [{ d }] = await rows<{ d: string }>(sql`
    select to_char(greatest(
      coalesce((select max(period_end) from uploads where kind in ('video_list','creator_transactions')), date '1970-01-01'),
      coalesce((select max(created_at)::date from order_lines), current_date)), 'YYYY-MM-DD') as d`);
  const data = await rows<{
    creator: string; phone: string | null; approach: string | null; dnc: boolean | null; samples: number; qty: number;
    delivered: number; judged: number; posted: number; not_posted: number; waiting: number; days: number | null;
    gmv: number; orders: number; oldest: string | null; last: string | null; products: string | null; history: number;
    videos: number | null; lives: number | null; vgmv: number | null; lgmv: number | null;
  }>(sql`
    with s as (
      select s.*, ${RESULT_EXPR} as r from samples s
      where s.source in ('orders', 'manual') and s.creator is not null
    ),
    agg as (
      select creator,
        count(*)::int as samples, sum(quantity)::int as qty,
        (count(*) filter (where delivered_at is not null))::int as delivered,
        (count(*) filter (where r in ${JUDGED}))::int as judged,
        (count(*) filter (where r in ${POSTED_SET}))::int as posted,
        (count(*) filter (where r = 'not_posted'))::int as not_posted,
        (count(*) filter (where r in ('in_window', 'in_transit', 'requested')))::int as waiting,
        (avg(extract(epoch from (posted_at - delivered_at)) / 86400) filter (where r in ${POSTED_SET} and posted_at is not null))::float8 as days,
        coalesce(sum(content_gmv), 0)::float8 as gmv, coalesce(sum(content_orders), 0)::int as orders,
        to_char(min(delivered_at) filter (where r = 'not_posted'), 'YYYY-MM-DD') as oldest,
        to_char(max(coalesce(approved_at, requested_at::timestamp)), 'YYYY-MM-DD') as last,
        string_agg(distinct coalesce(k.name, s.variation, s.seller_sku, s.raw_code), ', ') as products
      from s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
      group by creator
    ),
    hist as (select creator, count(*)::int as n from samples where source = 'staff_sheet' group by creator),
    snap as (select username, sum(videos)::int as videos, sum(live_streams)::int as lives from creator_txn_snapshots group by username),
    sold as (
      select creator,
        coalesce(sum(payment_amount) filter (where content_type = 'Video'), 0)::float8 as vgmv,
        coalesce(sum(payment_amount) filter (where content_type = 'Livestream'), 0)::float8 as lgmv
      from order_lines group by creator
    )
    select agg.*, c.phone, c.approach, c.do_not_contact as dnc, coalesce(hist.n, 0)::int as history,
      snap.videos, snap.lives, sold.vgmv, sold.lgmv
    from agg
    left join creators c on c.username = agg.creator
    left join hist on hist.creator = agg.creator
    left join snap on snap.username = agg.creator
    left join sold on sold.creator = agg.creator`);

  const out = data.map((r): ScoreRow => {
    const row = {
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
      postingRate: r.judged ? r.posted / r.judged : null,
      avgDaysToPost: r.days,
      contentGmv: r.gmv,
      contentOrders: r.orders,
      oldestUnposted: r.oldest,
      lastSample: r.last,
      products: r.products ?? "",
      history: r.history,
      videos: r.videos ?? 0,
      lives: r.lives ?? 0,
      videoGmv: r.vgmv ?? 0,
      liveGmv: r.lgmv ?? 0,
      type: contentType({ videoGmv: r.vgmv ?? 0, liveGmv: r.lgmv ?? 0, videos: r.videos, lives: r.lives, approach: r.approach }),
      verdict: "ok" as SampleVerdict,
    };
    row.verdict = verdictFor(row, t, d);
    return row;
  });
  return { rows: out, dataDate: d };
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
export async function getSampleProducts(): Promise<SampleProductRow[]> {
  const data = await rows<{
    sku: string; name: string | null; family: string | null; is_set: boolean | null; contents: string | null; samples: number;
    qty: number; creators: number; judged: number; posted: number; days: number | null; gmv: number; orders: number;
  }>(sql`
    with s as (
      select s.*, ${RESULT_EXPR} as r, coalesce(s.seller_sku, s.raw_code, 'Unknown') as key
      from samples s where s.source in ('orders', 'manual')
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
export async function getSampleItems(): Promise<{ sku: string; name: string; qty: number; creators: number }[]> {
  return rows(sql`
    with s as (select * from samples where source in ('orders', 'manual') and coalesce(order_status, '') <> 'Canceled'),
    items as (
      select coalesce(b.component_sku, s.seller_sku, s.raw_code, 'Unknown') as sku, s.quantity * coalesce(b.qty, 1) as qty, s.creator
      from s left join sku_bom b on upper(b.set_sku) = upper(s.seller_sku)
    )
    select i.sku, coalesce(max(k.name), i.sku) as name, sum(i.qty)::int as qty, count(distinct i.creator)::int as creators
    from items i left join sku_items k on upper(k.sku) = upper(i.sku)
    group by i.sku order by qty desc`);
}

// ───────────────────────── Tracker ─────────────────────────

export const STAGES = [
  { key: "open", label: "To work", where: `r in ('not_posted','in_window','in_transit','requested','no_creator')` },
  { key: "not_posted", label: "Not posted – chase", where: `r = 'not_posted'` },
  { key: "in_window", label: "Waiting to post", where: `r = 'in_window'` },
  { key: "in_transit", label: "Requested / on the way", where: `r in ('in_transit','requested')` },
  { key: "posted", label: "Posted", where: `r in ('posted_video','did_live','posted_other')` },
  { key: "no_creator", label: "Creator unknown", where: `r = 'no_creator'` },
  { key: "cancelled", label: "Cancelled", where: `r = 'cancelled'` },
  { key: "history", label: "Staff sheet history", where: `r = 'history'` },
  { key: "all", label: "All", where: `true` },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export type TrackerRow = {
  id: number;
  source: string;
  creator: string | null;
  buyerMasked: string | null;
  creatorMatch: string | null;
  phone: string | null;
  sku: string | null;
  rawCode: string | null;
  name: string | null;
  variation: string | null;
  contents: string | null;
  quantity: number;
  requestedAt: string | null;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  dueAt: string | null;
  postedAt: string | null;
  postLink: string | null;
  result: ResultKey;
  autoResult: ResultKey | null;
  overridden: boolean;
  contentGmv: number;
  contentOrders: number;
  ownerId: string | null;
  ownerName: string | null;
  followUpAt: string | null;
  note: string | null;
  orderSubstatus: string | null;
  trackingId: string | null;
};

export type TrackerFilter = {
  stage: StageKey;
  q?: string;
  owner?: string | null;
  due?: boolean;
  page: number;
  pageSize: number;
};

export async function getSampleTracker(f: TrackerFilter): Promise<{ rows: TrackerRow[]; total: number; counts: Record<StageKey, number> }> {
  const t = await getThresholds();
  const stage = STAGES.find((s) => s.key === f.stage) ?? STAGES[0];
  const conds: SQL[] = [sql.raw(stage.where)];
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    conds.push(sql`(lower(coalesce(creator, '')) like ${like} or lower(coalesce(buyer_masked, '')) like ${like}
      or lower(coalesce(seller_sku, '')) like ${like} or lower(coalesce(raw_code, '')) like ${like}
      or lower(coalesce(name, '')) like ${like} or lower(coalesce(variation, '')) like ${like} or coalesce(phone, '') like ${like})`);
  }
  if (f.owner) conds.push(sql`owner_id = ${f.owner}`);
  if (f.due) conds.push(sql`follow_up_at <= current_date`);
  const where = sql.join(conds, sql` and `);
  const base = sql`
    select s.*, ${RESULT_EXPR} as r, c.phone, k.name,
      (select string_agg(b.qty || '× ' || coalesce(ki.name, b.component_sku), ', ' order by b.component_sku)
         from sku_bom b left join sku_items ki on ki.sku = b.component_sku where upper(b.set_sku) = upper(s.seller_sku)) as contents,
      u.name as owner_name
    from samples s
    left join creators c on c.username = s.creator
    left join sku_items k on upper(k.sku) = upper(s.seller_sku)
    left join users u on u.id = s.owner_id`;

  const [list, [{ n }], countRows] = await Promise.all([
    rows<Record<string, unknown>>(sql`
      select * from (${base}) x where ${where}
      order by (r = 'not_posted') desc, follow_up_at asc nulls last, delivered_at asc nulls last, approved_at desc nulls last, id desc
      limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`),
    rows<{ n: number }>(sql`select count(*)::int as n from (${base}) x where ${where}`),
    rows<Record<string, number>>(sql`
      select ${sql.join(STAGES.map((s) => sql`(count(*) filter (where ${sql.raw(s.where)}))::int as ${sql.identifier(s.key)}`), sql`, `)}
      from (select ${RESULT_EXPR} as r from samples s) x`),
  ]);

  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null);
  const day = (v: unknown) => (iso(v) ? iso(v)!.slice(0, 10) : null);
  const addDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10);

  return {
    rows: list.map((r) => ({
      id: r.id as number,
      source: r.source as string,
      creator: (r.creator as string) ?? null,
      buyerMasked: (r.buyer_masked as string) ?? null,
      creatorMatch: (r.creator_match as string) ?? null,
      phone: (r.phone as string) ?? null,
      sku: (r.seller_sku as string) ?? null,
      rawCode: (r.raw_code as string) ?? null,
      name: (r.name as string) ?? null,
      variation: (r.variation as string) ?? null,
      contents: (r.contents as string) ?? null,
      quantity: r.quantity as number,
      requestedAt: day(r.requested_at),
      approvedAt: day(r.approved_at),
      shippedAt: day(r.shipped_at),
      deliveredAt: day(r.delivered_at),
      dueAt: day(r.delivered_at) ? addDays(day(r.delivered_at)!, t.samplePostDays) : null,
      postedAt: day(r.posted_at),
      postLink: (r.post_link as string) ?? null,
      result: (r.r as ResultKey) ?? "in_transit",
      autoResult: (r.result as ResultKey) ?? null,
      overridden: r.result_override != null,
      contentGmv: Number(r.content_gmv ?? 0),
      contentOrders: Number(r.content_orders ?? 0),
      ownerId: (r.owner_id as string) ?? null,
      ownerName: (r.owner_name as string) ?? null,
      followUpAt: day(r.follow_up_at),
      note: (r.note as string) ?? null,
      orderSubstatus: (r.order_substatus as string) ?? null,
      trackingId: (r.tracking_id as string) ?? null,
    })),
    total: n,
    counts: countRows[0] as Record<StageKey, number>,
  };
}

/** Samples of one creator (profile page). */
export async function getCreatorSamples(username: string) {
  return rows<{
    id: number; source: string; sku: string | null; raw_code: string | null; name: string | null; variation: string | null;
    approved: string | null; delivered: string | null; posted: string | null; post_link: string | null; r: ResultKey; gmv: number;
  }>(sql`
    select s.id, s.source, s.seller_sku as sku, s.raw_code, k.name, s.variation,
      to_char(s.approved_at, 'YYYY-MM-DD') as approved, to_char(s.delivered_at, 'YYYY-MM-DD') as delivered,
      to_char(s.posted_at, 'YYYY-MM-DD') as posted, s.post_link, ${RESULT_EXPR} as r, s.content_gmv::float8 as gmv
    from samples s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
    where s.creator = ${username}
    order by s.source = 'staff_sheet', coalesce(s.approved_at, s.created_at) desc
    limit 50`);
}

export async function getStaffVideos(username: string) {
  return rows<{ sample_code: string | null; url: string | null; ad_code: string | null; status: string | null }>(sql`
    select sample_code, url, ad_code, status from staff_videos where username = ${username} order by id limit 30`);
}
