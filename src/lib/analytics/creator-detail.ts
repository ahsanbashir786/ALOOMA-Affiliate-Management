import "server-only";
import { desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { actions, creators, sampleSnapshots } from "@/db/schema";
import type { Period } from "@/lib/period-core";
import { fillBuckets, type TrendPoint } from "./overview";
import { pickSnapshot } from "./snapshots";
import { AL, inPeriod, rows, safeDiv } from "./sql";

export type CreatorDetail = {
  trend: TrendPoint[];
  bucket: "day" | "week";
  products: { productId: string; name: string; gmv: number; orders: number; share: number }[];
  videos: {
    videoId: string;
    title: string | null;
    link: string | null;
    postedAt: string | null;
    ageDays: number | null;
    gmv: number;
    orders: number;
    views: number | null;
    ctr: number | null;
    gpm: number | null;
    completion: number | null;
  }[];
  cancelReasons: { reason: string; n: number }[];
  sample: { requested: number; shipped: number; postingRate: number; videos: number; lives: number; roi45: number; roi90: number } | null;
  history: (typeof actions.$inferSelect)[];
  notes: string | null;
  doNotContact: boolean;
  firstSeen: string | null;
};

export async function getCreatorDetail(username: string, period: Period): Promise<CreatorDetail> {
  const bucket: "day" | "week" = period.days > 45 ? "week" : "day";
  const [trendRaw, products, videoRows, reasons, history, profile] = await Promise.all([
    rows<{ bucket: string; ct: string; gmv: number }>(sql`
      select to_char(date_trunc(${bucket}, created_at), 'YYYY-MM-DD') as bucket,
        case content_type when 'Video' then 'video' when 'Livestream' then 'live'
          when 'Showcase' then 'showcase' else 'etp' end as ct,
        sum(pay)::float8 as gmv
      from ${AL}
      where valid and creator = ${username} and ${inPeriod("created_at", period)}
      group by 1, 2`),
    rows<{ product_id: string; name: string | null; gmv: number; orders: number }>(sql`
      select al.product_id, p.short_name as name, sum(pay)::float8 as gmv, count(distinct order_id)::int as orders
      from ${AL} left join products p on p.product_id = al.product_id
      where valid and creator = ${username} and ${inPeriod("al.created_at", period)}
      group by al.product_id, p.short_name order by gmv desc`),
    rows<{ video_id: string; gmv: number; orders: number; title: string | null; link: string | null; posted_at: string | null; age: number | null }>(sql`
      select al.content_id as video_id, sum(pay)::float8 as gmv, count(distinct order_id)::int as orders,
        v.title, v.link, to_char(v.posted_at, 'YYYY-MM-DD') as posted_at,
        (extract(epoch from (${period.end}::date - v.posted_at)) / 86400)::float8 as age
      from ${AL} left join videos v on v.video_id = al.content_id
      where al.valid and al.creator = ${username} and al.content_type = 'Video' and ${inPeriod("al.created_at", period)}
      group by al.content_id, v.title, v.link, v.posted_at
      order by gmv desc limit 10`),
    rows<{ reason: string; n: number }>(sql`
      select coalesce(cancel_reason, 'Not stated') as reason, count(distinct order_id)::int as n
      from ${AL}
      where canceled and creator = ${username} and ${inPeriod("created_at", period)}
      group by 1 order by n desc limit 5`),
    db.select().from(actions).where(eq(actions.username, username)).orderBy(desc(actions.createdAt)).limit(15),
    db.select().from(creators).where(eq(creators.username, username)).limit(1),
  ]);

  // Video-level metrics from the snapshot that best matches the window.
  const vsnap = await pickSnapshot("video_list", period.start, period.end);
  const vm = new Map<string, { views: number; ctr: number | null; gpm: number | null; completion: number | null }>();
  if (vsnap && videoRows.length) {
    const ids = videoRows.map((v) => v.video_id);
    const m = await rows<{ video_id: string; views: number; ctr: number | null; gpm: number | null; completion: number | null }>(sql`
      select video_id, views, ctr, gpm, completion_rate as completion from video_snapshots
      where upload_id = ${vsnap.uploadId} and video_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    for (const r of m) vm.set(r.video_id, r);
  }

  const ssnap = await pickSnapshot("sample_analysis", period.start, period.end);
  const sampleRow = ssnap
    ? (await db.select().from(sampleSnapshots).where(sql`${sampleSnapshots.uploadId} = ${ssnap.uploadId} and ${sampleSnapshots.username} = ${username}`).limit(1))[0]
    : undefined;

  const byBucket = new Map<string, TrendPoint>();
  for (const r of trendRaw) {
    const p: Record<string, number | string> = byBucket.get(r.bucket) ?? { bucket: r.bucket };
    p[r.ct] = ((p[r.ct] as number | undefined) ?? 0) + r.gmv;
    byBucket.set(r.bucket, p as TrendPoint);
  }
  const total = products.reduce((a, p) => a + p.gmv, 0);

  return {
    trend: fillBuckets([...byBucket.values()], period, bucket),
    bucket,
    products: products.map((p) => ({ productId: p.product_id, name: p.name ?? p.product_id, gmv: p.gmv, orders: p.orders, share: safeDiv(p.gmv, total) })),
    videos: videoRows.map((v) => ({
      videoId: v.video_id,
      title: v.title,
      link: v.link,
      postedAt: v.posted_at,
      ageDays: v.age,
      gmv: v.gmv,
      orders: v.orders,
      views: vm.get(v.video_id)?.views ?? null,
      ctr: vm.get(v.video_id)?.ctr ?? null,
      gpm: vm.get(v.video_id)?.gpm ?? null,
      completion: vm.get(v.video_id)?.completion ?? null,
    })),
    cancelReasons: reasons,
    sample: sampleRow
      ? {
          requested: sampleRow.requested,
          shipped: sampleRow.shipped,
          postingRate: sampleRow.postingRate,
          videos: sampleRow.videosWithSamples,
          lives: sampleRow.liveWithSamples,
          roi45: sampleRow.roi45,
          roi90: sampleRow.roi90,
        }
      : null,
    history,
    notes: profile[0]?.notes ?? null,
    doNotContact: profile[0]?.doNotContact ?? false,
    firstSeen: null,
  };
}
