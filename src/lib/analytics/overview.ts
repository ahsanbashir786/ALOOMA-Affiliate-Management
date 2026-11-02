import "server-only";
import { sql } from "drizzle-orm";
import type { Period } from "@/lib/period-core";
import { getOwnAccounts } from "./settings";
import { AL, between, inPeriod, rows, safeDiv, textArr } from "./sql";

export type Kpis = {
  gmv: number; // valid affiliate GMV
  gross: number;
  orders: number;
  items: number;
  aov: number;
  creators: number;
  commission: number;
  commissionRate: number;
  cancelRate: number; // share of gross GMV lost to cancellations
  returnRate: number;
  codShare: number;
};

export async function kpisFor(start: string, end: string, own: string[]): Promise<Kpis> {
  const [r] = await rows<{
    gmv: number; gross: number; orders: number; items: number; creators: number; comm: number;
    canceled: number; returned: number; cod: number;
  }>(sql`
    select
      coalesce(sum(pay) filter (where valid),0)::float8 as gmv,
      coalesce(sum(pay),0)::float8 as gross,
      count(distinct order_id) filter (where valid)::int as orders,
      coalesce(sum(qty) filter (where valid),0)::int as items,
      count(distinct creator) filter (where valid)::int as creators,
      coalesce(sum(comm) filter (where valid),0)::float8 as comm,
      coalesce(sum(pay) filter (where canceled),0)::float8 as canceled,
      coalesce(sum(pay) filter (where returned),0)::float8 as returned,
      coalesce(sum(pay) filter (where cod),0)::float8 as cod
    from ${AL}
    where ${between("created_at", start, end)} and creator <> all(${textArr(own)})`);
  return {
    gmv: r.gmv,
    gross: r.gross,
    orders: r.orders,
    items: r.items,
    aov: safeDiv(r.gmv, r.orders),
    creators: r.creators,
    commission: r.comm,
    commissionRate: safeDiv(r.comm, r.gmv),
    cancelRate: safeDiv(r.canceled, r.gross),
    returnRate: safeDiv(r.returned, r.gross),
    codShare: safeDiv(r.cod, r.gross),
  };
}

export const SOURCES = [
  { key: "video", label: "Creator videos", color: "var(--s1)" },
  { key: "live", label: "Creator LIVE", color: "var(--s2)" },
  { key: "showcase", label: "Showcase / cards", color: "var(--s3)" },
  { key: "etp", label: "External traffic", color: "var(--s4)" },
  { key: "brandLive", label: "Brand LIVE", color: "var(--s5)" },
  { key: "organic", label: "Other / organic", color: "var(--ink-3)" },
] as const;
export type SourceKey = (typeof SOURCES)[number]["key"];

export type TrendPoint = { bucket: string } & Partial<Record<SourceKey, number>>;

export type SourceMix = {
  hasShopData: boolean;
  totals: Record<SourceKey, number>;
  prevTotals: Record<SourceKey, number>;
  trend: TrendPoint[];
  bucket: "day" | "week";
  affiliateShare: number; // affiliate (video+live+showcase+etp) share of valid shop GMV
};

const emptyTotals = (): Record<SourceKey, number> => ({
  video: 0, live: 0, showcase: 0, etp: 0, brandLive: 0, organic: 0,
});

