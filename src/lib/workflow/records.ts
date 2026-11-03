import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { coveredDays, intersect } from "@/lib/coverage";
import { addDaysISO, dayKL, fmtDayLabel, todayKL } from "@/lib/time";
import { getCommitments, type CommitmentRow } from "./commitments";
import { loadEvents } from "./events";
import { classifyFollowUps, type FollowUpCategory } from "./progress";
import { RELATIONSHIP, type Relationship } from "./relationship";
import { loadRelationships } from "./relationships";
import { getWorkflowSettings } from "./settings";

/** One supporting record behind a Progress figure. */
export type RecordRow = { username: string; detail: string; date: string | null; tone?: "good" | "warn" | "critical" | "neutral" };
export type RecordSet = { title: string; definition: string; rows: RecordRow[] };

const FU_TEXT: Record<FollowUpCategory, string> = {
  onTime: "completed on time (contact recorded)", late: "completed late", overdue: "still overdue", rescheduled: "rescheduled – no credit",
  paused: "paused or cancelled – no credit", auto: "resolved: the promised content appeared", notYet: "not due yet",
};
const FU_TONE: Record<FollowUpCategory, RecordRow["tone"]> = { onTime: "good", late: "warn", overdue: "critical", rescheduled: "neutral", paused: "neutral", auto: "good", notYet: "neutral" };

const promiseText = (c: CommitmentRow) =>
  `${c.productName ?? (c.contentType ? (c.contentType === "live" ? "LIVE" : "Video") : "Content")}${c.contentType && c.productName ? ` · ${c.contentType}` : ""} · ${c.done}/${c.needed} · due ${fmtDayLabel(c.dueOn)}${c.dueOn !== c.promisedOn ? ` (moved from ${fmtDayLabel(c.promisedOn)})` : ""}`;

export const METRICS = [
  "fu_due", "fu_onTime", "fu_late", "fu_overdue", "fu_rescheduled", "fu_paused", "fu_auto", "contacted", "promises_new", "promises_moved",
  "pr_due", "pr_fulfilled", "pr_partial", "pr_review", "pr_overdue", "content", "rel_stalled", "rel_paused", "rel_collaborating", "rel_active", "rel_inactive", "rel_approached", "rel_prospect",
] as const;
export type Metric = (typeof METRICS)[number];

