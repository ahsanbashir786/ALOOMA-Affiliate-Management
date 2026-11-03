import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { AL, rows } from "@/lib/analytics/sql";
import { daysBetweenISO, fmtDayLabel, todayKL } from "@/lib/time";
import { getCommitments, type CommitmentRow } from "./commitments";
import { getWorkflowStates } from "./events";
import { unansweredAttempts, type FollowupKind } from "./replay";
import { getWorkflowSettings, type WorkflowSettings } from "./settings";

export type ReasonKind = "promise_overdue" | "promise_review" | "followup_due" | "help_due" | "resume_due" | "sample" | "development";

export type TodayRow = {
  username: string;
  phone: string | null;
  tier: 1 | 2 | 3 | 4;
  reasons: { kind: ReasonKind; text: string }[];
  recs: { type: string; title: string; reason: string; instruction: string; instructionMs: string | null; priority: number }[];
  status: "active" | "paused";
  pausedReason: string | null;
  resumeOn: string | null;
  nextOn: string | null;
  nextKind: FollowupKind | null;
  lastContactedAt: string | null;
  lastContactedBy: string | null;
  help: { reason: string; nextOn: string } | null;
  /** The outstanding promise with the earliest CURRENT deadline – the same one sample deadlines use. */
  commitment: CommitmentRow | null;
  /** Other outstanding promises of this creator. */
  otherCommitments: number;
  /** Suggestions for the optional deliverable controls, from the creator's own activity. */
  suggest: { products: { id: string; name: string }[]; kind: "video" | "live" | null };
  attempts: number;
  suggestPause: boolean;
  samples: { id: number; pid?: string | null; product: string; deliveredOn: string | null; postBy: string | null; postBySource: string | null; result: string }[];
  /** Why the system is NOT asking for outreach now (set only on scheduled / paused rows). */
  held: string | null;
  priority: number;
};

export type TodayView = "focus" | "due" | "samples" | "development" | "scheduled" | "paused";

export type TodayData = {
  today: string;
  cfg: WorkflowSettings;
  rows: TodayRow[];
  counts: Record<TodayView, number>;
  /** Shown in the default list vs. total that need work now – so nothing is silently hidden. */
  hiddenFromFocus: number;
  exceptions: number;
};

const SAMPLE_TYPES = new Set(["sample_chase", "stop_samples", "sample_no_post"]);

