import "server-only";
import { sql } from "drizzle-orm";
import type { Period } from "@/lib/period-core";
import { pickSnapshot, type SnapshotRef } from "./snapshots";
import { getOwnAccounts } from "./settings";
import { AL, between, inPeriod, rows, safeDiv, textArr } from "./sql";

export type CreatorMetrics = {
  username: string;
  gmv: number;
  gross: number;
  orders: number;
  items: number;
  commission: number;
  canceledGmv: number;
  returnedGmv: number;
  cancelRate: number;
  codShare: number;
  videoGmv: number;
  liveGmv: number;
  showcaseGmv: number;
  etpGmv: number;
  sellingVideos: number;
  products: number;
  activeDays: number;
  lastOrder: string | null;
  prevGmv: number;
  prevOrders: number;
  topProductId: string | null;
  topProductShare: number;
  /** share of video GMV that comes from videos posted more than 90 days before the sale */
  oldVideoShare: number | null;
  /** videos that sold within 30 days of being posted */
  freshVideos: number;
  freshGmv: number;
  // snapshot-based (null when no snapshot overlaps the period)
  followers: number | null;
  videosPosted: number | null;
  livesPosted: number | null;
  /** shoppable videos per week, from the transaction snapshot window */
  vpw: number | null;
  impressions: number | null;
  views: number | null;
  ctr: number | null;
  ctor: number | null;
  samplesShipped: number | null;
  /** GMV per 1,000 video views */
  gpmViews: number | null;
};

export type SnapshotInfo = {
  txn: SnapshotRef | null;
  list: SnapshotRef | null;
  sample: SnapshotRef | null;
  video: SnapshotRef | null;
};

export async function getSnapshotInfo(period: Period): Promise<SnapshotInfo> {
  const [txn, list, sample, video] = await Promise.all([
    pickSnapshot("creator_transactions", period.start, period.end),
    pickSnapshot("creator_list", period.start, period.end),
    pickSnapshot("sample_analysis", period.start, period.end),
    pickSnapshot("video_list", period.start, period.end),
  ]);
  return { txn, list, sample, video };
}