/** The records behind a Progress figure, for the same period and with the same rules as the figure itself. */
export async function getRecords(metric: Metric, days: number): Promise<RecordSet> {
  const today = todayKL();
  const end = today;
  const start = addDaysISO(end, -(days - 1));
  const inWin = (d: string) => d >= start && d <= end;
  const [cfg, events, comms] = await Promise.all([getWorkflowSettings(), loadEvents(), getCommitments()]);
  const fulfilledByKey = new Map(comms.map((c) => [c.eventId, c.state === "fulfilled"]));
  const names = new Map((await rows<{ id: string; name: string }>(sql`select id::text, name from users`)).map((u) => [u.id, u.name]));

  if (metric.startsWith("fu_")) {
    const key = metric.slice(3);
    const all = classifyFollowUps(events, fulfilledByKey, cfg, start, end, today);
    const pick = key === "due" ? all : all.filter((f) => f.category === key);
    return {
      title: key === "due" ? "Follow-ups due in this period" : `Follow-ups: ${FU_TEXT[key as FollowUpCategory]}`,
      definition: "One follow-up per obligation (each promise has its own) plus the creator-level one, by due date. Only a recorded Contacted (or a promised date the creator gave) completes one; moving or pausing earns no credit.",
      rows: pick.sort((a, b) => a.dueOn.localeCompare(b.dueOn)).map((f) => ({
        username: f.username,
        detail: `${f.kind === "promise" ? "Promise check" : f.kind === "help" ? "Help follow-up" : "Follow-up"} due ${fmtDayLabel(f.dueOn)} – ${FU_TEXT[f.category]}${f.closerId ? ` · ${names.get(f.closerId) ?? ""}` : ""}`,
        date: f.dueOn,
        tone: FU_TONE[f.category],
      })),
    };
  }
  if (metric === "contacted") {
    const last = new Map<string, { at: Date; by: string | null; n: number }>();
    for (const e of events) {
      if (e.revertedAt || e.kind !== "contacted" || !inWin(dayKL(e.at))) continue;
      const cur = last.get(e.username);
      last.set(e.username, { at: cur && cur.at > e.at ? cur.at : e.at, by: e.userId, n: (cur?.n ?? 0) + 1 });
    }
    return {
      title: "Different creators contacted",
      definition: "Creators with at least one recorded Contacted action in the period (undone actions excluded). Opening WhatsApp or TikTok is never counted.",
      rows: [...last].map(([u, v]) => ({ username: u, detail: `${v.n}× contacted · last ${fmtDayLabel(dayKL(v.at))}${v.by ? ` by ${names.get(v.by) ?? ""}` : ""}`, date: dayKL(v.at) })),
    };
  }
  if (metric === "promises_new" || metric === "promises_moved") {
    const kind = metric === "promises_new" ? "promised" : "rescheduled";
    return {
      title: metric === "promises_new" ? "Promises recorded" : "Deadlines moved",
      definition: metric === "promises_new" ? "New promises only. Moving a date is not a new promise." : "Reschedules of existing promises; the original date is kept.",
      rows: events.filter((e) => !e.revertedAt && e.kind === kind && inWin(dayKL(e.at))).map((e) => ({
        username: e.username,
        detail: kind === "promised" ? `Promised ${fmtDayLabel(String(e.details?.promisedOn ?? ""))}${e.details?.quantity ? ` · ${e.details.quantity}` : ""}${e.details?.contentType ? ` ${e.details.contentType}` : ""}` : `Moved ${e.details?.fromOn ? fmtDayLabel(String(e.details.fromOn)) : ""} → ${e.details?.toOn ? fmtDayLabel(String(e.details.toOn)) : ""}`,
        date: dayKL(e.at),
      })),
    };
  }
  if (metric.startsWith("pr_")) {
    const key = metric.slice(3);
    const inP = comms.filter((c) => inWin(c.dueOn));
    const pick = key === "due" ? inP : key === "fulfilled" ? inP.filter((c) => c.state === "fulfilled") : key === "overdue" ? inP.filter((c) => c.state !== "fulfilled" && c.dueOn < today) : inP.filter((c) => c.state === key);
    return {
      title: { due: "Promises due", fulfilled: "Promises fulfilled", partial: "Partly done", review: "Need a quick check", overdue: "Overdue promises" }[key] ?? "Promises",
      definition: "Promises whose current deadline is in the period. Fulfilled = the required number of distinct, matching pieces with a known posting date after the promise, or confirmed by staff.",
      rows: pick.map((c) => ({
        username: c.username,
        detail: `${promiseText(c)}${c.state === "fulfilled" ? ` · ${c.timing === "on_time" ? "on time" : c.timing === "late" ? "late" : "posting date unknown"}${c.contentSource === "staff" ? " · confirmed by staff" : ""}` : ""}`,
        date: c.dueOn,
        tone: c.state === "fulfilled" ? "good" : c.dueOn < today ? "critical" : "neutral",
      })),
    };
  }
  if (metric === "content") {
    const r = await rows<{ id: string; creator: string; kind: string; posted: string | null; first: string | null; link: string | null; staff: boolean }>(sql`
      with first_contact as (select username, min((at at time zone 'Asia/Kuala_Lumpur')::date) as d from staff_events where kind = 'contacted' and reverted_at is null group by username)
      select * from (
      select ci.content_id as id, ci.creator, ci.kind, to_char(ci.posted_at, 'YYYY-MM-DD') as posted, to_char(ci.first_observed_on, 'YYYY-MM-DD') as first, ci.link,
        exists (select 1 from content_decisions d where d.content_id = ci.content_id and d.decision = 'verified' and d.reverted_at is null) as staff
      from content_items ci join first_contact fc on fc.username = ci.creator
      where (ci.posted_at is not null and ci.posted_at::date between ${start}::date and ${end}::date and ci.posted_at::date > fc.d)
         or (ci.posted_at is null and ci.first_observed_on between ${start}::date and ${end}::date and ci.first_observed_on > fc.d)
      union
      -- plus pieces whose staff verification (still in force) falls in the period – the same rule Progress uses
      select ci.content_id, ci.creator, ci.kind, to_char(ci.posted_at, 'YYYY-MM-DD'), to_char(ci.first_observed_on, 'YYYY-MM-DD'), ci.link, true
      from content_items ci where ci.content_id in (
        select d.content_id from (
          select distinct on (username, content_id, commitment_id, sample_id) * from content_decisions
          where reverted_at is null and content_id is not null order by username, content_id, commitment_id, sample_id, at desc, id desc) d
        where d.decision = 'verified' and (d.at at time zone 'Asia/Kuala_Lumpur')::date between ${start}::date and ${end}::date)
      ) u order by coalesce(posted, first) desc`);
    return {
      title: "New content after outreach",
      definition: "Distinct videos/LIVEs posted after the creator's first recorded contact (or first seen after it when the posting date is unknown). Timing only – not proof the contact caused it.",
      rows: r.map((x) => ({ username: x.creator, detail: `${x.kind === "live" ? "LIVE" : "Video"} · ${x.posted ? `posted ${fmtDayLabel(x.posted)}` : `first seen ${fmtDayLabel(x.first ?? "")} (posting date unknown)`}${x.staff ? " · confirmed by staff" : ""}`, date: x.posted ?? x.first })),
    };
  }
  if (metric.startsWith("rel_")) {
    const st = metric.slice(4) as Relationship;
    const rel = await loadRelationships();
    const picked = [...rel.values()].filter((r) => r.status === st);
    return {
      title: `Relationships: ${RELATIONSHIP[st].label}`,
      definition: RELATIONSHIP[st].hint + " Derived from recorded contacts, promises, samples and sales – never typed in.",
      rows: picked.map((r) => ({
        username: r.username,
        detail: `${r.attempts ? `${r.attempts} contact${r.attempts === 1 ? "" : "s"} since last promise/content · ` : ""}${r.outstanding ? `${r.outstanding} open promise${r.outstanding === 1 ? "" : "s"}${r.overdueDays != null ? ` (${r.overdueDays}d overdue)` : ""} · ` : ""}${r.lastSaleOn ? `last sale ${fmtDayLabel(r.lastSaleOn)}` : "no sales seen"}`,
        date: r.lastSaleOn,
        tone: st === "stalled" ? "critical" : "neutral",
      })),
    };
  }
  return { title: "Records", definition: "", rows: [] };
}

