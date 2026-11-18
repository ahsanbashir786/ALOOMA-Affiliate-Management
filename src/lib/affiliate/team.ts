import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { cached } from "@/lib/swr";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, TL } from "@/lib/creators/sql";
import { addDaysISO, dayKL, todayKL } from "@/lib/time";
import { measureOutcomes, WINDOW, type ContactEvent, type Daily } from "./outcomes";

export type LogRow = { id: number; at: string; day: string; who: string; creator: string; kind: string; action: string | null; product: string | null; reverted: boolean; seen: number | null; complete: boolean; before: number | null; after: number | null };
export type PersonRow = { id: string; name: string; today: number; week: number; contacts: number; finished: number; changePct: number | null; lift: number | null };
export type Team = {
  ref: string;
  today: string;
  activity: { today: number; week: number; waiting: number };
  people: PersonRow[];
  log: LogRow[];
  overall: { finished: number; creators: number; before: number; after: number; changePct: number | null; controlPct: number | null; lift: number | null };
  byAction: { action: string; events: number; changePct: number | null; lift: number | null }[];
};

const LOOKBACK = 90;

export async function loadTeam(): Promise<Team | null> {
  const { ref } = await loadCreatorRows();
  if (!ref) return null;
  const [stamp] = await rows<{ n: number }>(sql`select (coalesce(max(id), 0) + count(reverted_at))::int as n from staff_events`);
  return cached("aff-team", ref, () => compute(ref), stamp?.n ?? 0);
}

async function compute(ref: string): Promise<Team> {
  const today = todayKL();
  const since = addDaysISO(today, -LOOKBACK);
  const ev = await rows<{ id: number; username: string; kind: string; at: string; user_id: string | null; name: string | null; details: Record<string, unknown> | null; reverted: boolean; synthetic: boolean }>(sql`
    select e.id, e.username, e.kind, e.at::text as at, e.user_id::text, u.name, e.details, (e.reverted_at is not null) as reverted, e.synthetic
    from staff_events e left join users u on u.id = e.user_id
    where e.at >= ${since}::date order by e.at desc, e.id desc`);
  const live = ev.filter((e) => !e.reverted && !e.synthetic);
  const contacts: ContactEvent[] = live.filter((e) => e.kind === "contacted" && typeof e.details?.action === "string").map((e) => ({ id: e.id, username: e.username, day: dayKL(e.at), userId: e.user_id, action: String(e.details!.action) }));

  const dailyRows = contacts.length
    ? await rows<{ creator: string; d: string; g: number }>(sql`
        select tl.creator, to_char(${kd("tl.created_at")}, 'YYYY-MM-DD') as d, coalesce(sum(tl.pay) filter (where tl.valid), 0)::float8 as g
        from ${TL} where tl.creator is not null and ${kd("tl.created_at")} >= ${addDaysISO(since, -WINDOW)}::date group by 1, 2`)
    : [];
  const daily: Daily = new Map();
  for (const r of dailyRows) (daily.get(r.creator) ?? daily.set(r.creator, new Map()).get(r.creator)!).set(r.d, r.g);
  const out = measureOutcomes(contacts, daily, ref);

  const weekAgo = addDaysISO(today, -6);
  const day = (e: { at: string }) => dayKL(e.at);
  const people = new Map<string, PersonRow & { evs: ContactEvent[] }>();
  for (const e of live.filter((x) => x.kind === "contacted")) {
    const id = e.user_id ?? "none";
    const p = people.get(id) ?? { id, name: e.name ?? "Unknown", today: 0, week: 0, contacts: 0, finished: 0, changePct: null, lift: null, evs: [] };
    if (day(e) === today) p.today++;
    if (day(e) >= weekAgo) p.week++;
    p.contacts++;
    people.set(id, p);
  }
  for (const c of contacts) people.get(c.userId ?? "none")?.evs.push(c);
  const personRows: PersonRow[] = [...people.values()].map(({ evs, ...p }) => {
    const o = measureOutcomes(evs, daily, ref);
    // Each person is compared with everyone nobody contacted, so this is that person's own effect.
    return { ...p, finished: o.worked.events, changePct: o.worked.changePct, lift: o.lift };
  }).sort((a, b) => b.week - a.week || a.name.localeCompare(b.name));

  const log: LogRow[] = ev.slice(0, 60).map((e) => {
    const r = out.results.get(e.id);
    return {
      id: e.id, at: e.at, day: day(e), who: e.name ?? (e.synthetic ? "System" : "Unknown"), creator: e.username, kind: e.kind,
      action: typeof e.details?.action === "string" ? e.details.action : null, product: typeof e.details?.product === "string" ? e.details.product : null,
      reverted: e.reverted, seen: r?.seen ?? null, complete: r?.complete ?? false, before: r?.before ?? null, after: r?.after ?? null,
    };
  });
  const waiting = new Set(contacts.filter((c) => !out.results.get(c.id)?.complete).map((c) => c.username)).size;
  return {
    ref, today,
    activity: { today: live.filter((e) => e.kind === "contacted" && day(e) === today).length, week: live.filter((e) => e.kind === "contacted" && day(e) >= weekAgo).length, waiting },
    people: personRows, log,
    overall: { finished: out.worked.events, creators: out.worked.creators, before: out.worked.before, after: out.worked.after, changePct: out.worked.changePct, controlPct: out.control.changePct, lift: out.lift },
    byAction: out.byAction.map((a) => ({ action: a.action, events: a.worked.events, changePct: a.worked.changePct, lift: a.lift })),
  };
}