/** Shop-wide valid sales by source. Falls back to affiliate-only when the shop export is missing. */
export async function getSourceMix(period: Period): Promise<SourceMix> {
  const own = await getOwnAccounts();
  const [{ n }] = await rows<{ n: number }>(sql`
    select count(*)::int as n from shop_order_lines where ${inPeriod("created_at", period)}`);
  const hasShopData = n > 0;
  const bucket: "day" | "week" = period.days > 45 ? "week" : "day";

  const ownLit = textArr(own);
  const srcExpr = sql`case
      when a.order_id is not null then
        case a.content_type
          when 'Video' then 'video' when 'Livestream' then 'live'
          when 'Showcase' then 'showcase' when 'External Traffic Program' then 'etp'
          else 'organic' end
      when s.order_channel = 'LIVE' and s.creator = any(${ownLit}) then 'brandLive'
      else 'organic' end`;

  type R = { bucket: string; src: SourceKey; gmv: number; period: "cur" | "prev" };
  let data: R[];
  if (hasShopData) {
    data = await rows<R>(sql`
      select to_char(date_trunc(${bucket}, s.created_at), 'YYYY-MM-DD') as bucket,
             ${srcExpr} as src,
             sum(s.subtotal_after)::float8 as gmv,
             case when ${between("s.created_at", period.start, period.end)} then 'cur' else 'prev' end as period
      from shop_order_lines s
      left join order_lines a on a.order_id = s.order_id and a.sku_id = s.sku_id
      where s.status <> 'Canceled' and coalesce(s.cancel_type,'') <> 'Return/Refund'
        and (${between("s.created_at", period.start, period.end)} or ${between("s.created_at", period.prevStart, period.prevEnd)})
      group by 1, 2, 4`);
  } else {
    data = await rows<R>(sql`
      select to_char(date_trunc(${bucket}, created_at), 'YYYY-MM-DD') as bucket,
             case content_type when 'Video' then 'video' when 'Livestream' then 'live'
               when 'Showcase' then 'showcase' when 'External Traffic Program' then 'etp' else 'organic' end as src,
             sum(pay)::float8 as gmv,
             case when ${between("created_at", period.start, period.end)} then 'cur' else 'prev' end as period
      from ${AL}
      where valid and (${between("created_at", period.start, period.end)} or ${between("created_at", period.prevStart, period.prevEnd)})
      group by 1, 2, 4`);
  }

  const totals = emptyTotals();
  const prevTotals = emptyTotals();
  const byBucket = new Map<string, TrendPoint>();
  for (const d of data) {
    if (d.period === "prev") {
      prevTotals[d.src] += d.gmv;
      continue;
    }
    totals[d.src] += d.gmv;
    const p = byBucket.get(d.bucket) ?? { bucket: d.bucket };
    p[d.src] = (p[d.src] ?? 0) + d.gmv;
    byBucket.set(d.bucket, p);
  }
  const trend = fillBuckets([...byBucket.values()], period, bucket);
  const all = Object.values(totals).reduce((a, b) => a + b, 0);
  const aff = totals.video + totals.live + totals.showcase + totals.etp;
  return { hasShopData, totals, prevTotals, trend, bucket, affiliateShare: safeDiv(aff, all) };
}

export function fillBuckets(points: TrendPoint[], period: Period, bucket: "day" | "week"): TrendPoint[] {
  const map = new Map(points.map((p) => [p.bucket, p]));
  const out: TrendPoint[] = [];
  const DAY = 86_400_000;
  const start = new Date(period.start + "T00:00:00Z");
  let t = start.getTime();
  if (bucket === "week") {
    const dow = (start.getUTCDay() + 6) % 7; // Monday = 0
    t -= dow * DAY;
  }
  const end = new Date(period.end + "T00:00:00Z").getTime();
  const step = bucket === "week" ? 7 * DAY : DAY;
  for (; t <= end; t += step) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push(map.get(key) ?? { bucket: key });
  }
  return out;
}

export type TopCreator = { username: string; gmv: number; prevGmv: number; orders: number; share: number };

export async function getTopCreators(period: Period, limit = 8): Promise<TopCreator[]> {
  const own = await getOwnAccounts();
  const data = await rows<{ creator: string; gmv: number; prev: number; orders: number }>(sql`
    select creator,
      coalesce(sum(pay) filter (where valid and ${inPeriod("created_at", period)}),0)::float8 as gmv,
      coalesce(sum(pay) filter (where valid and ${between("created_at", period.prevStart, period.prevEnd)}),0)::float8 as prev,
      count(distinct order_id) filter (where valid and ${inPeriod("created_at", period)})::int as orders
    from ${AL}
    where creator <> all(${textArr(own)}) and (${inPeriod("created_at", period)} or ${between("created_at", period.prevStart, period.prevEnd)})
    group by creator
    order by gmv desc
    limit ${limit}`);
  const total = (await kpisFor(period.start, period.end, own)).gmv;
  return data.map((d) => ({ username: d.creator, gmv: d.gmv, prevGmv: d.prev, orders: d.orders, share: safeDiv(d.gmv, total) }));
}

