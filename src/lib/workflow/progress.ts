import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { addDaysISO, dayKL, todayKL } from "@/lib/time";
import { getCommitments } from "./commitments";
import { loadEvents } from "./events";
import { replayEvents } from "./replay";
import { getWorkflowSettings } from "./settings";

export type ProgressWindow = { start: string; end: string; days: number };

export type Progress = {
  window: ProgressWindow;
  previous: ProgressWindow;
  /** Staff-confirmed: recorded by a person pressing a button. */
  staff: {
    followUpsDue: number;
    onTime: number;
    late: number;
    overdueOpen: number;
    creatorsContacted: number;
    contactActions: number;
    promisesRecorded: number;
    byPerson: { name: string; contacts: number; creators: number; promises: number; followUpsOnTime: number }[];
  };
  /** Promises whose promised date falls in the window. */
  promises: { due: number; fulfilledOnTime: number; fulfilledLate: number; open: number; bySystem: number; byStaff: number };
  /** System-detected: content seen in the data. */
  content: { afterContact: number; allVerified: number };
  sales: {
    coverageStart: string | null;
    coverageEnd: string | null;
    previousCovered: boolean;
    newlySelling: number | null;
    reactivated: number | null;
    managed: number;
    managedNow: number | null;
    managedBefore: number | null;
    managedGrowing: number | null;
    managedFalling: number | null;
  };
};

export const PROGRESS_RANGES = [7, 28, 90] as const;

