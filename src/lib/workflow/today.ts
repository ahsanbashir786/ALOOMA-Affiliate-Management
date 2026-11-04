import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { dayKL, daysBetweenISO, fmtDayLabel, todayKL } from "@/lib/time";
import { getCommitments, type CommitmentRow } from "./commitments";
import { getWorkflowStates, loadEvents } from "./events";
import { unansweredAttempts, type FollowupKind } from "./replay";
import { loadRelationships } from "./relationships";
import type { Relationship } from "./relationship";
import { loadDirectoryRows, type DirLine } from "./directory";
import { NEEDS_ACTION, type CreatorAction, type CreatorStatus } from "@/lib/affiliates/status";
import { getWorkflowSettings, type WorkflowSettings } from "./settings";

/** One product line of a creator, from the same engine as the Affiliate Data table. */
export type TodayLine = { pid: string | null; name: string; noSample: boolean; status: CreatorStatus; action: CreatorAction; reason: string; orders: number; gmv: number; gmvVideo: number; gmvLive: number; videos: number; videos28: number; lastVideoLabel: string | null; lastVideoDaysAgo: number | null; doneOn: string | null };
export type DoneItem = { id: number; username: string; text: string; by: string | null; at: string; kind: string };

export type ReasonKind = "promise_overdue" | "promise_review" | "sample_review" | "followup_due" | "help_due" | "resume_due" | "sample" | "development" | "new_creator";

/** What kind of opportunity a recommendation is (so recruitment, development and reactivation read differently). */
export type OpportunityKind = "recruit" | "develop" | "reactivate";

export type Obligation = {
  id: number;
  label: string;
  contentType: "video" | "live" | null;
  done: number;
  needed: number;
  dueOn: string;
  dueLabel: string;
  /** Days late (null when not yet due). */
  lateDays: number | null;
  moved: boolean;
  state: string;
};

export type TodayRow = {
  username: string;
  relationship: Relationship;
  opportunity: OpportunityKind | null;
  /** Every outstanding promise of this creator, independently – none is hidden by another. */
  obligations: Obligation[];
  /** The most pressing dated item, for the deadline chip. */
  deadline: { label: string; tone: "critical" | "warn" | "neutral" } | null;
  history: { at: string; text: string }[];
  phone: string | null;
  tier: 1 | 2 | 3 | 4;
  reasons: { kind: ReasonKind; text: string }[];
  /** Every product line with its status and action (same rules as the table). */
  lines: TodayLine[];
  gmvAll: number;
  type: string | null;
  status: "active" | "paused";
  pausedReason: string | null;
  resumeOn: string | null;
  nextOn: string | null;
  nextKind: FollowupKind | null;
  lastContactedAt: string | null;
  lastContactedBy: string | null;
  /** The latest action recorded from the Affiliate Data table, e.g. "Chase – Pillow · 2 Nov". */
  lastAction: string | null;
  help: { reason: string; nextOn: string } | null;
  /** The outstanding promise with the earliest CURRENT deadline – the same one sample deadlines use. */
  commitment: CommitmentRow | null;
  /** Other outstanding promises of this creator. */
  otherCommitments: number;
  /** Suggestions for the optional deliverable controls, from the creator's own activity. */
  suggest: { products: { id: string; name: string }[]; kind: "video" | "live" | null };
  attempts: number;
  suggestPause: boolean;
  samples: { id: number; pid?: string | null; product: string; approvedOn: string | null; shippedOn: string | null; deliveredOn: string | null; postBy: string | null; postBySource: string | null; result: string }[];
  /** Why the system is NOT asking for outreach now (set only on scheduled / paused rows). */
  held: string | null;
  priority: number;
  /** Possible content waiting for a yes/no (a promise or a sample). */
  needsVerify: boolean;
};

export type TodayView = "focus" | "due" | "verify" | "samples" | "development" | "scheduled" | "paused" | "done";