export async function getCreatorMetrics(period: Period): Promise<{ rows: CreatorMetrics[]; snapshots: SnapshotInfo }> {
  const own = await getOwnAccounts();
  const snapshots = await getSnapshotInfo(period);
  const ownArr = textArr(own);

  const cur = await rows<{
    creator: string; gmv: number; gross: number; orders: number; items: number; comm: number; canceled: number;
    returned: number; cod: number; video: number; live: number; showcase: number; etp: number; selling_videos: number;
    products: number; active_days: number; last_order: string | null;
  }>(sql`
    select creator,
      coalesce(sum(pay) filter (where valid),0)::float8 as gmv,
      coalesce(sum(pay),0)::float8 as gross,
      count(distinct order_id) filter (where valid)::int as orders,
      coalesce(sum(qty) filter (where valid),0)::int as items,
      coalesce(sum(comm) filter (where valid),0)::float8 as comm,
      coalesce(sum(pay) filter (where canceled),0)::float8 as canceled,
      coalesce(sum(pay) filter (where returned),0)::float8 as returned,
      coalesce(sum(pay) filter (where cod),0)::float8 as cod,
      coalesce(sum(pay) filter (where valid and content_type = 'Video'),0)::float8 as video,
      coalesce(sum(pay) filter (where valid and content_type = 'Livestream'),0)::float8 as live,
      coalesce(sum(pay) filter (where valid and content_type = 'Showcase'),0)::float8 as showcase,
      coalesce(sum(pay) filter (where valid and content_type = 'External Traffic Program'),0)::float8 as etp,
      count(distinct content_id) filter (where valid and content_type = 'Video')::int as selling_videos,
      count(distinct product_id) filter (where valid)::int as products,
      count(distinct created_at::date) filter (where valid)::int as active_days,
      to_char(max(created_at), 'YYYY-MM-DD') as last_order
    from ${AL}
    where ${inPeriod("created_at", period)} and creator <> all(${ownArr})
    group by creator`);

  const prev = await rows<{ creator: string; gmv: number; orders: number }>(sql`
    select creator,
      coalesce(sum(pay) filter (where valid),0)::float8 as gmv,
      count(distinct order_id) filter (where valid)::int as orders
    from ${AL}
    where ${between("created_at", period.prevStart, period.prevEnd)} and creator <> all(${ownArr})
    group by creator`);

  const top = await rows<{ creator: string; product_id: string; gmv: number; total: number }>(sql`
    select distinct on (creator) creator, product_id, gmv, total from (
      select creator, product_id,
        sum(pay) filter (where valid) as gmv,
        sum(sum(pay) filter (where valid)) over (partition by creator) as total
      from ${AL}
      where ${inPeriod("created_at", period)} and creator <> all(${ownArr})
      group by creator, product_id
    ) t
    order by creator, gmv desc nulls last`);

  const age = await rows<{ creator: string; total: number; old: number; fresh: number; fresh_videos: number }>(sql`
    select al.creator,
      sum(pay)::float8 as total,
      coalesce(sum(pay) filter (where al.created_at - v.posted_at > interval '90 days'),0)::float8 as old,
      coalesce(sum(pay) filter (where al.created_at - v.posted_at <= interval '30 days'),0)::float8 as fresh,
      count(distinct al.content_id) filter (where al.created_at - v.posted_at <= interval '30 days')::int as fresh_videos
    from ${AL}
    join videos v on v.video_id = al.content_id
    where valid and content_type = 'Video' and v.posted_at is not null
      and ${inPeriod("al.created_at", period)} and al.creator <> all(${ownArr})
    group by al.creator`);

  const txn = snapshots.txn
    ? await rows<{
        username: string; videos: number; lives: number; impressions: number; views: number; ctr: number | null;
        ctor: number | null; shipped: number;
      }>(sql`
        select username, videos, live_streams as lives, impressions, views, ctr, ctor, samples_shipped as shipped
        from creator_txn_snapshots where upload_id = ${snapshots.txn.uploadId}`)
    : [];
  const list = snapshots.list
    ? await rows<{ username: string; followers: number }>(sql`
        select username, followers from creator_list_snapshots where upload_id = ${snapshots.list.uploadId}`)
    : [];

  const prevMap = new Map(prev.map((p) => [p.creator, p]));
  const topMap = new Map(top.map((t) => [t.creator, t]));
  const ageMap = new Map(age.map((a) => [a.creator, a]));
  const txnMap = new Map(txn.map((t) => [t.username, t]));
  const listMap = new Map(list.map((t) => [t.username, t.followers]));
  const weeks = snapshots.txn ? snapshots.txn.days / 7 : null;

  // Include creators who sold only in the previous period (they may have gone quiet).
  const curNames = new Set(cur.map((c) => c.creator));
  const prevOnly = prev.filter((p) => !curNames.has(p.creator) && p.gmv > 0);

  const toRow = (c: (typeof cur)[number] | null, username: string): CreatorMetrics => {
    const p = prevMap.get(username);
    const t = topMap.get(username);
    const x = txnMap.get(username);
    const ag = ageMap.get(username);
    const gmv = c?.gmv ?? 0;
    const views = x ? x.views : snapshots.txn ? 0 : null;
    return {
      username,
      gmv,
      gross: c?.gross ?? 0,
      orders: c?.orders ?? 0,
      items: c?.items ?? 0,
      commission: c?.comm ?? 0,
      canceledGmv: c?.canceled ?? 0,
      returnedGmv: c?.returned ?? 0,
      cancelRate: safeDiv((c?.canceled ?? 0) + (c?.returned ?? 0), c?.gross ?? 0),
      codShare: safeDiv(c?.cod ?? 0, c?.gross ?? 0),
      videoGmv: c?.video ?? 0,
      liveGmv: c?.live ?? 0,
      showcaseGmv: c?.showcase ?? 0,
      etpGmv: c?.etp ?? 0,
      sellingVideos: c?.selling_videos ?? 0,
      products: c?.products ?? 0,
      activeDays: c?.active_days ?? 0,
      lastOrder: c?.last_order ?? null,
      prevGmv: p?.gmv ?? 0,
      prevOrders: p?.orders ?? 0,
      topProductId: t?.product_id ?? null,
      topProductShare: t && t.total ? (t.gmv ?? 0) / t.total : 0,
      oldVideoShare: ag && ag.total > 0 ? ag.old / ag.total : null,
      freshVideos: ag?.fresh_videos ?? 0,
      freshGmv: ag?.fresh ?? 0,
      followers: listMap.get(username) ?? null,
      videosPosted: snapshots.txn ? (x?.videos ?? 0) : null,
      livesPosted: snapshots.txn ? (x?.lives ?? 0) : null,
      vpw: snapshots.txn && weeks ? (x?.videos ?? 0) / weeks : null,
      impressions: snapshots.txn ? (x?.impressions ?? 0) : null,
      views,
      ctr: x?.ctr ?? null,
      ctor: x?.ctor ?? null,
      samplesShipped: snapshots.txn ? (x?.shipped ?? 0) : null,
      gpmViews: views && views > 0 ? (gmv / views) * 1000 : null,
    };
  };

  const out = [
    ...cur.map((c) => toRow(c, c.creator)),
    ...prevOnly.map((p) => toRow(null, p.creator)),
  ];
  return { rows: out, snapshots };
}

