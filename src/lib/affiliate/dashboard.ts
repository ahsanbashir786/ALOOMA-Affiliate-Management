import "server-only";
import { ensureAffLines } from "@/lib/creators/aff-lines";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { cached } from "@/lib/swr";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, TL } from "@/lib/creators/sql";
import { addDaysISO, fmtDayLabel } from "@/lib/time";
import { oldShare, type Bucket } from "@/lib/products/diagnose";
import { daysInStage, stageOf, STAGES, type StageKey } from "./stages";
import { sampleGuard, getSuggestedHint, type SampleGuard, type SuggestedHint } from "./command";
import { headline, healthChecks, resolveWindow, type Check, type Kpis } from "./dashboard-logic";

const WEEKS = 12;
const emptyB = (): Record<Bucket, number> => ({ new: 0, recent: 0, old: 0, veryold: 0, live: 0, other: 0 });

export type Week = { label: string; start: string; sales: number; creators: number; videos: number; b: Record<Bucket, number> };
export type StageCount = { creators: number; sales28: number; avgDays: number | null };
export type Dashboard = {
  ref: string;
  window: ReturnType<typeof resolveWindow>;
  now: Kpis;
  before: Kpis;
  weeks: Week[];
  checks: Check[];
  headline: string;
  stages: Record<StageKey, StageCount>;
  guard: SampleGuard;
  hint: SuggestedHint;
};

type Window = { start: string; end: string };

/** Active creators (made a sale), sales, and new videos + LIVE sessions posted, for one window. */
async function kpisFor(w: Window): Promise<{ sales: number; creators: number; videos: number }> {
  const [r] = await rows<{ sales: number; creators: number; videos: number }>(sql`
    select
      (select coalesce(sum(tl.pay), 0) from ${TL} where tl.valid and tl.creator is not null and ${kd("tl.created_at")} between ${w.start}::date and ${w.end}::date)::float8 as sales,
      (select count(*) from (select tl.creator from ${TL} where tl.valid and tl.creator is not null and ${kd("tl.created_at")} between ${w.start}::date and ${w.end}::date group by 1 having sum(tl.pay) > 0) x)::int as creators,
      ((select count(*) from tt_videos v where ${kd("v.posted_at")} between ${w.start}::date and ${w.end}::date)
       + (select count(*) from tt_lives l where ${kd("l.started_at")} between ${w.start}::date and ${w.end}::date))::int as videos`);
  return { sales: r?.sales ?? 0, creators: r?.creators ?? 0, videos: r?.videos ?? 0 };
}

/** Sales split by how old the video was when it sold (the same ages as Product Analysis), by week or for the whole window. */
async function ageSplit(from: string, to: string, byWeek: boolean, end: string): Promise<{ w: number; b: Bucket; g: number }[]> {
  return rows<{ w: number; b: Bucket; g: number }>(sql`
    with s as (
      select tl.content_id, tl.content_type, ${kd("tl.created_at")} as d, tl.pay from ${TL}
      where tl.valid and tl.creator is not null and ${kd("tl.created_at")} between ${from}::date and ${to}::date
    ), f as (
      select a.content_id, min(${kd("a.created_at")}) as fs from tt_affiliate_order_lines a where a.content_id in (select content_id from s where content_id is not null) group by 1
    )
    select ${byWeek ? sql`floor((${end}::date - s.d) / 7)::int` : sql`0`} as w,
      case when s.content_type = 'Livestream' then 'live' when s.content_id is null then 'other'
        when (s.d - coalesce(${kd("v.posted_at")}, f.fs)) <= 14 then 'new' when (s.d - coalesce(${kd("v.posted_at")}, f.fs)) <= 30 then 'recent'
        when (s.d - coalesce(${kd("v.posted_at")}, f.fs)) <= 60 then 'old' else 'veryold' end as b,
      coalesce(sum(s.pay), 0)::float8 as g
    from s left join tt_videos v on v.video_id = s.content_id left join f on f.content_id = s.content_id group by 1, 2`);
}

async function weekly(end: string): Promise<Week[]> {
  const from = addDaysISO(end, -(WEEKS * 7 - 1));
  const [sales, posts, ages] = await Promise.all([
    rows<{ w: number; g: number; c: number }>(sql`
      select floor((${end}::date - ${kd("tl.created_at")}) / 7)::int as w, coalesce(sum(tl.pay), 0)::float8 as g, count(distinct tl.creator)::int as c
      from ${TL} where tl.valid and tl.creator is not null and ${kd("tl.created_at")} between ${from}::date and ${end}::date group by 1`),
    rows<{ w: number; n: number }>(sql`
      select w, count(*)::int as n from (
        select floor((${end}::date - ${kd("v.posted_at")}) / 7)::int as w from tt_videos v where ${kd("v.posted_at")} between ${from}::date and ${end}::date
        union all select floor((${end}::date - ${kd("l.started_at")}) / 7)::int from tt_lives l where ${kd("l.started_at")} between ${from}::date and ${end}::date) x group by 1`),
    ageSplit(from, end, true, end),
  ]);
  const out: Week[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = addDaysISO(end, -(i * 7 + 6));
    const b = emptyB();
    for (const a of ages) if (a.w === i) b[a.b] += a.g;
    out.push({ label: fmtDayLabel(start), start, sales: sales.find((x) => x.w === i)?.g ?? 0, creators: sales.find((x) => x.w === i)?.c ?? 0, videos: posts.find((x) => x.w === i)?.n ?? 0, b });
  }
  return out;
}

export async function loadDashboard(range?: { start: string; end: string }): Promise<Dashboard | null> {
  await ensureAffLines();
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const window = resolveWindow(range, ref);
  const cur = { start: window.start, end: window.end }, prev = { start: window.prevStart, end: window.prevEnd };
  const [k1, k0, weeks, ageNow, agePrev, hint] = await Promise.all([
    cached("aff-kpi", `${cur.start}|${cur.end}`, () => kpisFor(cur)),
    cached("aff-kpi", `${prev.start}|${prev.end}`, () => kpisFor(prev)),
    cached("aff-weeks", window.end, () => weekly(window.end)),
    cached("aff-age", `${cur.start}|${cur.end}`, () => ageSplit(cur.start, cur.end, false, cur.end)),
    cached("aff-age", `${prev.start}|${prev.end}`, () => ageSplit(prev.start, prev.end, false, prev.end)),
    getSuggestedHint(),
  ]);
  const bucket = (xs: { b: Bucket; g: number }[]) => { const b = emptyB(); for (const x of xs) b[x.b] += x.g; return b; };
  const now: Kpis = { ...k1, oldShare: oldShare(bucket(ageNow)) }, before: Kpis = { ...k0, oldShare: oldShare(bucket(agePrev)) };

  const stages = Object.fromEntries(STAGES.map((s) => [s.key, { creators: 0, sales28: 0, avgDays: null as number | null }])) as Record<StageKey, StageCount>;
  const sums = new Map<StageKey, { n: number; sum: number }>();
  for (const r of all) {
    const s = stageOf(r);
    stages[s].creators++; stages[s].sales28 += r.extra?.gmv28 ?? 0;
    const d = daysInStage(r, s, ref);
    if (d != null) { const e = sums.get(s) ?? { n: 0, sum: 0 }; e.n++; e.sum += d; sums.set(s, e); }
  }
  for (const [k, e] of sums) stages[k].avgDays = Math.round(e.sum / e.n);

  const checks = healthChecks(now, before);
  return { ref, window, now, before, weeks, checks, headline: headline(checks), stages, guard: sampleGuard(all), hint };
}
