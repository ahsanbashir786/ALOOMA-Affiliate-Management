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
  const [now, before] = await Promise.all([
    cached("aff-levers", `${start}|${end}`, () => leversFor(start, end)),
    cached("aff-levers", `${prevFrom}|${prevTo}`, () => leversFor(prevFrom, prevTo)),
  ]);

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
    ref, from, to: end, days, prevFrom, prevTo, levers: { now, before }, change: explainChange(now, before), stages,
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


/** What Outreach last found (kept in settings), so the Command screen can show it without asking TikTok. */
const SUGGESTED_KEY = "outreach_suggested";
export type SuggestedHint = { eligible: number; notSure: number; own: number; at: number } | null;
export async function getSuggestedHint(): Promise<SuggestedHint> {
  const [r] = await db.select().from(settings).where(eq(settings.key, SUGGESTED_KEY));
  const v = r?.value as SuggestedHint | undefined;
  return v && typeof v.eligible === "number" ? v : null;
}
export async function saveSuggestedHint(h: NonNullable<SuggestedHint>) {
  await db.insert(settings).values({ key: SUGGESTED_KEY, value: h }).onConflictDoUpdate({ target: settings.key, set: { value: h, updatedAt: new Date() } });
}
