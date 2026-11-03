import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { comparable, coveredDays, intersect, type Comparable, type Span } from "@/lib/coverage";
import { addDaysISO, dayKL, todayKL } from "@/lib/time";
import { getCommitments } from "./commitments";
import { loadEvents } from "./events";
import { replayEvents } from "./replay";
import { getWorkflowSettings } from "./settings";

export type ProgressWindow = { start: string; end: string; days: number };

export type Progress = {
  window: ProgressWindow;
  /**
   * Follow-ups whose due date falls in the window, by how they ended.
   *   On-time rate = onTime ÷ (onTime + late + overdueOpen).
   *   Numerator: follow-ups completed through a recorded Contacted (or a promised date given by the creator) on or before the due day (KL).
   *   Denominator: all follow-ups that were really worked or missed – completed on time, completed late, and still overdue.
   *   NOT in the denominator (shown separately): rescheduled, paused/cancelled, resolved automatically, not yet due.
   */
  followUps: {
    due: number;
    onTime: number;
    late: number;
    overdueOpen: number;
    rescheduled: number;
    pausedOrCancelled: number;
    resolvedAutomatically: number;
    notYetDue: number;
    onTimeRate: number | null;
  };
  staff: {
    creatorsContacted: number;
    contactActions: number;
    promisesRecorded: number;
    deadlinesMoved: number;
    byPerson: { name: string; contacts: number; creators: number; promises: number; followUpsOnTime: number }[];
  };
  /** Promises whose CURRENT deadline falls in the window. A reschedule is not a new promise. */
  promises: {
    due: number;
    fulfilledOnTime: number;
    fulfilledLate: number;
    fulfilledTimingUnknown: number;
    partial: number;
    toReview: number;
    overdueOpen: number;
    notYetDue: number;
    bySystem: number;
    byStaff: number;
    withoutSample: number;
    withoutSampleFulfilled: number;
  };
  /** One row per distinct content piece (video or LIVE), samples or not. "After outreach" is timing only, never causation. */
  content: {
    total: number;
    postedAfterContact: number;
    undatedSeenAfterContact: number;
    confirmedByStaff: number;
    fromCreatorsWithoutSamples: number;
    videoReportCoverage: { covered: number; total: number };
  };
  sales: {
    comparison: Comparable;
    coverage: { affiliate: number; shop: number; total: number };
    newlySelling: number | null;
    reactivated: number | null;
    historyNote: string | null;
    managed: number;
    managedNow: number | null;
    managedBefore: number | null;
    managedGrowing: number | null;
    managedFalling: number | null;
  };
};

export const PROGRESS_RANGES = [7, 28, 90] as const;

async function spans(kind: string): Promise<Span[]> {
  const r = await rows<{ s: string; e: string }>(sql`
    select to_char(period_start, 'YYYY-MM-DD') as s, to_char(period_end, 'YYYY-MM-DD') as e from uploads
    where kind = ${kind} and period_start is not null and period_end is not null`);
  return r.map((x) => ({ start: x.s, end: x.e }));
}

