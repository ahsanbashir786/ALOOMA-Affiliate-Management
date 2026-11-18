import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { cached } from "@/lib/swr";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, TL } from "@/lib/creators/sql";
import { productName } from "@/lib/products/catalog";
import { addDaysISO, daysBetweenISO } from "@/lib/time";
import { vault } from "@/lib/ads/vault";
import { BOOST_GROUPS, GROUP, type GroupKey } from "@/lib/ads/groups";
import { ageMix, classifyVideo, type VideoClass } from "./content";

export type VideoRow = {
  id: string; creator: string | null; title: string | null; product: string; postedOn: string | null; ageDays: number | null;
  total: number; s14: number; p14: number; s28: number; lastSale: string | null; views: number | null;
  cls: VideoClass;
  /** How GMV Max sees this video (its own group), and whether that group is one worth boosting. */
  ads: { group: GroupKey; label: string; why: string; boostNow: boolean; boosted: boolean } | null;
};
export type Content = {
  ref: string;
  from: string;
  sales: { now: number; before: number };
  videosSelling: number;
  counts: { heating: number; fading: number; stopped: number; ready: number };
  mix: ReturnType<typeof ageMix>;
  split: { video: { now: number; before: number }; live: { now: number; before: number } };
  lists: { heating: VideoRow[]; fading: VideoRow[]; stopped: VideoRow[]; ready: VideoRow[] };
};

const LIMIT = 60;
const READY_MIN_28 = 50, READY_MIN_TOTAL = 300;

export async function loadContent(): Promise<Content | null> {
  const { ref } = await loadCreatorRows();
  if (!ref) return null;
  return cached("aff-content", ref, () => compute(ref));
}

async function compute(ref: string): Promise<Content> {
  const d = kd("tl.created_at");
  const a14 = addDaysISO(ref, -13), b14s = addDaysISO(ref, -27), b14e = addDaysISO(ref, -14), a28 = addDaysISO(ref, -27), p28s = addDaysISO(ref, -55);
  const [vids, split, v] = await Promise.all([
    rows<{ vid: string; creator: string | null; pk: string | null; total: number; s14: number; p14: number; first_sale: string | null; last_sale: string | null; title: string | null; posted: string | null; views: number | null }>(sql`
      select x.vid, x.creator, x.pk, x.total, x.s14, x.p14, x.first_sale, x.last_sale, tv.title, to_char(${kd("tv.posted_at")}, 'YYYY-MM-DD') as posted, tv.views::float8 as views
      from (
        select tl.content_id as vid, max(tl.creator) as creator, (array_agg(tl.pk order by tl.pay desc))[1] as pk,
          coalesce(sum(tl.pay), 0)::float8 as total,
          coalesce(sum(tl.pay) filter (where ${d} between ${a14}::date and ${ref}::date), 0)::float8 as s14,
          coalesce(sum(tl.pay) filter (where ${d} between ${b14s}::date and ${b14e}::date), 0)::float8 as p14,
          to_char(min(${d}), 'YYYY-MM-DD') as first_sale, to_char(max(${d}), 'YYYY-MM-DD') as last_sale
        from ${TL} where tl.valid and tl.content_type = 'Video' and tl.content_id is not null group by tl.content_id
      ) x left join tt_videos tv on tv.video_id = x.vid`),
    rows<{ t: string; now: number; before: number }>(sql`
      select tl.content_type as t,
        coalesce(sum(tl.pay) filter (where ${d} between ${a28}::date and ${ref}::date), 0)::float8 as now,
        coalesce(sum(tl.pay) filter (where ${d} between ${p28s}::date and ${addDaysISO(ref, -28)}::date), 0)::float8 as before
      from ${TL} where tl.valid and tl.creator is not null and tl.content_type in ('Video', 'Livestream') group by 1`),
    vault(),
  ]);

  // GMV Max's view of each video (a video can sit under several products: keep the one worth boosting).
  const ads = new Map<string, VideoRow["ads"]>();
  for (const x of v.videos) {
    const boostNow = BOOST_GROUPS.includes(x.group);
    const cur = ads.get(x.creativeId);
    if (!cur || (boostNow && !cur.boostNow)) ads.set(x.creativeId, { group: x.group, label: GROUP[x.group].label, why: x.why, boostNow, boosted: x.boostedNow });
  }

  const all: VideoRow[] = vids.map((r) => {
    const posted = r.posted ?? r.first_sale;
    return {
      id: r.vid, creator: r.creator, title: r.title, product: r.pk ? productName(r.pk) : "", postedOn: posted, ageDays: posted ? Math.max(0, daysBetweenISO(posted, ref)) : null,
      total: r.total, s14: r.s14, p14: r.p14, s28: r.s14 + r.p14, lastSale: r.last_sale, views: r.views,
      cls: classifyVideo({ total: r.total, s14: r.s14, p14: r.p14, daysSinceLastSale: r.last_sale ? daysBetweenISO(r.last_sale, ref) : null }),
      ads: ads.get(r.vid) ?? null,
    };
  });

  const by = (c: VideoClass) => all.filter((x) => x.cls === c);
  const top = (xs: VideoRow[], key: (x: VideoRow) => number) => [...xs].sort((a, b) => key(b) - key(a)).slice(0, LIMIT);
  // Ready for GMV Max: GMV Max itself says it is worth boosting and it is not boosted now.
  // Still selling (RM 50 or more in 28 days), or GMV Max rates it proven and it sold RM 300 or more in its life. "Never used" videos need recent sales to qualify.
  const proven: GroupKey[] = ["stopped", "gem", "underfed"];
  const ready = all.filter((x) => x.ads?.boostNow && !x.ads.boosted && (x.s28 >= READY_MIN_28 || (proven.includes(x.ads.group) && x.total >= READY_MIN_TOTAL)));
  const f = (t: string) => ({ now: split.find((s) => s.t === t)?.now ?? 0, before: split.find((s) => s.t === t)?.before ?? 0 });
  const video = f("Video"), live = f("Livestream");
  return {
    ref, from: a28,
    sales: { now: video.now + live.now, before: video.before + live.before },
    videosSelling: all.filter((x) => x.s14 > 0).length,
    counts: { heating: by("heating").length, fading: by("fading").length, stopped: by("stopped").length, ready: ready.length },
    mix: ageMix(all),
    split: { video, live },
    lists: { heating: top(by("heating"), (x) => x.s14), fading: top(by("fading"), (x) => x.p14 - x.s14), stopped: top(by("stopped"), (x) => x.total), ready: top(ready, (x) => x.s28 || x.total) },
  };
}