export type TodayData = {
  today: string;
  /** The dates the line figures cover, for messages. */
  period: string;
  cfg: WorkflowSettings;
  rows: TodayRow[];
  counts: Record<TodayView, number>;
  /** Shown in the default list vs. total that need work now – so nothing is silently hidden. */
  hiddenFromFocus: number;
  exceptions: number;
  /** Sample exceptions that are not about one creator: unmatched receivers, shipped-but-not-delivered. */
  sampleExceptions: { unmatched: number; stuck: number; review: number };
  /** Everything staff recorded today (Malaysia time), newest first. */
  doneToday: DoneItem[];
};

const URGENT_ACTIONS: CreatorAction[] = ["Chase", "Coach", "Revive"];
const toLine = (l: DirLine): TodayLine => ({ pid: l.pid, name: l.name, noSample: l.noSample, status: l.status, action: l.action, reason: l.reason, orders: l.orders, gmv: l.gmv, gmvVideo: l.gmvVideo, gmvLive: l.gmvLive, videos: l.videos, videos28: l.videos28, lastVideoLabel: l.lastVideoLabel, lastVideoDaysAgo: l.lastVideoDaysAgo, doneOn: l.doneOn });
const HIST: Record<string, string> = { contacted: "Contacted", promised: "Promise recorded", rescheduled: "Date moved", needs_help: "Needs help", paused: "Paused", resumed: "Resumed" };