export async function getProgress(days: number, endDay?: string): Promise<Progress> {
  const end = endDay ?? todayKL();
  const start = addDaysISO(end, -(days - 1));
  const window = { start, end, days };
  const previous = { start: addDaysISO(start, -days), end: addDaysISO(start, -1), days };
  const [cfg, events, comms, usersRows] = await Promise.all([
    getWorkflowSettings(),
    loadEvents(),
    getCommitments(),
    rows<{ id: string; name: string }>(sql`select id::text, name from users`),
  ]);
  const userName = new Map(usersRows.map((u) => [u.id, u.name]));
  const inWin = (d: string) => d >= start && d <= end;

  // ── staff actions and follow-ups (replayed from the same event log the daily screen uses) ──
  const by = new Map<string, typeof events>();
  for (const e of events) by.set(e.username, [...(by.get(e.username) ?? []), e]);
  let due = 0, onTime = 0, late = 0, overdueOpen = 0;
  const today = todayKL();
  const person = new Map<string, { contacts: number; creators: Set<string>; promises: number; onTime: number }>();
  const slot = (id: string | null) => {
    const k = id ? (userName.get(id) ?? "Unknown") : "Unknown";
    if (!person.has(k)) person.set(k, { contacts: 0, creators: new Set(), promises: 0, onTime: 0 });
    return person.get(k)!;
  };
  for (const [u, list] of by) {
    for (const f of replayEvents(u, list, cfg).followups) {
      if (f.kind === "resume") continue;
      if (f.dueOn >= start && f.dueOn <= end) {
        due++;
        if (f.completedAt) {
          if (f.onTime) onTime++;
          else late++;
        } else if (f.dueOn < today) overdueOpen++;
      }
    }
  }
  const contacted = new Set<string>();
  let contactActions = 0, promisesRecorded = 0;
  for (const e of events) {
    if (e.revertedAt || !inWin(dayKL(e.at))) continue;
    if (e.kind === "contacted") {
      contactActions++;
      contacted.add(e.username);
      const p = slot(e.userId);
      p.contacts++;
      p.creators.add(e.username);
    }
    if (e.kind === "promised") {
      promisesRecorded++;
      slot(e.userId).promises++;
    }
  }
  // follow-ups completed on time, credited to the person who completed them
  for (const [u, list] of by) {
    const sorted = list.filter((e) => !e.revertedAt).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
    const fl = replayEvents(u, list, cfg).followups.filter((f) => f.completedAt && f.onTime && f.kind !== "resume" && inWin(f.dueOn));
    for (const f of fl) {
      const closer = sorted.find((e) => f.completedAt && e.at.getTime() === f.completedAt.getTime());
      slot(closer?.userId ?? null).onTime++;
    }
  }

  // ── promises ──
  const pw = comms.filter((c) => inWin(c.promisedOn));
  const promises = {
    due: pw.length,
    fulfilledOnTime: pw.filter((c) => c.state === "fulfilled" && c.onTime).length,
    fulfilledLate: pw.filter((c) => c.state === "fulfilled" && c.onTime === false).length,
    open: pw.filter((c) => c.state !== "fulfilled").length,
    bySystem: pw.filter((c) => c.contentSource === "system").length,
    byStaff: pw.filter((c) => c.contentSource === "staff").length,
  };

  // ── content: each piece counted once, only if the creator had been contacted before it appeared ──
  const [cont] = await rows<{ after: number; all: number }>(sql`
    with pieces as (
      select sc.content_id, s.creator, min(sc.posted_at) as at
      from sample_content sc join samples s on s.id = sc.sample_id
      where sc.confidence = 'confirmed' and sc.posted_at is not null
        and not exists (select 1 from content_decisions d where d.decision = 'rejected' and d.reverted_at is null and d.sample_id = sc.sample_id and d.content_id = sc.content_id)
      group by sc.content_id, s.creator
      union
      select coalesce(d.content_id, 'decision:' || d.id), d.username, d.at at time zone 'Asia/Kuala_Lumpur'
      from content_decisions d where d.decision = 'verified' and d.reverted_at is null
    )
    select
      (count(distinct content_id) filter (where exists (
        select 1 from staff_events e where e.username = p.creator and e.kind = 'contacted' and e.reverted_at is null
          and (e.at at time zone 'Asia/Kuala_Lumpur') < p.at)))::int as after,
      count(distinct content_id)::int as "all"
    from pieces p where p.at::date between ${start}::date and ${end}::date`);

  // ── sales: observation coverage first, then movement ──
  const [cov] = await rows<{ first: string | null; last: string | null }>(sql`
    select to_char(min(created_at), 'YYYY-MM-DD') as first, to_char(max(created_at), 'YYYY-MM-DD') as last from order_lines`);
  const coverageStart = cov?.first ?? null;
  const previousCovered = !!coverageStart && coverageStart <= previous.start;
  const lookBackStart = addDaysISO(start, -28);
  const lookBackCovered = !!coverageStart && coverageStart <= lookBackStart;
  let newlySelling: number | null = null;
  let reactivated: number | null = null;
  if (coverageStart) {
    const [r] = await rows<{ newly: number; react: number }>(sql`
      with s as (
        select al.creator,
          min(al.created_at) filter (where al.valid) as first_sale,
          bool_or(al.valid and al.created_at::date between ${start}::date and ${end}::date) as sells_now,
          bool_or(al.valid and al.created_at::date between ${lookBackStart}::date and ${addDaysISO(start, -1)}::date) as sold_before_28,
          bool_or(al.valid and al.created_at::date < ${lookBackStart}::date) as sold_earlier
        from ${AL} where al.creator is not null group by al.creator
      )
      select
        (count(*) filter (where sells_now and not coalesce(sold_before_28, false) and not coalesce(sold_earlier, false)))::int as newly,
        (count(*) filter (where sells_now and not coalesce(sold_before_28, false) and coalesce(sold_earlier, false)))::int as react
      from s`);
    // "first observed sale" is only meaningful when we can see 28 days before the window
    newlySelling = lookBackCovered ? r.newly : null;
    reactivated = lookBackCovered ? r.react : null;
  }
  const [man] = await rows<{ n: number; now: number | null; before: number | null; up: number | null; down: number | null }>(sql`
    with managed as (select distinct username from staff_events where kind = 'contacted' and reverted_at is null and (at at time zone 'Asia/Kuala_Lumpur')::date <= ${end}::date),
    g as (
      select m.username,
        coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${start}::date and ${end}::date), 0) as now,
        coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${previous.start}::date and ${previous.end}::date), 0) as before
      from managed m left join ${AL} on al.creator = m.username group by m.username
    )
    select (select count(*) from managed)::int as n, sum(now)::float8 as now, sum(before)::float8 as before,
      (count(*) filter (where now > before))::int as up, (count(*) filter (where now < before))::int as down from g`);

  return {
    window,
    previous,
    staff: {
      followUpsDue: due, onTime, late, overdueOpen,
      creatorsContacted: contacted.size, contactActions, promisesRecorded,
      byPerson: [...person].map(([name, p]) => ({ name, contacts: p.contacts, creators: p.creators.size, promises: p.promises, followUpsOnTime: p.onTime })).sort((a, b) => b.contacts - a.contacts),
    },
    promises,
    content: { afterContact: cont?.after ?? 0, allVerified: cont?.all ?? 0 },
    sales: {
      coverageStart, coverageEnd: cov?.last ?? null, previousCovered, newlySelling, reactivated,
      managed: man?.n ?? 0,
      managedNow: previousCovered ? (man?.now ?? 0) : null,
      managedBefore: previousCovered ? (man?.before ?? 0) : null,
      managedGrowing: previousCovered ? (man?.up ?? 0) : null,
      managedFalling: previousCovered ? (man?.down ?? 0) : null,
    },
  };
}