export async function getProgress(days: number, endDay?: string): Promise<Progress> {
  const end = endDay ?? todayKL();
  const start = addDaysISO(end, -(days - 1));
  const window = { start, end, days };
  const today = todayKL();
  const [cfg, events, comms, usersRows] = await Promise.all([
    getWorkflowSettings(),
    loadEvents(),
    getCommitments(),
    rows<{ id: string; name: string }>(sql`select id::text, name from users`),
  ]);
  const userName = new Map(usersRows.map((u) => [u.id, u.name]));
  const inWin = (d: string) => d >= start && d <= end;
  const fulfilledByKey = new Map(comms.map((c) => [c.eventId, c.state === "fulfilled"]));

  // ── follow-ups, replayed from the same event log the daily screen uses ──
  const by = new Map<string, typeof events>();
  for (const e of events) by.set(e.username, [...(by.get(e.username) ?? []), e]);
  const fu = { due: 0, onTime: 0, late: 0, overdueOpen: 0, rescheduled: 0, pausedOrCancelled: 0, resolvedAutomatically: 0, notYetDue: 0 };
  const person = new Map<string, { contacts: number; creators: Set<string>; promises: number; onTime: number }>();
  const slot = (id: string | null) => {
    const k = id ? (userName.get(id) ?? "Unknown") : "Unknown";
    if (!person.has(k)) person.set(k, { contacts: 0, creators: new Set(), promises: 0, onTime: 0 });
    return person.get(k)!;
  };
  for (const [u, list] of by) {
    const sorted = list.filter((e) => !e.revertedAt).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
    for (const f of replayEvents(u, list, cfg).followups) {
      if (f.kind === "resume" || !inWin(f.dueOn)) continue;
      fu.due++;
      if (f.outcome === "completed") {
        if (f.onTime) {
          fu.onTime++;
          const closer = sorted.find((e) => f.completedAt && e.at.getTime() === f.completedAt.getTime());
          slot(closer?.userId ?? null).onTime++;
        } else fu.late++;
      } else if (f.outcome === "rescheduled") fu.rescheduled++;
      else if (f.outcome === "paused" || f.outcome === "cancelled") fu.pausedOrCancelled++;
      else if (f.kind === "promise" && f.promiseKey != null && fulfilledByKey.get(f.promiseKey)) fu.resolvedAutomatically++; // the content appeared – nothing left to chase
      else if (f.dueOn < today) fu.overdueOpen++;
      else fu.notYetDue++;
    }
  }
  const worked = fu.onTime + fu.late + fu.overdueOpen;

  const contacted = new Set<string>();
  let contactActions = 0, promisesRecorded = 0, deadlinesMoved = 0;
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
    if (e.kind === "rescheduled") deadlinesMoved++;
  }

  // ── promises (by current deadline) ──
  const pw = comms.filter((c) => inWin(c.dueOn));
  const ful = pw.filter((c) => c.state === "fulfilled");
  const promises = {
    due: pw.length,
    fulfilledOnTime: ful.filter((c) => c.timing === "on_time").length,
    fulfilledLate: ful.filter((c) => c.timing === "late").length,
    fulfilledTimingUnknown: ful.filter((c) => c.timing === "unknown").length,
    partial: pw.filter((c) => c.state === "partial").length,
    toReview: pw.filter((c) => c.state === "review").length,
    overdueOpen: pw.filter((c) => c.state !== "fulfilled" && c.dueOn < today).length,
    notYetDue: pw.filter((c) => c.state !== "fulfilled" && c.dueOn >= today).length,
    bySystem: ful.filter((c) => c.contentSource === "system").length,
    byStaff: ful.filter((c) => c.contentSource === "staff").length,
    withoutSample: pw.filter((c) => c.sampleIds.length === 0).length,
    withoutSampleFulfilled: ful.filter((c) => c.sampleIds.length === 0).length,
  };

  // ── content: one general record per piece, whether or not samples exist ──
  const [cont] = await rows<{ dated: number; undated: number; staff: number; total: number; nosample: number }>(sql`
    with first_contact as (
      select username, min((at at time zone 'Asia/Kuala_Lumpur')::date) as d
      from staff_events where kind = 'contacted' and reverted_at is null group by username
    ),
    dated as (
      select ci.content_id, ci.creator from content_items ci join first_contact fc on fc.username = ci.creator
      where ci.posted_at is not null and ci.posted_at::date between ${start}::date and ${end}::date and ci.posted_at::date > fc.d
    ),
    undated as (
      select ci.content_id, ci.creator from content_items ci join first_contact fc on fc.username = ci.creator
      where ci.posted_at is null and ci.first_observed_on between ${start}::date and ${end}::date and ci.first_observed_on > fc.d
    ),
    staffv as (
      -- only verifications still in force: the latest non-undone decision for the same content and scope must be a verification
      select distinct d.content_id, d.username as creator from (
        select distinct on (username, content_id, commitment_id, sample_id) * from content_decisions
        where reverted_at is null and content_id is not null
        order by username, content_id, commitment_id, sample_id, at desc, id desc) d
      where d.decision = 'verified'
        and (d.at at time zone 'Asia/Kuala_Lumpur')::date between ${start}::date and ${end}::date
    ),
    allc as (select content_id, creator from dated union select content_id, creator from undated union select content_id, creator from staffv)
    select (select count(*) from dated)::int as dated, (select count(*) from undated)::int as undated, (select count(*) from staffv)::int as staff,
      (select count(distinct content_id) from allc)::int as total,
      (select count(distinct content_id) from allc a where not exists (select 1 from samples s where s.creator = a.creator))::int as nosample`);
  const videoSpans = await spans("video_list");
  const vcov = coveredDays(videoSpans, start, end);

  // ── sales: recorded import coverage decides what may be compared ──
  const [aff, shop] = await Promise.all([spans("affiliate_orders"), spans("all_orders")]);
  const horizon = addDaysISO(start, -(days + 56));
  const affDays = coveredDays(aff, horizon, end);
  const shopDays = coveredDays(shop, horizon, end);
  const both = intersect(affDays, shopDays);
  const cmp = comparable(days, end, both);
  const win = cmp.current;
  let newlySelling: number | null = null;
  let reactivated: number | null = null;
  let historyNote: string | null = null;
  const managed = (await rows<{ n: number }>(sql`select count(distinct username)::int as n from staff_events where kind = 'contacted' and reverted_at is null`))[0]?.n ?? 0;
  let m: { now: number; before: number; up: number; down: number } | null = null;
  if (win && cmp.previous) {
    const lookStart = addDaysISO(win.start, -28);
    const lookCovered = [...Array(28).keys()].every((i) => both.has(addDaysISO(lookStart, i)));
    if (lookCovered) {
      const [r] = await rows<{ newly: number; react: number }>(sql`
        with s as (
          select al.creator,
            bool_or(al.valid and al.created_at::date between ${win.start}::date and ${win.end}::date) as sells_now,
            bool_or(al.valid and al.created_at::date between ${lookStart}::date and ${addDaysISO(win.start, -1)}::date) as sold_lookback,
            bool_or(al.valid and al.created_at::date < ${lookStart}::date) as sold_earlier
          from ${AL} where al.creator is not null group by al.creator
        )
        select (count(*) filter (where sells_now and not coalesce(sold_lookback, false) and not coalesce(sold_earlier, false)))::int as newly,
               (count(*) filter (where sells_now and not coalesce(sold_lookback, false) and coalesce(sold_earlier, false)))::int as react from s`);
      newlySelling = r.newly;
      reactivated = r.react;
      historyNote = "“First observed sale” – the earliest sale in the uploaded order history. Earlier sales may exist in periods that were never uploaded.";
    } else historyNote = "The 28 days before this period are not fully covered by uploaded order files, so newly selling and reactivated creators cannot be told apart from missing data.";
    const [mm] = await rows<{ now: number | null; before: number | null; up: number; down: number }>(sql`
      with managed as (select distinct username from staff_events where kind = 'contacted' and reverted_at is null and (at at time zone 'Asia/Kuala_Lumpur')::date <= ${win.end}::date),
      g as (
        select m.username,
          coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${win.start}::date and ${win.end}::date), 0) as now,
          coalesce(sum(al.pay) filter (where al.valid and al.created_at::date between ${cmp.previous.start}::date and ${cmp.previous.end}::date), 0) as before
        from managed m left join ${AL} on al.creator = m.username group by m.username
      )
      select sum(now)::float8 as now, sum(before)::float8 as before, (count(*) filter (where now > before))::int as up, (count(*) filter (where now < before))::int as down from g`);
    m = { now: mm?.now ?? 0, before: mm?.before ?? 0, up: mm?.up ?? 0, down: mm?.down ?? 0 };
  } else historyNote = null; // the withheld reason is shown once, by the page

  return {
    window,
    followUps: { ...fu, onTimeRate: worked ? fu.onTime / worked : null },
    staff: {
      creatorsContacted: contacted.size,
      contactActions,
      promisesRecorded,
      deadlinesMoved,
      byPerson: [...person].map(([name, p]) => ({ name, contacts: p.contacts, creators: p.creators.size, promises: p.promises, followUpsOnTime: p.onTime })).sort((a, b) => b.contacts - a.contacts),
    },
    promises,
    content: {
      total: cont?.total ?? 0,
      postedAfterContact: cont?.dated ?? 0,
      undatedSeenAfterContact: cont?.undated ?? 0,
      confirmedByStaff: cont?.staff ?? 0,
      fromCreatorsWithoutSamples: cont?.nosample ?? 0,
      videoReportCoverage: { covered: vcov.size, total: days },
    },
    sales: {
      comparison: cmp,
      coverage: { affiliate: coveredDays(aff, start, end).size, shop: coveredDays(shop, start, end).size, total: days },
      newlySelling,
      reactivated,
      historyNote,
      managed,
      managedNow: m?.now ?? null,
      managedBefore: m?.before ?? null,
      managedGrowing: m?.up ?? null,
      managedFalling: m?.down ?? null,
    },
  };
}