export type ProductRow = {
  productId: string;
  name: string;
  shortName: string;
  gmv: number;
  prevGmv: number;
  orders: number;
  items: number;
  creators: number;
  cancelRate: number;
  commission: number;
};

export async function getProductPerformance(period: Period): Promise<ProductRow[]> {
  const own = await getOwnAccounts();
  const data = await rows<{
    product_id: string; name: string | null; short_name: string | null; gmv: number; prev: number; orders: number;
    items: number; creators: number; gross: number; canceled: number; comm: number;
  }>(sql`
    select al.product_id, p.name, p.short_name,
      coalesce(sum(pay) filter (where valid and ${inPeriod("created_at", period)}),0)::float8 as gmv,
      coalesce(sum(pay) filter (where valid and ${between("created_at", period.prevStart, period.prevEnd)}),0)::float8 as prev,
      count(distinct order_id) filter (where valid and ${inPeriod("created_at", period)})::int as orders,
      coalesce(sum(qty) filter (where valid and ${inPeriod("created_at", period)}),0)::int as items,
      count(distinct creator) filter (where valid and ${inPeriod("created_at", period)})::int as creators,
      coalesce(sum(pay) filter (where ${inPeriod("created_at", period)}),0)::float8 as gross,
      coalesce(sum(pay) filter (where canceled and ${inPeriod("created_at", period)}),0)::float8 as canceled,
      coalesce(sum(comm) filter (where valid and ${inPeriod("created_at", period)}),0)::float8 as comm
    from ${AL}
    left join products p on p.product_id = al.product_id
    where creator <> all(${textArr(own)}) and (${inPeriod("created_at", period)} or ${between("created_at", period.prevStart, period.prevEnd)})
    group by al.product_id, p.name, p.short_name
    order by gmv desc`);
  return data.map((d) => ({
    productId: d.product_id,
    name: d.name ?? d.product_id,
    shortName: d.short_name ?? d.name ?? d.product_id,
    gmv: d.gmv,
    prevGmv: d.prev,
    orders: d.orders,
    items: d.items,
    creators: d.creators,
    cancelRate: safeDiv(d.canceled, d.gross),
    commission: d.comm,
  }));
}

export const AGE_BUCKETS = [
  { key: "d7", label: "Under 7 days" },
  { key: "d30", label: "7–30 days" },
  { key: "d90", label: "30–90 days" },
  { key: "d180", label: "90–180 days" },
  { key: "d180p", label: "Over 180 days" },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];

export type VideoAgeMix = {
  buckets: { key: AgeKey; label: string; gmv: number; videos: number }[];
  total: number;
  /** share of video GMV from videos posted more than 90 days before the sale */
  olderThan90: number;
};

/** How old were the videos that made the sale? (age = order date − post date) */
export async function getVideoAgeMix(period: Period): Promise<VideoAgeMix> {
  const own = await getOwnAccounts();
  const data = await rows<{ b: AgeKey; gmv: number; videos: number }>(sql`
    select case
        when al.created_at - v.posted_at < interval '7 days' then 'd7'
        when al.created_at - v.posted_at < interval '30 days' then 'd30'
        when al.created_at - v.posted_at < interval '90 days' then 'd90'
        when al.created_at - v.posted_at < interval '180 days' then 'd180'
        else 'd180p' end as b,
      sum(pay)::float8 as gmv,
      count(distinct al.content_id)::int as videos
    from ${AL}
    join videos v on v.video_id = al.content_id
    where valid and content_type = 'Video' and v.posted_at is not null
      and ${inPeriod("al.created_at", period)} and al.creator <> all(${textArr(own)})
    group by 1`);
  const map = new Map(data.map((d) => [d.b, d]));
  const buckets = AGE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    gmv: map.get(b.key)?.gmv ?? 0,
    videos: map.get(b.key)?.videos ?? 0,
  }));
  const total = buckets.reduce((a, b) => a + b.gmv, 0);
  const old = (map.get("d180")?.gmv ?? 0) + (map.get("d180p")?.gmv ?? 0);
  return { buckets, total, olderThan90: safeDiv(old, total) };
}
