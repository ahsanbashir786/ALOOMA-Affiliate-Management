import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { kd, TL } from "@/lib/creators/sql";
import { addDaysISO, daysBetweenISO } from "@/lib/time";
import type { Analysis } from "@/lib/products/analysis";

/** A video or LIVE that sold: when it was posted, how much it sold, and where to watch it. */
export type VideoRef = { id: string; kind: "video" | "live"; postDay: string | null; estimated: boolean; sales: number; lastSale: string; ageDays: number | null; url: string | null };
/** Everything one creator ever sold of one product. */
export type Life = { creator: string; total: number; orders: number; firstDay: string; lastDay: string; tops: VideoRef[]; recent: VideoRef[] };
export type Overall = { creator: string; total: number; lastDay: string; best: { pk: string; sales: number } | null; products: Set<string> };
export type History = {
  /** product key -> creator -> lifetime numbers */
  life: Map<string, Map<string, Life>>;
  /** creator -> sales across all products */
  overall: Map<string, Overall>;
  /** Creators we must not contact. */
  blocked: Set<string>;
};

type LifeRow = { pk: string; creator: string; total: number; orders: number; first_day: string; last_day: string; tops: { id: string; ct: string; sales: number; last: string }[] | null };
type RecentRow = { pk: string; creator: string; cid: string; ct: string; sales: number; last: string };

let cache: { key: string; value: History } | null = null;

const url = (creator: string, id: string, kind: "video" | "live") => (kind === "video" ? `https://www.tiktok.com/@${encodeURIComponent(creator)}/video/${id}` : null);

/** Lifetime sales per creator and product, from the whole order history (not only the last two periods). Cached until the data or the day changes. */
export async function loadHistory(a: Analysis): Promise<History> {
  const key = `${a.ref}|${a.period.start}|${a.products.reduce((n, p) => n + p.metrics.sales.now + p.metrics.sales.prev, 0).toFixed(2)}`;
  if (cache?.key === key) return cache.value;
  const D = kd("tl.created_at");
  const [lifeRows, recentRows, posted, blockedRows] = await Promise.all([
    rows<LifeRow>(sql`
      with c as (
        select tl.pk, tl.creator, tl.content_id as cid, tl.content_type as ct,
               min(${D}) filter (where tl.valid) as f, max(${D}) filter (where tl.valid) as l,
               sum(tl.pay) filter (where tl.valid) as s, count(distinct tl.order_id) filter (where tl.valid) as o
        from ${TL} where tl.creator is not null group by 1, 2, 3, 4
      ), r as (
        select *, row_number() over (partition by pk, creator order by s desc nulls last) as rn from c where s > 0
      )
      select pk, creator, sum(s)::float8 as total, sum(o)::int as orders, to_char(min(f), 'YYYY-MM-DD') as first_day, to_char(max(l), 'YYYY-MM-DD') as last_day,
        json_agg(json_build_object('id', cid, 'ct', ct, 'sales', s::float8, 'last', to_char(l, 'YYYY-MM-DD')) order by s desc) filter (where rn <= 3 and cid is not null) as tops
      from r group by pk, creator`),
    rows<RecentRow>(sql`
      select tl.pk, tl.creator, tl.content_id as cid, tl.content_type as ct, sum(tl.pay)::float8 as sales, to_char(max(${D}), 'YYYY-MM-DD') as last
      from ${TL} where tl.creator is not null and tl.valid and tl.content_id is not null and ${D} between ${a.period.start}::date and ${a.period.end}::date
      group by 1, 2, 3, 4`),
    rows<{ id: string; day: string }>(sql`select video_id as id, to_char(${kd("posted_at")}, 'YYYY-MM-DD') as day from tt_videos where posted_at is not null`),
    rows<{ username: string }>(sql`select username from creators where do_not_contact`),
  ]);
  const postDay = new Map(posted.map((p) => [p.id, p.day]));
  const ref = (creator: string, id: string, ct: string, sales: number, last: string, firstSeen: string | null): VideoRef => {
    const kind: "video" | "live" = ct === "Livestream" ? "live" : "video";
    const real = postDay.get(id);
    const pd = real ?? firstSeen;
    return { id, kind, postDay: pd, estimated: !real, sales, lastSale: last, ageDays: pd ? Math.max(0, daysBetweenISO(pd, a.period.end)) : null, url: url(creator, id, kind) };
  };
  const recentBy = new Map<string, VideoRef[]>();
  for (const r of recentRows) {
    if (r.ct !== "Video" && r.ct !== "Livestream") continue;
    const k = `${r.pk}|${r.creator}`;
    (recentBy.get(k) ?? recentBy.set(k, []).get(k)!).push(ref(r.creator, r.cid, r.ct, r.sales, r.last, null));
  }
  const life = new Map<string, Map<string, Life>>();
  const overall = new Map<string, Overall>();
  for (const r of lifeRows) {
    const m = life.get(r.pk) ?? life.set(r.pk, new Map()).get(r.pk)!;
    m.set(r.creator, {
      creator: r.creator, total: r.total, orders: r.orders, firstDay: r.first_day, lastDay: r.last_day,
      tops: (r.tops ?? []).filter((t) => t.ct === "Video" || t.ct === "Livestream").map((t) => ref(r.creator, t.id, t.ct, t.sales, t.last, r.first_day)),
      recent: (recentBy.get(`${r.pk}|${r.creator}`) ?? []).sort((x, y) => y.sales - x.sales).slice(0, 3),
    });
    if (r.pk === "unmapped") continue;
    const o = overall.get(r.creator) ?? overall.set(r.creator, { creator: r.creator, total: 0, lastDay: r.last_day, best: null, products: new Set() }).get(r.creator)!;
    o.total += r.total; o.products.add(r.pk);
    if (r.last_day > o.lastDay) o.lastDay = r.last_day;
    if (!o.best || r.total > o.best.sales) o.best = { pk: r.pk, sales: r.total };
  }
  const value: History = { life, overall, blocked: new Set(blockedRows.map((b) => b.username)) };
  cache = { key, value };
  return value;
}

export const daysAgo = (day: string, today: string) => daysBetweenISO(day, today);
export const weeksBefore = (day: string, n: number) => addDaysISO(day, -7 * n);
