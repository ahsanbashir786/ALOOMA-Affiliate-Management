import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { can, mayEditContacts, requireUser } from "@/lib/auth";
import { getToday, type TodayRow, type TodayView } from "@/lib/workflow/today";
import { fmtDateTimeKL, fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { RegenerateButton } from "@/components/actions/regenerate-button";
import { AddCreator } from "@/components/today/add-creator";
import { TodayList, type TodayItem } from "@/components/today/today-list";
import { cn } from "@/lib/utils";
import { RELATIONSHIP } from "@/lib/workflow/relationship";

export const metadata: Metadata = { title: "Today's Work" };

const VIEWS: { key: TodayView; label: string; hint: string }[] = [
  { key: "focus", label: "Today", hint: "Everything due, plus the most important sample cases and a few ideas" },
  { key: "due", label: "Due & overdue", hint: "Promises and follow-ups that need you now" },
  { key: "verify", label: "To verify", hint: "Possible content waiting for a yes or no" },
  { key: "samples", label: "Samples", hint: "Samples that need a nudge" },
  { key: "development", label: "Opportunities", hint: "Recruit new creators, develop existing ones, reactivate inactive ones" },
  { key: "scheduled", label: "Scheduled", hint: "Already handled – waiting for their date" },
  { key: "paused", label: "Paused", hint: "On hold" },
];

function toItem(r: TodayRow): TodayItem {
  const c = r.commitment;
  return {
    username: r.username,
    phone: r.phone,
    tier: r.tier,
    relationship: { key: r.relationship, ...RELATIONSHIP[r.relationship] },
    opportunity: r.opportunity,
    obligations: r.obligations.map((o) => ({ id: o.id, label: o.label, contentType: o.contentType, done: o.done, needed: o.needed, dueLabel: o.dueLabel, lateDays: o.lateDays, moved: o.moved })),
    deadline: r.deadline,
    history: r.history,
    reasons: r.reasons,
    recs: r.recs,
    status: r.status,
    nextLabel: r.nextOn ? fmtDayLabel(r.nextOn) : null,
    lastContacted: r.lastContactedAt ? `${fmtDateTimeKL(r.lastContactedAt)}${r.lastContactedBy ? ` by ${r.lastContactedBy}` : ""}` : null,
    commitment: c
      ? {
          id: c.id,
          dueLabel: fmtDayLabel(c.dueOn),
          originalLabel: c.dueOn !== c.promisedOn ? fmtDayLabel(c.promisedOn) : null,
          state: c.state,
          done: c.done,
          needed: c.needed,
          contentType: c.contentType,
          productName: c.productName,
          details: c.details,
          candidates: c.candidates.map((x) => ({ contentId: x.contentId, kind: x.kind, link: x.link, postedLabel: x.postedOn ? fmtDayLabel(x.postedOn) : null })),
        }
      : null,
    otherCommitments: r.otherCommitments,
    suggest: r.suggest,
    attempts: r.attempts,
    suggestPause: r.suggestPause,
    samples: r.samples.map((s) => ({
      id: s.id,
      product: s.product,
      approvedLabel: s.approvedOn ? fmtDayLabel(s.approvedOn) : null,
      shippedLabel: s.shippedOn ? fmtDayLabel(s.shippedOn) : null,
      deliveredLabel: s.deliveredOn ? fmtDayLabel(s.deliveredOn) : null,
      postByLabel: s.postBy ? fmtDayLabel(s.postBy) : null,
      agreed: s.postBySource === "agreed",
      result: s.result,
    })),
    held: r.held,
    pausedLabel: r.pausedReason,
    followKind: r.nextKind ?? "follow_up",
  };
}

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;
  const view = (VIEWS.find((v) => v.key === one(sp.view))?.key ?? "focus") as TodayView;
  const data = await getToday(view);
  const counts = data.counts;
  const canAct = can(user, "manager");
  const items = data.rows.map(toItem);
  const current = VIEWS.find((v) => v.key === view)!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Today's Work"
        description={`${fmtDayLabel(data.today)} · Malaysia time. Opening WhatsApp or copying a message does not count as contact – press “Contacted” after you send it.`}
        actions={canAct ? <div className="flex flex-wrap items-start gap-2"><AddCreator canPhone={mayEditContacts(user)} /><RegenerateButton /></div> : undefined}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "focus" ? "/today" : `/today?view=${v.key}`}
              aria-current={view === v.key ? "page" : undefined}
              title={v.hint}
              className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] font-medium", view === v.key ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink")}
            >
              {v.label}
              <span className="tnum rounded-full bg-surface-2 px-1.5 text-[12px] text-ink-2">{counts[v.key]}</span>
            </Link>
          ))}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[13px] text-ink-3">
            {current.hint}.
            {view === "focus" && data.hiddenFromFocus > 0 && (
              <> {data.hiddenFromFocus} more need work – see <Link className="underline" href="/today?view=samples">Samples</Link> or <Link className="underline" href="/today?view=development">Opportunities</Link>.</>
            )}
          </p>
          {data.exceptions > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-[12.5px]" aria-label="Sample exceptions">
              <span className="text-ink-3">Sample exceptions:</span>
              {data.sampleExceptions.review > 0 && <Link className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-warn" href="/samples?view=review">{data.sampleExceptions.review} to review</Link>}
              {data.sampleExceptions.unmatched > 0 && <Link className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-warn" href="/samples?view=unknown">{data.sampleExceptions.unmatched} receiver not matched</Link>}
              {data.sampleExceptions.stuck > 0 && <Link className="rounded-full border border-critical/40 bg-critical-soft px-2 py-0.5 text-critical" href="/samples?view=wait">{data.sampleExceptions.stuck} shipped, not delivered</Link>}
            </p>
          )}

          {items.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="size-5" />}
              title={view === "focus" ? "You're all caught up" : "Nothing here"}
              description={view === "focus" ? "No promises or follow-ups are due. New work appears after the next data upload or refresh." : "No creators in this list right now."}
            />
          ) : (
            <TodayList key={view} items={items} today={data.today} helpDays={data.cfg.helpDays} canAct={canAct} />
          )}
        </div>
      </Card>
    </div>
  );
}
