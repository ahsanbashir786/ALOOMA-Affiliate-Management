import "server-only";
import { sql } from "drizzle-orm";
import type { Period } from "@/lib/period-core";
import { pickSnapshot } from "./snapshots";
import { getOwnAccounts } from "./settings";
import { AL, inPeriod, rows, textArr } from "./sql";

export type VideoRow = {
  videoId: string;
  creator: string;
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
};

/** Videos that sold in the window (valid sales), with snapshot engagement metrics when available. */
export async function getTopVideos(period: Period, opts: { limit?: number; minAgeDays?: number } = {}): Promise<VideoRow[]> {
  const own = await getOwnAccounts();
  const { limit = 25, minAgeDays = 0 } = opts;
  const data = await rows<{
    video_id: string; creator: string; title: string | null; link: string | null; posted_at: string | null;
    age: number | null; gmv: number; orders: number;
  }>(sql`
    select al.content_id as video_id, al.creator, v.title, v.link,
      to_char(v.posted_at, 'YYYY-MM-DD') as posted_at,
      (extract(epoch from (${period.end}::date - v.posted_at)) / 86400)::float8 as age,
      sum(pay)::float8 as gmv, count(distinct order_id)::int as orders
    from ${AL}
    left join videos v on v.video_id = al.content_id
    where al.valid and al.content_type = 'Video' and ${inPeriod("al.created_at", period)}
      and al.creator <> all(${textArr(own)})
      ${minAgeDays > 0 ? sql`and v.posted_at is not null and v.posted_at < (${period.end}::date - ${minAgeDays}::int)` : sql``}
    group by al.content_id, al.creator, v.title, v.link, v.posted_at
    order by gmv desc limit ${limit}`);

  const snap = await pickSnapshot("video_list", period.start, period.end);
  const m = new Map<string, { views: number; ctr: number | null; gpm: number | null; completion: number | null }>();
  if (snap && data.length) {
    const metrics = await rows<{ video_id: string; views: number; ctr: number | null; gpm: number | null; completion: number | null }>(sql`
      select video_id, views, ctr, gpm, completion_rate as completion from video_snapshots
      where upload_id = ${snap.uploadId} and video_id in (${sql.join(data.map((d) => sql`${d.video_id}`), sql`, `)})`);
    for (const r of metrics) m.set(r.video_id, r);
  }
  return data.map((d) => ({
    videoId: d.video_id,
    creator: d.creator,
    title: d.title,
    link: d.link,
    postedAt: d.posted_at,
    ageDays: d.age,
    gmv: d.gmv,
    orders: d.orders,
    views: m.get(d.video_id)?.views ?? null,
    ctr: m.get(d.video_id)?.ctr ?? null,
    gpm: m.get(d.video_id)?.gpm ?? null,
    completion: m.get(d.video_id)?.completion ?? null,
  }));
}

export type PostingInsights = {
  sample: number;
  weekdays: { label: string; avgGmv: number; videos: number }[];
  dayparts: { label: string; avgGmv: number; videos: number }[];
  keywords: { word: string; avgGmv: number; videos: number }[];
  windowDays: number;
  snapshotLabel: string | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYPARTS = [
  { label: "Night (00–06)", from: 0, to: 6 },
  { label: "Morning (06–12)", from: 6, to: 12 },
  { label: "Afternoon (12–18)", from: 12, to: 18 },
  { label: "Evening (18–24)", from: 18, to: 24 },
];

/**
 * When and how should videos be posted? Looks at videos posted in the 120 days
 * before the snapshot ended (so every video had a similar chance to sell) and
 * compares the GMV each earned in the snapshot window.
 */
export async function getPostingInsights(period: Period): Promise<PostingInsights | null> {
  const snap = await pickSnapshot("video_list", period.start, period.end);
  if (!snap) return null;
  const windowDays = 120;
  const data = await rows<{ dow: number; hour: number; gmv: number; title: string | null }>(sql`
    select ((extract(isodow from v.posted_at))::int - 1) as dow, extract(hour from v.posted_at)::int as hour,
           s.gmv::float8 as gmv, v.title
    from video_snapshots s join videos v on v.video_id = s.video_id
    where s.upload_id = ${snap.uploadId} and v.posted_at is not null
      and v.posted_at >= (${snap.end}::date - ${windowDays}::int) and v.posted_at < (${snap.end}::date + 1)`);

  const wd = WEEKDAYS.map((label) => ({ label, total: 0, n: 0 }));
  const dp = DAYPARTS.map((d) => ({ label: d.label, total: 0, n: 0 }));
  const kw = new Map<string, { total: number; n: number }>();
  for (const r of data) {
    wd[r.dow].total += r.gmv; wd[r.dow].n++;
    const p = DAYPARTS.findIndex((d) => r.hour >= d.from && r.hour < d.to);
    if (p >= 0) { dp[p].total += r.gmv; dp[p].n++; }
    const words = new Set(
      (r.title ?? "")
        .toLowerCase()
        .match(/#[\p{L}\p{N}_]+/gu) ?? [],
    );
    for (const w of words) {
      const e = kw.get(w) ?? { total: 0, n: 0 };
      e.total += r.gmv; e.n++;
      kw.set(w, e);
    }
  }
  const fin = (x: { label: string; total: number; n: number }) => ({ label: x.label, avgGmv: x.n ? x.total / x.n : 0, videos: x.n });
  return {
    sample: data.length,
    weekdays: wd.map(fin),
    dayparts: dp.map(fin),
    keywords: [...kw]
      .filter(([, v]) => v.n >= 8)
      .map(([word, v]) => ({ word, avgGmv: v.total / v.n, videos: v.n }))
      .sort((a, b) => b.avgGmv - a.avgGmv)
      .slice(0, 10),
    windowDays,
    snapshotLabel: `${snap.start} – ${snap.end}`,
  };
}