export type NonSeller = {
  username: string;
  followers: number;
  samplesShipped: number;
  samplesRequested: number;
  postingRate: number;
  videosWithSamples: number;
  liveWithSamples: number;
};

/** Creators with no sales in the window: sample takers and large-following creators from the pool. */
export async function getNonSellers(period: Period, sellers: Set<string>): Promise<{ sampled: NonSeller[]; pool: NonSeller[] }> {
  const own = await getOwnAccounts();
  const snaps = await getSnapshotInfo(period);
  const ownSet = new Set(own);

  const sampled = snaps.sample
    ? (
        await rows<{
          username: string; shipped: number; requested: number; rate: number; v: number; l: number; followers: number | null;
        }>(sql`
          select s.username, s.shipped, s.requested, s.posting_rate as rate, s.videos_with_samples as v,
                 s.live_with_samples as l, c.followers
          from sample_snapshots s
          left join creator_list_snapshots c on c.username = s.username
            and c.upload_id = ${snaps.list?.uploadId ?? -1}
          where s.upload_id = ${snaps.sample.uploadId} and s.shipped > 0`)
      )
        .filter((r) => !sellers.has(r.username) && !ownSet.has(r.username))
        .map((r) => ({
          username: r.username,
          followers: r.followers ?? 0,
          samplesShipped: r.shipped,
          samplesRequested: r.requested,
          postingRate: r.rate,
          videosWithSamples: r.v,
          liveWithSamples: r.l,
        }))
    : [];

  const pool = snaps.list
    ? (
        await rows<{ username: string; followers: number }>(sql`
          select username, followers from creator_list_snapshots
          where upload_id = ${snaps.list.uploadId} and gmv = 0 and followers >= 20000
          order by followers desc limit 400`)
      )
        .filter((r) => !sellers.has(r.username) && !ownSet.has(r.username))
        .map((r) => ({
          username: r.username,
          followers: r.followers,
          samplesShipped: 0,
          samplesRequested: 0,
          postingRate: 0,
          videosWithSamples: 0,
          liveWithSamples: 0,
        }))
    : [];
  return { sampled, pool };
}