export async function getToday(view: TodayView = "focus"): Promise<TodayData> {
  const today = todayKL();
  const [cfg, states, comms, dirData] = await Promise.all([
    getWorkflowSettings(),
    getWorkflowStates(),
    getCommitments(),
    loadDirectoryRows(),
  ]);
  const dirBy = new Map(dirData.all.map((r) => [r.username, r]));
  const needsOf = (u: string): DirLine[] => (dirBy.get(u)?.lines ?? []).filter((l) => !l.noSample && NEEDS_ACTION.includes(l.action) && l.action !== "Resume");

  // Outstanding = not fulfilled. Reminders are decided per commitment below; creators are only grouped for display.
  const outsBy = new Map<string, CommitmentRow[]>();
  for (const c of comms) if (c.state !== "fulfilled") outsBy.set(c.username, [...(outsBy.get(c.username) ?? []), c].sort((x, y) => x.dueOn.localeCompare(y.dueOn) || x.id - y.id));

  // creators added by hand to start outreach (no sample or export row needed)
  const manualSet = new Set((await rows<{ username: string }>(sql`select username from creators where source = 'manual'`)).map((m) => m.username));
  const names = new Set<string>([...dirData.all.filter((r) => !r.paused && needsOf(r.username).length).map((r) => r.username), ...outsBy.keys(), ...manualSet]);
  for (const [u, st] of states) if (st.nextOn || st.status === "paused") names.add(u);
  const list = [...names];
  const [relBy, evAll] = await Promise.all([loadRelationships(list), loadEvents(list)]);

  const [info, smp, latest, userNames, acts] = list.length
    ? await Promise.all([
        rows<{ username: string; phone: string | null; dnc: boolean }>(sql`
          select username, phone, do_not_contact as dnc from creators where username in (${sql.join(list.map((u) => sql`${u}`), sql`, `)})`),
        rows<{ id: number; creator: string; product: string; pid: string | null; approved: string | null; shipped: string | null; delivered: string | null; post_by: string | null; post_by_source: string | null; r: string }>(sql`
          select s.id, s.creator, coalesce(k.name, s.variation, s.seller_sku, s.product_name, 'Sample') as product, s.product_id as pid,
            to_char(s.approved_at, 'YYYY-MM-DD') as approved, to_char(s.shipped_at, 'YYYY-MM-DD') as shipped, to_char(s.delivered_at, 'YYYY-MM-DD') as delivered, to_char(s.post_by, 'YYYY-MM-DD') as post_by, s.post_by_source,
            coalesce(s.result_override, s.result) as r
          from samples s left join sku_items k on upper(k.sku) = upper(s.seller_sku)
          where s.source = 'orders' and s.creator in (${sql.join(list.map((u) => sql`${u}`), sql`, `)})
            and coalesce(s.result_override, s.result) in ('in_transit', 'in_window', 'not_posted', 'uncertain')
          order by s.delivered_at nulls last`),
        rows<{ creator: string; at: Date }>(sql`
          select s.creator, max(sc.posted_at) as at from sample_content sc join samples s on s.id = sc.sample_id
          where sc.confidence = 'confirmed' and s.creator in (${sql.join(list.map((u) => sql`${u}`), sql`, `)}) group by s.creator`),
        rows<{ id: string; name: string }>(sql`select id::text, name from users`),
        rows<{ creator: string; pid: string; name: string | null; gmv: number; vgmv: number; lgmv: number }>(sql`
          select al.creator, al.product_id as pid, max(p.short_name) as name, coalesce(sum(al.pay) filter (where al.valid), 0)::float8 as gmv,
            coalesce(sum(al.pay) filter (where al.valid and al.content_type = 'Video'), 0)::float8 as vgmv,
            coalesce(sum(al.pay) filter (where al.valid and al.content_type = 'Livestream'), 0)::float8 as lgmv
          from ${AL} left join products p on p.product_id = al.product_id
          where al.creator in (${sql.join(list.map((u) => sql`${u}`), sql`, `)})
          group by al.creator, al.product_id order by gmv desc`),
      ])
    : [[], [], [], [], []];
  const infoBy = new Map(info.map((i) => [i.username, i]));
  const latestBy = new Map(latest.map((l) => [l.creator, l.at ? new Date(l.at) : null]));
  const userBy = new Map(userNames.map((u) => [u.id, u.name]));
  const samplesBy = new Map<string, TodayRow["samples"]>();
  for (const s of smp)
    samplesBy.set(s.creator, [
      ...(samplesBy.get(s.creator) ?? []),
      { id: s.id, pid: s.pid, product: s.product, approvedOn: s.approved, shippedOn: s.shipped, deliveredOn: s.delivered, postBy: s.post_by, postBySource: s.post_by_source, result: s.r },
    ]);

  const actBy = new Map<string, typeof acts>();
  for (const a of acts) actBy.set(a.creator, [...(actBy.get(a.creator) ?? []), a]);

  const out: TodayRow[] = [];
  for (const u of list) {
    const inf = infoBy.get(u);
    if (inf?.dnc) continue;
    const st = states.get(u);
    const outs = outsBy.get(u) ?? [];
    const reminderFor = (c: CommitmentRow) => st?.open.find((r) => r.promiseKey === c.eventId) ?? null;
    // A promise is actionable when its own deadline has passed and its own reminder (if any) is due – other promises never hide it.
    const actionable = outs.filter((c) => c.dueOn < today && (reminderFor(c)?.dueOn ?? c.dueOn) <= today);
    const reviewC = outs.find((c) => c.candidates.length > 0) ?? null;
    const comm = actionable[0] ?? reviewC ?? outs[0] ?? null;
    const need = needsOf(u).sort((a, b) => URGENT_ACTIONS.indexOf(a.action) - URGENT_ACTIONS.indexOf(b.action) || b.gmv - a.gmv);
    const reasons: TodayRow["reasons"] = [];
    let tier: TodayRow["tier"] | null = null;
    let held: string | null = null;
    const paused = st?.status === "paused";
    const attempts = st ? unansweredAttempts(st, latestBy.get(u) ?? null) : 0;

    if (paused) {
      if (st?.resumeOn && st.resumeOn <= today) {
        reasons.push({ kind: "resume_due", text: `Pause ended on ${fmtDayLabel(st.resumeOn)} – decide whether to resume.` });
        tier = 2;
      } else held = `Paused${st?.pausedReason ? `: ${st.pausedReason}` : ""}${st?.resumeOn ? ` · until ${fmtDayLabel(st.resumeOn)}` : ""}`;
    } else {
      const overdue = actionable[0] ?? null;
      if (overdue) {
        const late = daysBetweenISO(overdue.dueOn, today);
        const parts = overdue.needed > 1 ? ` – ${overdue.done}/${overdue.needed} done` : "";
        reasons.push({
          kind: "promise_overdue",
          text: `Promised ${fmtDayLabel(overdue.dueOn)}${overdue.rescheduled ? " (moved)" : ""} (${late} day${late === 1 ? "" : "s"} ago)${parts} – no matching content seen yet${overdue.state === "review" ? "; possible match to review" : ""}.${actionable.length > 1 ? ` (${actionable.length} promises overdue)` : ""}`,
        });
        tier = 1;
      }
      // Possible content (for a promise or a sample) needs a quick yes/no, whatever the date.
      if (reviewC) {
        reasons.push({ kind: "promise_review", text: `Possible content for the promise (${reviewC.candidates.length}) – confirm or reject it.` });
        tier = tier ?? 2;
      }
      const sampleReview = (samplesBy.get(u) ?? []).filter((x) => x.result === "uncertain");
      if (sampleReview.length) {
        reasons.push({ kind: "sample_review", text: `Possible content for ${sampleReview.length === 1 ? "a sample" : `${sampleReview.length} samples`} – check it on the Samples page.` });
        tier = tier ?? 2;
      }
      const g = st?.open.find((r) => r.promiseKey === null && r.kind !== "resume") ?? null;
      if (g && g.dueOn <= today) {
        const over = daysBetweenISO(g.dueOn, today);
        reasons.push({
          kind: g.kind === "help" ? "help_due" : "followup_due",
          text:
            g.kind === "help"
              ? `Needs-help follow-up ${over > 0 ? `was due ${fmtDayLabel(g.dueOn)}` : "is due today"}${st?.help ? `: ${st.help.reason}` : ""}.`
              : `Follow-up ${over > 0 ? `was due ${fmtDayLabel(g.dueOn)}` : "is due today"} (last contacted ${st?.lastContactedAt ? fmtDayLabel(st.lastContactedAt.toISOString().slice(0, 10)) : "–"}).`,
        });
        tier = tier ?? 2;
      }
      if (tier == null) {
        // Table actions only appear when nothing already covers this creator: no scheduled reminder,
        // no promise still to come, no pause (so the same person is never chased twice for the same thing).
        const future = st?.open.filter((r) => r.dueOn > today).map((r) => r.dueOn).sort()[0] ?? null;
        const promiseAhead = outs.find((c) => c.dueOn >= today)?.dueOn ?? null;
        if (future || promiseAhead) {
          const overdueRearmed = outs.some((c) => c.dueOn < today);
          held = promiseAhead && !(overdueRearmed && future) ? `Promised ${fmtDayLabel(promiseAhead)} – waiting` : `Follow-up on ${fmtDayLabel(future!)}`;
        } else if (manualSet.has(u) && !st?.lastContactedAt) {
          tier = 4;
          reasons.push({ kind: "new_creator", text: "Added by hand – not contacted yet." });
        } else if (need.length) {
          const urgent = need.some((l) => URGENT_ACTIONS.includes(l.action));
          tier = urgent ? 3 : 4;
          for (const l of need.slice(0, 2)) reasons.push({ kind: urgent ? "sample" : "development", text: `${l.action}${l.noSample ? "" : ` – ${l.name}`}: ${l.reason}` });
        }
      }
    }
    if (tier == null && !held) continue;

    const obligations: Obligation[] = outs.map((c) => ({
      id: c.id,
      label: c.productName ?? (c.contentType ? (c.contentType === "live" ? "LIVE" : "Video") : "Content"),
      contentType: c.contentType,
      done: c.done,
      needed: c.needed,
      dueOn: c.dueOn,
      dueLabel: fmtDayLabel(c.dueOn),
      lateDays: c.dueOn < today ? daysBetweenISO(c.dueOn, today) : null,
      moved: c.dueOn !== c.promisedOn,
      state: c.state,
    }));
    const gen = st?.open.find((r) => r.promiseKey === null && r.kind !== "resume") ?? null;
    const deadline: TodayRow["deadline"] = actionable[0]
      ? { label: `Overdue ${daysBetweenISO(actionable[0].dueOn, today)}d`, tone: "critical" }
      : gen && gen.dueOn <= today
        ? { label: gen.dueOn < today ? `Follow-up ${daysBetweenISO(gen.dueOn, today)}d late` : "Follow-up today", tone: "warn" }
        : outs.find((c) => c.dueOn >= today)
          ? { label: `Due ${fmtDayLabel(outs.find((c) => c.dueOn >= today)!.dueOn)}`, tone: "neutral" }
          : st?.nextOn
            ? { label: `Next ${fmtDayLabel(st.nextOn)}`, tone: "neutral" }
            : null;
    const hist = evAll
      .filter((e) => e.username === u && !e.revertedAt && e.kind !== "note")
      .slice(-4)
      .reverse()
      .map((e) => ({ at: e.at.toISOString(), text: `${HIST[e.kind] ?? e.kind}${e.userId ? ` · ${userBy.get(e.userId) ?? ""}` : ""}${e.details?.legacy ? " (old Action centre)" : ""}` }));

    out.push({
      username: u,
      relationship: relBy.get(u)?.status ?? "prospect",
      opportunity: tier === 4 ? (manualSet.has(u) && !need.length ? "recruit" : need[0]?.action === "Approach" ? "recruit" : need[0]?.action === "Revive" ? "reactivate" : "develop") : null,
      obligations,
      deadline,
      history: hist,
      needsVerify: !!reviewC || (samplesBy.get(u) ?? []).some((x) => x.result === "uncertain"),
      phone: inf?.phone ?? null,
      tier: tier ?? 4,
      reasons,
      lines: (dirBy.get(u)?.allLines ?? []).map(toLine),
      gmvAll: dirBy.get(u)?.gmvAll ?? 0,
      type: dirBy.get(u)?.type ?? null,
      status: paused ? "paused" : "active",
      pausedReason: st?.pausedReason ?? null,
      resumeOn: st?.resumeOn ?? null,
      nextOn: st?.nextOn ?? null,
      nextKind: st?.nextKind ?? null,
      lastContactedAt: st?.lastContactedAt?.toISOString() ?? null,
      lastAction: (() => {
        const e = evAll.filter((x) => x.username === u && !x.revertedAt && x.kind === "contacted" && x.details?.action).at(-1);
        return e ? `${e.details!.action}${e.details!.product ? ` – ${e.details!.product}` : ""} · ${fmtDayLabel(dayKL(e.at))}` : null;
      })(),
      lastContactedBy: st?.lastContactedBy ? (userBy.get(st.lastContactedBy) ?? null) : null,
      help: st?.help ? { reason: st.help.reason, nextOn: st.help.nextOn } : null,
      commitment: comm,
      otherCommitments: Math.max(0, outs.length - 1),
      suggest: (() => {
        const mine = actBy.get(u) ?? [];
        const open = (samplesBy.get(u) ?? []).filter((x) => x.pid).map((x) => ({ id: x.pid!, name: x.product }));
        const seen = new Set<string>();
        const products = [...open, ...mine.filter((m) => m.gmv > 0).map((m) => ({ id: m.pid, name: m.name ?? "Product" }))].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 4);
        const v = mine.reduce((a, m) => a + m.vgmv, 0);
        const l = mine.reduce((a, m) => a + m.lgmv, 0);
        return { products, kind: v > 0 && l === 0 ? ("video" as const) : l > 0 && v === 0 ? ("live" as const) : null };
      })(),
      attempts,
      suggestPause: !paused && attempts >= cfg.maxUnanswered,
      samples: samplesBy.get(u) ?? [],
      held: tier == null ? held : null,
      priority: dirBy.get(u)?.gmvAll ?? 0,
    });
  }

  const active = out.filter((r) => !r.held);
  const sortFn = (a: TodayRow, b: TodayRow) => a.tier - b.tier || b.priority - a.priority || a.username.localeCompare(b.username);
  active.sort(sortFn);
  const paused = out.filter((r) => r.status === "paused" && r.held).sort(sortFn);
  const scheduled = out.filter((r) => r.held && r.status === "active").sort((a, b) => (a.nextOn ?? "9").localeCompare(b.nextOn ?? "9"));

  // Focused default list: everything overdue/due, then a capped number of sample cases and a few development ideas.
  const due = active.filter((r) => r.tier <= 2);
  const verify = active.filter((r) => r.needsVerify);
  const samples = active.filter((r) => r.tier === 3);
  const dev = active.filter((r) => r.tier === 4);
  const focus = active;

  const [ex] = await rows<{ unmatched: number; stuck: number; review: number }>(sql`
    select
      (select count(*) from samples s where s.source = 'orders' and s.creator is null and coalesce(s.order_status, '') <> 'Canceled')::int as unmatched,
      (select count(*) from samples s where s.source = 'orders' and s.shipped_at is not null and s.delivered_at is null and coalesce(s.order_status, '') <> 'Canceled'
        and s.shipped_at < now() - (${cfg.stuckTransitDays}::int * interval '1 day'))::int as stuck,
      (select count(*) from samples s where coalesce(s.result_override, s.result) = 'uncertain')::int as review`);
  const doneRaw = await rows<{ id: number; username: string; kind: string; details: Record<string, string | null> | null; at: Date; by: string | null }>(sql`
    select e.id, e.username, e.kind::text as kind, e.details, e.at, u.name as by
    from staff_events e left join users u on u.id::text = e.user_id::text
    where e.reverted_at is null and e.kind in ('contacted', 'promised', 'needs_help', 'paused', 'resumed')
      and (e.at at time zone 'Asia/Kuala_Lumpur')::date = ${today}::date order by e.at desc, e.id desc`);
  const doneToday: DoneItem[] = doneRaw.map((e) => {
    const d = e.details ?? {};
    const text =
      e.kind === "contacted" ? `Contacted${d.action ? ` – ${d.action}` : ""}${d.product ? ` (${d.product})` : ""}`
      : e.kind === "promised" ? `Promised to post${d.promisedOn ? ` by ${fmtDayLabel(d.promisedOn)}` : ""}`
      : e.kind === "needs_help" ? `Needs help${d.reason ? `: ${d.reason}` : ""}`
      : e.kind === "paused" ? "Paused" : "Resumed";
    return { id: e.id, username: e.username, text, by: e.by, at: new Date(e.at).toISOString(), kind: e.kind };
  });
  const exceptions = ex.unmatched + ex.stuck + ex.review;
  const pick: Record<TodayView, TodayRow[]> = { focus, due, verify, samples, development: dev, scheduled, paused, done: [] };
  const [bounds] = await rows<{ a: string | null; b: string | null }>(sql`select to_char(min(created_at), 'YYYY-MM-DD') as a, to_char(max(created_at), 'YYYY-MM-DD') as b from order_lines`);
  return {
    today,
    period: bounds?.a && bounds?.b ? `${fmtDayLabel(bounds.a)} – ${fmtDayLabel(bounds.b)}` : "all data",
    cfg,
    rows: pick[view],
    counts: { focus: focus.length, due: due.length, verify: verify.length, samples: samples.length, development: dev.length, scheduled: scheduled.length, paused: paused.length, done: doneToday.length },
    hiddenFromFocus: active.length - focus.length,
    exceptions,
    sampleExceptions: ex,
    doneToday,
  };
}

/** Number of creators needing work today (due + overdue), for the sidebar badge. */
export async function dueTodayCount(): Promise<number> {
  const d = await getToday("due");
  return d.counts.due;
}
