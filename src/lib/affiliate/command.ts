import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { rows } from "@/lib/sql";
import { loadCreatorRows } from "@/lib/creators/load";
import type { DirRow } from "@/lib/creators/workflow/directory";
import { kd, TL } from "@/lib/creators/sql";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { cached } from "@/lib/swr";
import { baselineOf, buildQueue, splitQueue } from "./actions";
import { explainChange, stageOf, daysInStage, STAGES, type Levers, type StageKey } from "./stages";

const TARGET_KEY = "affiliate_target";
export const getAffiliateTarget = async (): Promise<number | null> => {
  const [r] = await db.select().from(settings).where(eq(settings.key, TARGET_KEY));
  const v = Number((r?.value as { sales28?: number } | undefined)?.sales28);
  return Number.isFinite(v) && v > 0 ? v : null;
};
export async function saveAffiliateTarget(sales28: number | null) {
  if (sales28 == null) await db.delete(settings).where(eq(settings.key, TARGET_KEY));
  else await db.insert(settings).values({ key: TARGET_KEY, value: { sales28 } }).onConflictDoUpdate({ target: settings.key, set: { value: { sales28 }, updatedAt: new Date() } });
}

export type StageRow = { username: string; days: number | null; sales28: number; gmvAll: number; followers: number | null; videos28: number; lines: string[] };
export type StageSummary = { key: StageKey; creators: number; sales28: number; avgDays: number | null; top: StageRow[] };
export type SampleGuard = { notPosted: number; noSale: number; soldThenQuiet: number; creators: number; requestsWaiting: number; high: boolean };
export type Command = {
  ref: string;
  from: string;
  to: string;
  days: number;
  prevFrom: string;
  prevTo: string;
  levers: { now: Levers; before: Levers };
  change: ReturnType<typeof explainChange>;
  target: { value: number; custom: boolean; basis: string };
  stages: StageSummary[];
  guard: SampleGuard;
  creators: number;
};

/** Creators who have to be at least this share of sample-holders for the guard to say "fix the old samples first". */
const GUARD_HIGH = 25;


/** The sample guard counts product lines (creator + product), because one creator can hold several samples. */
export function sampleGuard(all: DirRow[]): SampleGuard {
  let notPosted = 0, noSale = 0, soldThenQuiet = 0, sampled = 0, requestsWaiting = 0;
  const holders = new Set<string>();
  for (const r of all) {
    requestsWaiting += r.extra?.requestsOpen ?? 0;
    for (const l of r.lines) {
      if (!l.sampled) continue;
      sampled++;
      if (l.status === "Silent") { notPosted++; holders.add(r.username); }
      else if (l.status === "Posted") { noSale++; holders.add(r.username); }
      else if (l.status === "Quiet") { soldThenQuiet++; holders.add(r.username); }
    }
  }
  const stuckShare = sampled ? ((notPosted + noSale) / sampled) * 100 : 0;
  return { notPosted, noSale, soldThenQuiet, creators: holders.size, requestsWaiting, high: stuckShare >= GUARD_HIGH };
}

function rowFor(r: DirRow, stage: StageKey, ref: string): StageRow {
  return {
    username: r.username, days: daysInStage(r, stage, ref), sales28: r.extra?.gmv28 ?? 0, gmvAll: r.gmvAll, followers: r.extra?.followers ?? null, videos28: r.extra?.videos28 ?? 0,
    lines: r.lines.filter((l) => !l.noSample && (stage === "notposted" ? l.status === "Silent" : stage === "nosale" ? l.status === "Posted" : stage === "way" ? l.status === "Waiting" : true)).map((l) => l.name).slice(0, 3),
  };
}

export async function loadStageList(stage: StageKey, limit = 100): Promise<{ ref: string; rows: StageRow[]; total: number } | null> {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const rs = all.filter((r) => stageOf(r) === stage).map((r) => rowFor(r, stage, ref));
  const stuck = stage === "notposted" || stage === "nosale" || stage === "way" || stage === "quiet";
  rs.sort((a, b) => (stuck ? (b.days ?? -1) - (a.days ?? -1) || b.gmvAll - a.gmvAll : b.sales28 - a.sales28 || b.gmvAll - a.gmvAll));
  return { ref, rows: rs.slice(0, limit), total: rs.length };
}