export async function getToday(view: TodayView = "focus"): Promise<TodayData> {
  const today = todayKL();
  const [cfg, states, comms, recRows] = await Promise.all([
    getWorkflowSettings(),
    getWorkflowStates(),
    getCommitments(),
    db.select().from(recommendations).where(sql`${recommendations.active}`),
  ]);

  // Outstanding = not fulfilled. Reminders are decided per commitment below; creators are only grouped for display.
  const outsBy = new Map<string, CommitmentRow[]>();
  for (const c of comms) if (c.state !== "fulfilled") outsBy.set(c.username, [...(outsBy.get(c.username) ?? []), c].sort((x, y) => x.dueOn.localeCompare(y.dueOn) || x.id - y.id));
  const recBy = new Map<string, typeof recRows>();
  for (const r of recRows) recBy.set(r.username, [...(recBy.get(r.username) ?? []), r]);

  const names = new Set<string>([...recBy.keys(), ...outsBy.keys()]);
  for (const [u, st] of states) if (st.nextOn || st.status === "paused") names.add(u);
  const list = [...names];

  const [info, smp, latest, userNames, acts] = list.length
    ? await Promise.all([
        rows<{ username: string; phone: string | null; dnc: boolean }>(sql`
          select username, phone, do_not_contact as dnc from creators where username in (${sql.join(list.map((u) => sql`${u}`), sql`, `)})`),
        rows<{ id: number; creator: string; product: string; pid: string | null; delivered: string | null; post_by: string | null; post_by_source: string | null; r: string }>(sql`
          select s.id, s.creator, coalesce(k.name, s.variation, s.seller_sku, s.product_name, 'Sample') as product, s.product_id as pid,
            to_char(s.delivered_at, 'YYYY-MM-DD') as delivered, to_char(s.post_by, 'YYYY-MM-DD') as post_by, s.post_by_source,
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
      { id: s.id, pid: s.pid, product: s.product, deliveredOn: s.delivered, postBy: s.post_by, postBySource: s.post_by_source, result: s.r },
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
    const recs = (recBy.get(u) ?? []).sort((a, b) => b.priority - a.priority);
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
      // Possible content for a promise needs a quick yes/no, whatever the date.
      if (reviewC && tier == null) {
        reasons.push({ kind: "promise_review", text: `Possible content for the promise (${reviewC.candidates.length}) – confirm or reject it.` });
        tier = 2;
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
        // System recommendations only appear when nothing already covers this creator: no scheduled reminder,
        // no promise still to come, no pause (so the same person is never chased twice for the same thing).
        const future = st?.open.filter((r) => r.dueOn > today).map((r) => r.dueOn).sort()[0] ?? null;
        const promiseAhead = outs.find((c) => c.dueOn >= today)?.dueOn ?? null;
        if (future || promiseAhead) {
          const overdueRearmed = outs.some((c) => c.dueOn < today);
          held = promiseAhead && !(overdueRearmed && future) ? `Promised ${fmtDayLabel(promiseAhead)} – waiting` : `Follow-up on ${fmtDayLabel(future!)}`;
        } else if (recs.length) {
          const sampleRec = recs.some((r) => SAMPLE_TYPES.has(r.type));
          tier = sampleRec ? 3 : 4;
          for (const r of recs) reasons.push({ kind: SAMPLE_TYPES.has(r.type) ? "sample" : "development", text: r.reason });
        }
      }
    }
    if (tier == null && !held) continue;

    out.push({
      username: u,
      phone: inf?.phone ?? null,
      tier: tier ?? 4,
      reasons,
      recs: recs.map((r) => ({ type: r.type, title: r.title, reason: r.reason, instruction: r.instruction, instructionMs: r.instructionMs, priority: r.priority })),
      status: paused ? "paused" : "active",
      pausedReason: st?.pausedReason ?? null,
      resumeOn: st?.resumeOn ?? null,
      nextOn: st?.nextOn ?? null,
      nextKind: st?.nextKind ?? null,
      lastContactedAt: st?.lastContactedAt?.toISOString() ?? null,
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
      priority: recs[0]?.priority ?? 0,
    });
  }

  const active = out.filter((r) => !r.held);
  const sortFn = (a: TodayRow, b: TodayRow) => a.tier - b.tier || b.priority - a.priority || a.username.localeCompare(b.username);
  active.sort(sortFn);
  const paused = out.filter((r) => r.status === "paused" && r.held).sort(sortFn);
  const scheduled = out.filter((r) => r.held && r.status === "active").sort((a, b) => (a.nextOn ?? "9").localeCompare(b.nextOn ?? "9"));

  // Focused default list: everything overdue/due, then a capped number of sample cases and a few development ideas.
  const due = active.filter((r) => r.tier <= 2);
  const samples = active.filter((r) => r.tier === 3);
  const dev = active.filter((r) => r.tier === 4);
  const focus = [...due, ...samples.slice(0, Math.max(0, cfg.todayLimit - due.length)), ...dev.slice(0, cfg.developmentLimit)];

  const [{ n: exceptionsSamples }] = await rows<{ n: number }>(sql`
    select count(*)::int as n from (
      select s.id from samples s join sample_content sc on sc.sample_id = s.id and sc.confidence = 'uncertain'
      where coalesce(s.result_override, s.result) = 'uncertain'
      group by s.id
      union all select s.id from samples s where s.source = 'orders' and s.creator is null and s.order_status <> 'Canceled'
    ) x`);

  const exceptions = exceptionsSamples + comms.filter((c) => c.state !== "fulfilled" && c.candidates.length > 0 && c.sampleIds.length === 0).length;
  const pick: Record<TodayView, TodayRow[]> = { focus, due, samples, development: dev, scheduled, paused };
  return {
    today,
    cfg,
    rows: pick[view],
    counts: { focus: focus.length, due: due.length, samples: samples.length, development: dev.length, scheduled: scheduled.length, paused: paused.length },
    hiddenFromFocus: active.length - focus.length,
    exceptions,
  };
}

/** Number of creators needing work today (due + overdue), for the sidebar badge. */
export async function dueTodayCount(): Promise<number> {
  const d = await getToday("due");
  return d.counts.due;
}
