import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProgress, PROGRESS_RANGES } from "@/lib/workflow/progress";
import { getOwnerDecisions } from "@/lib/workflow/records";
import { RELATIONSHIP, type Relationship } from "@/lib/workflow/relationship";
import { fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { fmtRM, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Progress" };

type Part = { label: string; value: number; bar: string; href?: string };

/** A stacked bar whose legend entries are links to the records behind each number. */
function StackBar({ parts, caption }: { parts: Part[]; caption?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={caption ?? "Breakdown"}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={p.bar} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {parts.map((p) => {
          const inner = (
            <>
              <span className={cn("mr-1.5 inline-block size-2.5 rounded-sm align-middle", p.bar)} />
              {p.label} <b className="tnum">{p.value}</b>
            </>
          );
          return <li key={p.label}>{p.href && p.value > 0 ? <Link href={p.href} className="hover:underline">{inner}</Link> : <span className="text-ink-3">{inner}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

function Num({ label, value, href, sub, kind }: { label: string; value: React.ReactNode; href?: string; sub?: string; kind?: "staff" | "system" }) {
  const body = (
    <div className="rounded-xl border border-line bg-surface p-3 hover:bg-surface-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
        {kind && <span className={cn("text-[11px]", kind === "staff" ? "text-brand" : "text-ink-3")}>{kind === "staff" ? "staff-confirmed" : "system-detected"}</span>}
      </div>
      <p className="tnum text-[24px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Spark({ values, bar }: { values: number[]; bar: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className="inline-flex h-6 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => <span key={i} className={cn("w-2 rounded-sm", bar, i === values.length - 1 && "opacity-100", i !== values.length - 1 && "opacity-60")} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}
    </span>
  );
}

export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  await requireUser("admin");
  const sp = (await searchParams) as SP;
  const days = PROGRESS_RANGES.find((d) => String(d) === one(sp.days)) ?? 28;
  const [p, decisions] = await Promise.all([getProgress(days), getOwnerDecisions(days)]);
  const f = p.followUps;
  const pr = p.promises;
  const c = p.content;
  const cmp = p.sales.comparison;
  const L = (m: string) => `/progress/records?m=${m}&days=${days}`;
  const rate = f.onTimeRate == null ? "–" : `${Math.round(f.onTimeRate * 100)}%`;
  const relOrder: Relationship[] = ["collaborating", "active", "approached", "prospect", "inactive", "stalled", "paused"];
  const relBar: Record<Relationship, string> = { collaborating: "bg-good", active: "bg-brand", approached: "bg-line-strong", prospect: "bg-surface-2 border border-line", inactive: "bg-warn", stalled: "bg-critical", paused: "bg-ink-3" };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Progress"
        description={`${fmtDayLabel(p.window.start)} – ${fmtDayLabel(p.window.end)} · ${days} days · Malaysia time. Click any figure to see the records behind it.`}
        actions={
          <div role="group" aria-label="Period" className="inline-flex overflow-hidden rounded-lg border border-line-strong text-[13px] font-medium">
            {PROGRESS_RANGES.map((d) => (
              <Link key={d} href={`/progress?days=${d}`} aria-current={d === days ? "page" : undefined} className={cn("px-3 py-1.5", d === days ? "bg-brand text-white" : "hover:bg-surface-2")}>{d} days</Link>
            ))}
          </div>
        }
      />

      <Card>
        <CardHeader title="Needs your decision" description="Derived from the records – nothing is typed in." />
        {decisions.length === 0 ? (
          <p className="px-5 pb-5 text-[13.5px] text-ink-2">Nothing needs a decision right now.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {decisions.map((d) => (
              <li key={d.key}>
                <Link href={d.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                  <Badge tone={d.tone === "critical" ? "critical" : "warn"}>{d.count}</Badge>
                  <span className="min-w-0 flex-1"><span className="text-[14px] font-medium">{d.title}</span><span className="block truncate text-[12.5px] text-ink-3">{d.hint}</span></span>
                  <ArrowRight className="size-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-label="Follow-ups" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Follow-ups <span className="text-[12px] font-normal text-ink-3">staff-confirmed</span></h2>
          <p className="text-[13px] text-ink-2">On-time rate <b className="tnum text-[18px] text-ink">{rate}</b> <span className="text-ink-3">= on time ÷ (on time + late + still overdue)</span></p>
        </div>
        <StackBar
          caption="Follow-ups by outcome"
          parts={[
            { label: "On time", value: f.onTime, bar: "bg-good", href: L("fu_onTime") },
            { label: "Late", value: f.late, bar: "bg-warn", href: L("fu_late") },
            { label: "Overdue", value: f.overdueOpen, bar: "bg-critical", href: L("fu_overdue") },
            { label: "Rescheduled", value: f.rescheduled, bar: "bg-line-strong", href: L("fu_rescheduled") },
            { label: "Paused", value: f.pausedOrCancelled, bar: "bg-ink-3", href: L("fu_paused") },
            { label: "Resolved by content", value: f.resolvedAutomatically, bar: "bg-brand", href: L("fu_auto") },
            { label: "Not due yet", value: f.notYetDue, bar: "bg-surface-2 border border-line", href: L("fu_due") },
          ]}
        />
        <p className="text-[12px] text-ink-3">Rescheduled and paused work earns no credit and stays out of the rate. <Link className="underline" href={L("fu_due")}>All {f.due} follow-ups due</Link>.</p>
      </section>

      <section aria-label="Promises" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Promises <span className="text-[12px] font-normal text-ink-3">secured by staff · fulfilment detected by the system</span></h2>
        <StackBar
          caption="Promises by state"
          parts={[
            { label: "Fulfilled on time", value: pr.fulfilledOnTime, bar: "bg-good", href: L("pr_fulfilled") },
            { label: "Fulfilled late", value: pr.fulfilledLate, bar: "bg-warn", href: L("pr_fulfilled") },
            { label: "Posting date unknown", value: pr.fulfilledTimingUnknown, bar: "bg-brand", href: L("pr_fulfilled") },
            { label: "Partly done", value: pr.partial, bar: "bg-serious", href: L("pr_partial") },
            { label: "To check", value: pr.toReview, bar: "bg-line-strong", href: L("pr_review") },
            { label: "Overdue", value: pr.overdueOpen, bar: "bg-critical", href: L("pr_overdue") },
            { label: "Not due yet", value: pr.notYetDue, bar: "bg-surface-2 border border-line", href: L("pr_due") },
          ]}
        />
        <p className="text-[12.5px] text-ink-3">
          <Link className="underline" href={L("promises_new")}>{p.staff.promisesRecorded} promises secured</Link> in the period · <Link className="underline" href={L("promises_moved")}>{p.staff.deadlinesMoved} deadlines moved</Link> (not counted as new) · {pr.withoutSample} of {pr.due} due without a sample.
        </p>
      </section>

      <section aria-label="Activity and output" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Activity and output</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num kind="staff" label="Different creators contacted" value={p.staff.creatorsContacted} href={L("contacted")} sub={`${p.staff.contactActions} Contacted actions`} />
          <Num kind="system" label="New content after outreach" value={c.total} href={L("content")} sub={`${c.confirmedByStaff} confirmed by staff · ${c.fromCreatorsWithoutSamples} from creators without samples`} />
          <Num kind="system" label="Content counted from" value={`${c.videoReportCoverage.covered}/${c.videoReportCoverage.total} d`} sub="days covered by Video analysis" />
        </div>
        {c.videoReportCoverage.covered < c.videoReportCoverage.total && <p className="text-[12.5px] text-warn">Video analysis does not cover the whole period, so content counts are a minimum.</p>}
        <p className="text-[12px] text-ink-3">“After outreach” is timing only – it does not show the contact caused the content.</p>
      </section>

      <section aria-label="Relationships" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Relationships <span className="text-[12px] font-normal text-ink-3">derived from records</span></h2>
        <StackBar caption="Relationships by status" parts={relOrder.map((k) => ({ label: RELATIONSHIP[k].label, value: p.relationships[k], bar: relBar[k], href: L(`rel_${k}`) }))} />
      </section>

      <Card>
        <CardHeader title="Last 8 weeks" description="Weeks start on Monday." />
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="text-left text-ink-3"><th className="px-5 py-1.5 font-medium">Week of</th><th className="px-3 font-medium">Creators contacted</th><th className="px-3 font-medium">Follow-ups on time</th><th className="px-3 font-medium">Promises fulfilled</th><th className="px-3 font-medium">New content</th></tr></thead>
          <tbody>
            {p.trend.map((t) => (
              <tr key={t.weekStart} className="border-t border-line"><td className="px-5 py-1.5">{fmtDayLabel(t.weekStart)}</td><td className="tnum px-3">{t.contacted}</td><td className="tnum px-3">{t.onTime}</td><td className="tnum px-3">{t.fulfilled}</td><td className="tnum px-3">{t.content}</td></tr>
            ))}
            <tr className="border-t border-line bg-surface-2/50">
              <td className="px-5 py-1.5 text-ink-3">Trend</td>
              <td className="px-3"><Spark values={p.trend.map((t) => t.contacted)} bar="bg-brand" /></td>
              <td className="px-3"><Spark values={p.trend.map((t) => t.onTime)} bar="bg-good" /></td>
              <td className="px-3"><Spark values={p.trend.map((t) => t.fulfilled)} bar="bg-good" /></td>
              <td className="px-3"><Spark values={p.trend.map((t) => t.content)} bar="bg-brand" /></td>
            </tr>
          </tbody>
        </table>
      </Card>

      {p.staff.byPerson.length > 0 && (
        <Card>
          <CardHeader title="By person" description="Only what each person pressed in the app." />
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-left text-ink-3"><th className="px-5 py-1.5 font-medium">Person</th><th className="px-3 font-medium">Contacted</th><th className="px-3 font-medium">Creators</th><th className="px-3 font-medium">Promises</th><th className="px-3 font-medium">Follow-ups on time</th></tr></thead>
            <tbody>{p.staff.byPerson.map((b) => <tr key={b.name} className="border-t border-line"><td className="px-5 py-1.5 font-medium">{b.name}</td><td className="tnum px-3">{b.contacts}</td><td className="tnum px-3">{b.creators}</td><td className="tnum px-3">{b.promises}</td><td className="tnum px-3">{b.followUpsOnTime}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      <section aria-label="Sales movement" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Sales movement <span className="text-[12px] font-normal text-ink-3">system-detected · context only</span></h2>
        {cmp.current && cmp.previous ? (
          <p className="text-[13px] text-ink-2">
            Comparing {fmtDayLabel(cmp.current.start)} – {fmtDayLabel(cmp.current.end)} with {fmtDayLabel(cmp.previous.start)} – {fmtDayLabel(cmp.previous.end)} ({cmp.current.days} days each).
            {cmp.shortened && <> Order data only reaches {fmtDayLabel(cmp.current.end)}, so both periods were shortened equally.</>}
          </p>
        ) : (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-ink">Comparison withheld. {cmp.withheld}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <Num label="Newly selling" value={p.sales.newlySelling ?? "–"} sub={p.sales.newlySelling == null ? "not enough covered history" : "first observed sale"} />
          <Num label="Reactivated" value={p.sales.reactivated ?? "–"} sub={p.sales.reactivated == null ? "not enough covered history" : "sold earlier, quiet 28 days, selling again"} />
          <Num label="Managed creators" value={p.sales.managed} sub="contacted at least once" />
          <Num label="Their sales vs before" value={p.sales.managedNow == null ? "–" : fmtRM(p.sales.managedNow)} sub={p.sales.managedNow == null ? "withheld" : `was ${fmtRM(p.sales.managedBefore ?? 0)} · ${p.sales.managedGrowing} up · ${p.sales.managedFalling} down`} />
        </div>
        {p.sales.historyNote && <p className="text-[12px] text-ink-3">{p.sales.historyNote}</p>}
        <p className="text-[12px] text-ink-3">Order files cover {p.sales.coverage.affiliate} (affiliate) and {p.sales.coverage.shop} (shop) of the {p.sales.coverage.total} days. A missing upload is never read as zero sales.</p>
      </section>

      <details className="rounded-xl border border-line bg-surface p-4 text-[13.5px] text-ink-2">
        <summary className="cursor-pointer text-[14px] font-medium text-ink">How these numbers are defined</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Staff-confirmed</b> = a person pressed a button (Contacted, Promised date…). Opening WhatsApp or copying a message is never counted. <b>System-detected</b> = found in the uploaded TikTok files.</li>
          <li><b>Follow-up</b>: one per promise plus a creator-level one. Completed only by a recorded Contacted (or a promised date the creator gave). On-time rate = on time ÷ (on time + late + still overdue). Rescheduled, paused, and resolved-by-content are shown apart.</li>
          <li><b>Promise</b>: a creator’s date, optionally with video/LIVE, product and quantity. Moving the date keeps the original. <b>Fulfilled</b> = the required number of distinct matching pieces with a known posting date after the promise, or confirmed by staff.</li>
          <li><b>Relationship</b> is derived: Working together (an open promise or sample), Selling (sale in the last 28 days), Approached (contacted only), Stalled (3+ contacts without a promise or content, or a promise 14+ days overdue), Inactive, Paused, New. Limits are in Settings.</li>
          <li><b>Content after outreach</b> counts distinct videos/LIVEs after the creator’s first recorded contact, each once; a verification date is never a posting date.</li>
          <li><b>Sales movement</b> compares equal-length periods only where both are fully covered by both order files; the effective dates are shown. “First observed sale” = earliest sale in the uploaded history.</li>
          <li>No reply rate is measured: replies are not logged, and message counts alone are never used to judge performance.</li>
        </ul>
      </details>
    </div>
  );
}