/** Active sellers, the videos and LIVE sessions they posted, and their sales, for any window of days. */
async function leversFor(start: string, end: string): Promise<Levers> {
  const [r] = await rows<{ sellers: number; sales: number; posts: number }>(sql`
    with s as (select tl.creator, sum(tl.pay) as g from ${TL} where tl.valid and tl.creator is not null and ${kd("tl.created_at")} between ${start}::date and ${end}::date group by 1 having sum(tl.pay) > 0)
    select (select count(*) from s)::int as sellers, (select coalesce(sum(g), 0) from s)::float8 as sales,
      ((select count(*) from tt_videos v where v.creator in (select creator from s) and ${kd("v.posted_at")} between ${start}::date and ${end}::date)
       + (select count(*) from tt_lives l where l.creator in (select creator from s) and ${kd("l.started_at")} between ${start}::date and ${end}::date))::int as posts`);
  return { sellers: r?.sellers ?? 0, posts: r?.posts ?? 0, sales: r?.sales ?? 0 };
}

/** The chosen dates (or the last 28 days of data) against the same number of days just before. */
export async function loadCommand(range?: { start: string; end: string }): Promise<Command | null> {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const end = range?.end && range.end <= ref ? range.end : range?.end ? ref : ref;
  const start = range?.start && range.start <= end ? range.start : addDaysISO(end, -27);
  const days = daysBetweenISO(start, end) + 1;
  const from = start, prevTo = addDaysISO(start, -1), prevFrom = addDaysISO(prevTo, -(days - 1));
  const thirdFrom = addDaysISO(ref, -83);

  const [windows, custom, now, before] = await Promise.all([
    rows<{ w: number; g: number }>(sql`
      select floor((${ref}::date - ${kd("tl.created_at")}) / 28)::int as w, coalesce(sum(tl.pay) filter (where tl.valid), 0)::float8 as g
      from ${TL} where tl.creator is not null and ${kd("tl.created_at")} between ${thirdFrom}::date and ${ref}::date group by 1`),
    getAffiliateTarget(),
    cached("aff-levers", `${start}|${end}`, () => leversFor(start, end)),
    cached("aff-levers", `${prevFrom}|${prevTo}`, () => leversFor(prevFrom, prevTo)),
  ]);

  // The goal is per 28 days; for other lengths it is scaled to the number of days chosen.
  const sums = windows.filter((w) => w.w >= 0 && w.w <= 2).map((w) => w.g).filter((g) => g > 0);
  const trend = sums.length ? sums.reduce((n, g) => n + g, 0) / sums.length : now.sales;
  const per28 = custom ?? Math.round(trend);
  const target = { value: Math.round((per28 * days) / 28), custom: custom != null, basis: custom != null ? "Set by you" : sums.length > 1 ? `Average of the last ${sums.length} periods of 28 days` : "This period (no earlier data yet)" };

  const buckets = new Map<StageKey, { r: DirRow; days: number | null }[]>(STAGES.map((s) => [s.key, []]));
  for (const r of all) { const s = stageOf(r); buckets.get(s)!.push({ r, days: daysInStage(r, s, ref) }); }
  const stages: StageSummary[] = STAGES.map((s) => {
    const list = buckets.get(s.key)!;
    const ds = list.map((x) => x.days).filter((d): d is number => d != null);
    const stuck = s.key === "notposted" || s.key === "nosale" || s.key === "way" || s.key === "quiet";
    const top = [...list].sort((a, b) => (stuck ? (b.days ?? -1) - (a.days ?? -1) : (b.r.extra?.gmv28 ?? 0) - (a.r.extra?.gmv28 ?? 0))).slice(0, 5).map((x) => rowFor(x.r, s.key, ref));
    return { key: s.key, creators: list.length, sales28: list.reduce((n, x) => n + (x.r.extra?.gmv28 ?? 0), 0), avgDays: ds.length ? Math.round(ds.reduce((n, d) => n + d, 0) / ds.length) : null, top };
  });

  const guard = sampleGuard(all);

  return {
    ref, from, to: end, days, prevFrom, prevTo, levers: { now, before }, change: explainChange(now, before), target, stages,
    guard,
    creators: all.length,
  };
}

export async function loadQueue() {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const baseline = baselineOf(all);
  const guard = sampleGuard(all);
  const queue = splitQueue(buildQueue(all, ref, baseline), todayKL(), guard.high);
  return { ref, guard, queue, baseline };
}
