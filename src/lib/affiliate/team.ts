import "server-only";
import { ensureAffLines } from "@/lib/creators/aff-lines";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { cached } from "@/lib/swr";
import { loadCreatorRows } from "@/lib/creators/load";
import { kd, TL } from "@/lib/creators/sql";
import { productName } from "@/lib/products/catalog";
import { addDaysISO, dayKL, todayKL } from "@/lib/time";
import { measureOutcomes, WINDOW, type ContactEvent, type Daily } from "./outcomes";

export type LogRow = { id: number; key: string; at: string; day: string; who: string; creator: string; kind: string; action: string | null; product: string | null; reverted: boolean; seen: number | null; complete: boolean; before: number | null; after: number | null };
export type PersonRow = { id: string; name: string; today: number; week: number; contacts: number; finished: number; changePct: number | null; lift: number | null; actionsDone: number };
export type Team = {
  ref: string;
  today: string;
  activity: { today: number; week: number; waiting: number; actionsDoneWeek: number; actionsDoneToday: number };
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
  await ensureAffLines();
  const today = todayKL();
  const since = addDaysISO(today, -LOOKBACK);
  const ev = await rows<{ id: number; username: string; kind: string; at: string; user_id: string | null; name: string | null; details: Record<string, unknown> | null; reverted: boolean; synthetic: boolean }>(sql`
    select e.id, e.username, e.kind, e.at::text as at, e.user_id::text, u.name, e.details, (e.reverted_at is not null) as reverted, e.synthetic
    from staff_events e left join users u on u.id = e.user_id
    where e.at >= ${since}::date order by e.at desc, e.id desc`);
  const live = ev.filter((e) => !e.reverted && !e.synthetic);
  const contacts: ContactEvent[] = live.filter((e) => e.kind === "contacted" && typeof e.details?.action === "string").map((e) => ({ id: e.id, username: e.username, day: dayKL(e.at), userId: e.user_id, action: String(e.details!.action) }));
  // Product actions: creators ticked as contacted, and actions marked Done. Counted once, next to the contacts above.
  const epContacts = await rows<{ username: string; at: string; user_id: string | null; name: string | null; kind: string; title: string; product_key: string }>(sql`
    select tc.username, tc.contacted_at::text as at, tc.contacted_by::text as user_id, u.name, t.kind, t.title, t.product_key
    from ep_task_creators tc join ep_tasks t on t.id = tc.task_id left join users u on u.id = tc.contacted_by
    where tc.contacted_at is not null and tc.contacted_at >= ${since}::date`);
  const seenContact = new Set(contacts.map((c) => `${c.username}|${c.day}|${c.userId}`));
  let neg = 0;
  const epEv = [] as { id: number; username: string; at: string; user_id: string | null; name: string | null; title: string; product_key: string }[];
  for (const c of epContacts) {
    const day = dayKL(c.at), k = `${c.username}|${day}|${c.user_id}`;
    if (seenContact.has(k)) continue;
    seenContact.add(k);
    const id = --neg;
    contacts.push({ id, username: c.username, day, userId: c.user_id, action: "Product Action" });
    epEv.push({ id, username: c.username, at: c.at, user_id: c.user_id, name: c.name, title: c.title, product_key: c.product_key });
  }
  const doneEv = await rows<{ id: number; at: string; user_id: string | null; name: string | null; title: string; product_key: string }>(sql`
    select e.id::int, e.created_at::text as at, e.user_id::text, u.name, t.title, t.product_key
    from ep_events e join ep_tasks t on t.id = e.task_id left join users u on u.id = e.user_id
    where e.kind = 'status' and e.text like 'Done%' and e.created_at >= ${since}::date`);

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
  const person = (id: string, name: string | null) => people.get(id) ?? people.set(id, { id, name: name ?? "Unknown", today: 0, week: 0, contacts: 0, finished: 0, changePct: null, lift: null, actionsDone: 0, evs: [] }).get(id)!;
  for (const e of [...live.filter((x) => x.kind === "contacted"), ...epEv.map((x) => ({ ...x, kind: "contacted" }))]) {
    const p = person(e.user_id ?? "none", e.name);
    if (day(e) === today) p.today++;
    if (day(e) >= weekAgo) p.week++;
    p.contacts++;
  }
  for (const d of doneEv) { const p = person(d.user_id ?? "none", d.name); p.actionsDone++; }
  for (const c of contacts) people.get(c.userId ?? "none")?.evs.push(c);
  const personRows: PersonRow[] = [...people.values()].map(({ evs, ...p }) => {
    const o = measureOutcomes(evs, daily, ref);
    // Each person is compared with everyone nobody contacted, so this is that person's own effect.
    return { ...p, finished: o.worked.events, changePct: o.worked.changePct, lift: o.lift };
  }).sort((a, b) => b.week - a.week || a.name.localeCompare(b.name));

  const baseLog: (LogRow & { at: string })[] = ev.slice(0, 60).map((e) => {
    const r = out.results.get(e.id);
    return {
      id: e.id, key: `s${e.id}`, at: e.at, day: day(e), who: e.name ?? (e.synthetic ? "System" : "Unknown"), creator: e.username, kind: e.kind,
      action: typeof e.details?.action === "string" ? e.details.action : null, product: typeof e.details?.product === "string" ? e.details.product : null,
      reverted: e.reverted, seen: r?.seen ?? null, complete: r?.complete ?? false, before: r?.before ?? null, after: r?.after ?? null,
    };
  });
  const extra: LogRow[] = [
    ...epEv.map((e) => ({ id: e.id, key: `p${-e.id}`, at: e.at, day: day(e), who: e.name ?? "Unknown", creator: e.username, kind: "contacted", action: "Product Action", product: productName(e.product_key), reverted: false, seen: out.results.get(e.id)?.seen ?? null, complete: out.results.get(e.id)?.complete ?? false, before: out.results.get(e.id)?.before ?? null, after: out.results.get(e.id)?.after ?? null })),
    ...doneEv.map((d) => ({ id: -1_000_000 - d.id, key: `d${d.id}`, at: d.at, day: day(d), who: d.name ?? "Unknown", creator: "", kind: "task_done", action: d.title, product: productName(d.product_key), reverted: false, seen: null, complete: false, before: null, after: null })),
  ];
  const log: LogRow[] = [...baseLog, ...extra].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  const waiting = new Set(contacts.filter((c) => !out.results.get(c.id)?.complete).map((c) => c.username)).size;
  return {
    ref, today,
    activity: {
      today: live.filter((e) => e.kind === "contacted" && day(e) === today).length + epEv.filter((e) => day(e) === today).length,
      week: live.filter((e) => e.kind === "contacted" && day(e) >= weekAgo).length + epEv.filter((e) => day(e) >= weekAgo).length,
      waiting, actionsDoneToday: doneEv.filter((d) => day(d) === today).length, actionsDoneWeek: doneEv.filter((d) => day(d) >= weekAgo).length,
    },
    people: personRows, log,
    overall: { finished: out.worked.events, creators: out.worked.creators, before: out.worked.before, after: out.worked.after, changePct: out.worked.changePct, controlPct: out.control.changePct, lift: out.lift },
    byAction: out.byAction.map((a) => ({ action: a.action, events: a.worked.events, changePct: a.worked.changePct, lift: a.lift })),
  };
}