export type OwnerDecision = { key: string; title: string; count: number; hint: string; href: string; tone: "critical" | "warn" | "neutral" };

/** Things that need the owner's eye – derived, never typed in. Each links to the supporting records. */
export async function getOwnerDecisions(days = 28): Promise<OwnerDecision[]> {
  const today = todayKL();
  const [cfg, comms, rel, ex, conflicts, aff, shop] = await Promise.all([
    getWorkflowSettings(),
    getCommitments(),
    loadRelationships(),
    rows<{ unmatched: number; stuck: number; review: number }>(sql`
      select (select count(*) from samples s where s.source = 'orders' and s.creator is null and coalesce(s.order_status, '') <> 'Canceled')::int as unmatched,
        (select count(*) from samples s where s.source = 'orders' and s.shipped_at is not null and s.delivered_at is null and coalesce(s.order_status, '') <> 'Canceled' and s.shipped_at < now() - interval '10 days')::int as stuck,
        (select count(*) from samples s where coalesce(s.result_override, s.result) = 'uncertain')::int as review`),
    rows<{ n: number }>(sql`select count(*)::int as n from import_conflicts where status = 'pending'`),
    rows<{ s: string; e: string }>(sql`select to_char(period_start, 'YYYY-MM-DD') s, to_char(period_end, 'YYYY-MM-DD') e from uploads where kind = 'affiliate_orders' and period_start is not null`),
    rows<{ s: string; e: string }>(sql`select to_char(period_start, 'YYYY-MM-DD') s, to_char(period_end, 'YYYY-MM-DD') e from uploads where kind = 'all_orders' and period_start is not null`),
  ]);
  const out: OwnerDecision[] = [];
  const stalled = [...rel.values()].filter((r) => r.status === "stalled").length;
  if (stalled) out.push({ key: "stalled", title: "Stalled relationships – review or pause", count: stalled, hint: `${cfg.maxUnanswered}+ recorded contacts without a promise or new content, or a promise ${cfg.stalledOverdueDays}+ days overdue`, href: `/progress/records?m=rel_stalled&days=${days}`, tone: "critical" });
  const longOverdue = comms.filter((c) => c.state !== "fulfilled" && c.dueOn < addDaysISO(today, -cfg.stalledOverdueDays)).length;
  if (longOverdue) out.push({ key: "overdue", title: `Promises overdue by ${cfg.stalledOverdueDays}+ days`, count: longOverdue, hint: "Decide whether to chase, move the date or let go", href: `/progress/records?m=pr_overdue&days=90`, tone: "critical" });
  const e = ex[0];
  if (e.review) out.push({ key: "review", title: "Possible content waiting for a yes/no", count: e.review, hint: "Samples whose matching video is uncertain", href: "/samples?view=review", tone: "warn" });
  if (e.unmatched) out.push({ key: "unmatched", title: "Samples whose receiver is not matched", count: e.unmatched, hint: "Pick the TikTok username once", href: "/samples?view=unknown", tone: "warn" });
  if (e.stuck) out.push({ key: "stuck", title: "Shipped but not delivered for 10+ days", count: e.stuck, hint: "Check the courier", href: "/samples?view=wait", tone: "warn" });
  if (conflicts[0]?.n) out.push({ key: "conflicts", title: "Import lines to review", count: conflicts[0].n, hint: "Same dates, different values – stored version kept", href: "/data", tone: "warn" });
  const both = intersect(coveredDays(aff.map((a) => ({ start: a.s, end: a.e })), addDaysISO(today, -120), today), coveredDays(shop.map((a) => ({ start: a.s, end: a.e })), addDaysISO(today, -120), today));
  const latest = [...both].sort().pop();
  if (!latest || latest < addDaysISO(today, -10)) out.push({ key: "stale", title: "Order files are out of date", count: 1, hint: latest ? `Order data ends ${fmtDayLabel(latest)} – upload newer files` : "No order files uploaded", href: "/data", tone: "warn" });
  return out;
}
