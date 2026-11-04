import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProgress, PROGRESS_RANGES } from "@/lib/workflow/progress";
import { getOwnerDecisions } from "@/lib/workflow/records";
import { getActionResults } from "@/lib/workflow/results";
import { RELATIONSHIP, type Relationship } from "@/lib/workflow/relationship";
import { fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Badge } from "@/components/ui/primitives";
import { WorkHeader } from "@/components/work/work-header";
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

function Frame({ title, tag, accent, children }: { title: string; tag: string; accent: string; children: React.ReactNode }) {
  return (
    <section className={cn("space-y-4 rounded-xl border border-line border-l-4 bg-surface p-5", accent)}>
      <div className="flex items-baseline gap-3"><h2 className="text-[17px] font-semibold text-ink">{title}</h2><span className="text-[13px] text-ink-3">{tag}</span></div>
      {children}
    </section>
  );
}

function WeekBars({ weeks }: { weeks: { weekStart: string; contacted: number; content: number }[] }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.contacted, w.content]));
  return (
    <div>
      <div className="flex h-28 items-end gap-3" role="img" aria-label="Creators contacted and new content per week">
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex h-full flex-1 items-end justify-center gap-1" title={`${fmtDayLabel(w.weekStart)}: ${w.contacted} contacted, ${w.content} new content`}>
            <span className="w-3 rounded-t bg-brand" style={{ height: `${Math.max(4, (w.contacted / max) * 100)}%` }} />
            <span className="w-3 rounded-t bg-good" style={{ height: `${Math.max(4, (w.content / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 text-[12.5px] text-ink-3">{weeks.map((w) => <span key={w.weekStart} className="flex-1 text-center">{fmtDayLabel(w.weekStart)}</span>)}</div>
      <p className="mt-2 flex gap-4 text-[13px] text-ink-2"><span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-brand align-middle" />Creators contacted</span><span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-good align-middle" />New content</span></p>
    </div>
  );
}

export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  await requireUser("admin");
  const sp = (await searchParams) as SP;
  const days = PROGRESS_RANGES.find((d) => String(d) === one(sp.days)) ?? 28;
  const [p, decisions, res] = await Promise.all([getProgress(days), getOwnerDecisions(days), getActionResults(days)]);
  const resChange = res.before > 0 ? Math.round((res.after / res.before - 1) * 100) : null;
  const f = p.followUps;
  const pr = p.promises;
  const c = p.content;
  const cmp = p.sales.comparison;
  const L = (m: string) => `/progress/records?m=${m}&days=${days}`;
  const rate = f.onTimeRate == null ? null : Math.round(f.onTimeRate * 100);
  const relOrder: Relationship[] = ["collaborating", "active", "approached", "prospect", "inactive", "stalled", "paused"];
  const relBar: Record<Relationship, string> = { collaborating: "bg-good", active: "bg-brand", approached: "bg-line-strong", prospect: "bg-surface-2 border border-line", inactive: "bg-warn", stalled: "bg-critical", paused: "bg-ink-3" };

  return (
    <div className="space-y-6">
      <WorkHeader
        current="track"
        title="Progress"
        isOwner
        purpose={`${fmtDayLabel(p.window.start)} – ${fmtDayLabel(p.window.end)} · ${days} days · Are staff working, did it help sales, and what needs you?`}
        actions={
          <div role="group" aria-label="Period" className="inline-flex overflow-hidden rounded-lg border border-line-strong text-[14px] font-medium">
            {PROGRESS_RANGES.map((d) => (
              <Link key={d} href={`/progress?days=${d}`} aria-current={d === days ? "page" : undefined} className={cn("px-3.5 py-2", d === days ? "bg-brand text-white" : "hover:bg-surface-2")}>{d} days</Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3" data-testid="progress-answers" aria-label="Three answers">
        <a href="#staff" className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-2">
          <p className="text-[13px] font-medium text-ink-3">1 · Are staff working?</p>
          <p className="tnum mt-1 text-[28px] leading-tight font-semibold text-ink">{p.staff.byPerson.reduce((a, b) => a + b.contacts, 0)} <span className="text-[15px] font-normal text-ink-3">actions</span></p>
          <p className="text-[13px] text-ink-3">{rate == null ? "No follow-ups judged yet" : `${rate}% of follow-ups on time`} · {p.staff.byPerson.length} {p.staff.byPerson.length === 1 ? "person" : "people"}</p>
        </a>
        <a href="#results" className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-2">
          <p className="text-[13px] font-medium text-ink-3">2 · Did it help sales?</p>
          {res.measured === 0 ? (
            <><p className="mt-1 text-[20px] leading-tight font-semibold text-ink">Not measured yet</p><p className="text-[13px] text-ink-3">Needs 28 days after first contact{res.waiting > 0 ? ` · ${res.waiting} waiting` : ""}</p></>
          ) : (
            <><p className={cn("tnum mt-1 text-[28px] leading-tight font-semibold", resChange != null && resChange < 0 ? "text-critical" : "text-good")}>{resChange == null ? "–" : `${resChange >= 0 ? "▲" : "▼"} ${Math.abs(resChange)}%`}</p><p className="text-[13px] text-ink-3">GMV after vs before · {res.posted} of {res.measured} posted</p></>
          )}
        </a>
        <a href="#decisions" className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-2">
          <p className="text-[13px] font-medium text-ink-3">3 · What needs me?</p>
          <p className={cn("tnum mt-1 text-[28px] leading-tight font-semibold", decisions.length > 0 ? "text-warn" : "text-ink")}>{decisions.reduce((a, d) => a + d.count, 0)} <span className="text-[15px] font-normal text-ink-3">to decide</span></p>
          <p className="text-[13px] text-ink-3">{decisions.length === 0 ? "Nothing right now" : `${decisions.length} kind${decisions.length === 1 ? "" : "s"} of decision`}</p>
        </a>
      </div>

      <div id="decisions" className="scroll-mt-24" /><Frame title="Needs your decision" tag="Unresolved exceptions" accent="border-l-warn">
        {decisions.length === 0 ? (
          <p className="text-[14.5px] text-ink-2">Nothing needs a decision right now.</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {decisions.map((d) => (
              <li key={d.key}>
                <Link href={d.href} className="flex items-center gap-4 py-3 hover:bg-surface-2">
                  <Badge tone={d.tone === "critical" ? "critical" : "warn"}>{d.count}</Badge>
                  <span className="min-w-0 flex-1"><span className="text-[15px] font-medium text-ink">{d.title}</span><span className="block text-[13.5px] text-ink-3">{d.hint}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Frame>

      <div id="staff" className="scroll-mt-24" /><Frame title="Staff performance" tag="Who did what – staff-confirmed" accent="border-l-brand">
        {p.staff.byPerson.length === 0 ? (
          <p className="text-[14.5px] text-ink-2" data-testid="staff-performance">No staff actions recorded in this period yet.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="staff-performance">
            <table className="w-full min-w-[520px] border-collapse text-[14px]">
              <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-medium">Person</th><th className="px-3 font-medium">Actions</th><th className="px-3 font-medium">Creators reached</th><th className="px-3 font-medium">Promises recorded</th><th className="px-3 font-medium">Follow-ups on time</th><th className="px-3 font-medium">Creators who posted after</th></tr></thead>
              <tbody>{p.staff.byPerson.map((b) => { const r = res.byStaff.find((x) => x.name === b.name); return <tr key={b.name} className="border-t border-line"><td className="py-2 pr-3 font-medium">{b.name}</td><td className="tnum px-3">{b.contacts}</td><td className="tnum px-3">{b.creators}</td><td className="tnum px-3">{b.promises}</td><td className="tnum px-3">{b.followUpsOnTime}</td><td className="tnum px-3">{r ? `${r.posted} of ${r.n}` : "–"}</td></tr>; })}</tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-ink-3">Opening WhatsApp or copying a message is never counted – only the buttons staff press. “Posted after” counts creators with a video in the 28 days after their first contact.</p>
      </Frame>

      <div id="results" className="scroll-mt-24" /><Frame title="Results after action" tag="Sales 28 days after first contact, against the 28 days before – context, not proof" accent="border-l-good">
        {res.measured === 0 ? (
          <p className="text-[14.5px] text-ink-2" data-testid="results-empty">Not enough history yet. A creator is measured once 28 days have passed since staff first contacted them{res.waiting > 0 ? ` (${res.waiting} contacted too recently)` : ""}. Keep recording actions and this fills in.</p>
        ) : (
          <div className="space-y-4" data-testid="results">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-surface-2 p-3.5"><p className="text-[13px] text-ink-3">Creators measured</p><p className="tnum text-[22px] font-semibold">{res.measured}</p></div>
              <div className="rounded-xl bg-surface-2 p-3.5"><p className="text-[13px] text-ink-3">GMV before</p><p className="tnum text-[22px] font-semibold">{fmtRM(res.before)}</p></div>
              <div className="rounded-xl bg-surface-2 p-3.5"><p className="text-[13px] text-ink-3">GMV after</p><p className="tnum text-[22px] font-semibold">{fmtRM(res.after)}{resChange != null && <span className={cn("ml-2 text-[14px]", resChange >= 0 ? "text-good" : "text-critical")}>{resChange >= 0 ? "▲" : "▼"} {Math.abs(resChange)}%</span>}</p></div>
              <div className="rounded-xl bg-surface-2 p-3.5"><p className="text-[13px] text-ink-3">Posted a video after</p><p className="tnum text-[22px] font-semibold">{res.posted} of {res.measured}</p></div>
            </div>
            <table className="w-full min-w-[420px] border-collapse text-[14px]">
              <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-medium">Action</th><th className="px-3 font-medium">Creators</th><th className="px-3 font-medium">GMV before</th><th className="px-3 font-medium">GMV after</th><th className="px-3 font-medium">Posted after</th></tr></thead>
              <tbody>{res.byAction.map((a) => <tr key={a.action} className="border-t border-line"><td className="py-2 pr-3 font-medium">{a.action}</td><td className="tnum px-3">{a.n}</td><td className="tnum px-3">{fmtRM(a.before)}</td><td className="tnum px-3">{fmtRM(a.after)}</td><td className="tnum px-3">{a.posted} of {a.n}</td></tr>)}</tbody>
            </table>
            <p className="text-[13px] text-ink-3">{res.waiting > 0 ? `${res.waiting} more creators were contacted too recently to measure. ` : ""}Sales also move for other reasons (season, promotions, new videos), so read this as a direction, not as proof.</p>
          </div>
        )}
      </Frame>

      <Frame title="Staff execution" tag="Staff-confirmed – what people pressed" accent="border-l-brand">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[14px] text-ink-3">Follow-ups done on time</p>
            <p className="tnum text-[34px] font-semibold leading-tight">{rate == null ? "–" : `${rate}%`}</p>
          </div>
          <div className="min-w-60 flex-1">
            <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={rate ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="On-time rate"><div className="h-full rounded-full bg-good" style={{ width: `${rate ?? 0}%` }} /></div>
            <p className="mt-1.5 text-[13.5px] text-ink-3">On-time rate = on time ÷ (on time + late + still overdue)</p>
          </div>
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
          ]}
        />
        <p className="text-[14px] text-ink-2">
          <Link className="font-medium hover:underline" href={L("contacted")}><b className="tnum">{p.staff.creatorsContacted}</b> creators contacted</Link> ·{" "}
          <Link className="font-medium hover:underline" href={L("promises_new")}><b className="tnum">{p.staff.promisesRecorded}</b> promises secured</Link> ·{" "}
          <Link className="font-medium hover:underline" href={L("promises_moved")}><b className="tnum">{p.staff.deadlinesMoved}</b> deadlines moved</Link>
          <span className="text-ink-3"> · rescheduled and paused work earns no credit</span>
        </p>
      </Frame>

      <Frame title="Affiliate output" tag="System-detected from the TikTok files" accent="border-l-good">
        <div>
          <p className="mb-2 text-[14px] text-ink-3">Promises due in this period</p>
          <StackBar
            caption="Promises by state"
            parts={[
              { label: "On time", value: pr.fulfilledOnTime, bar: "bg-good", href: L("pr_fulfilled") },
              { label: "Late", value: pr.fulfilledLate, bar: "bg-warn", href: L("pr_fulfilled") },
              { label: "Date unknown", value: pr.fulfilledTimingUnknown, bar: "bg-brand", href: L("pr_fulfilled") },
              { label: "Partly done", value: pr.partial, bar: "bg-serious", href: L("pr_partial") },
              { label: "To check", value: pr.toReview, bar: "bg-line-strong", href: L("pr_review") },
              { label: "Overdue", value: pr.overdueOpen, bar: "bg-critical", href: L("pr_overdue") },
            ]}
          />
        </div>
        <p className="text-[14px] text-ink-2">
          <Link className="font-medium hover:underline" href={L("content")}><b className="tnum">{c.total}</b> new content pieces after outreach</Link>
          <span className="text-ink-3"> · {c.confirmedByStaff} confirmed by staff · timing only, not proof the contact caused it</span>
        </p>
        {c.videoReportCoverage.covered < c.videoReportCoverage.total && <p className="text-[13.5px] text-warn">Video analysis covers {c.videoReportCoverage.covered} of {c.videoReportCoverage.total} days, so content counts are a minimum.</p>}
        <div>
          <p className="mb-2 text-[14px] text-ink-3">Where relationships stand</p>
          <StackBar caption="Relationships by status" parts={relOrder.map((k) => ({ label: RELATIONSHIP[k].label, value: p.relationships[k], bar: relBar[k], href: L(`rel_${k}`) }))} />
        </div>
        <div>
          <p className="mb-2 text-[14px] text-ink-3">Last 8 weeks</p>
          <WeekBars weeks={p.trend} />
        </div>
      </Frame>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">Supporting tables</summary>
        <div className="space-y-5 px-5 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[14px]">
              <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-medium">Week of</th><th className="px-3 font-medium">Contacted</th><th className="px-3 font-medium">Follow-ups on time</th><th className="px-3 font-medium">Promises fulfilled</th><th className="px-3 font-medium">New content</th></tr></thead>
              <tbody>{p.trend.map((t) => <tr key={t.weekStart} className="border-t border-line"><td className="py-2 pr-3">{fmtDayLabel(t.weekStart)}</td><td className="tnum px-3">{t.contacted}</td><td className="tnum px-3">{t.onTime}</td><td className="tnum px-3">{t.fulfilled}</td><td className="tnum px-3">{t.content}</td></tr>)}</tbody>
            </table>
          </div>
          {p.staff.byPerson.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-[14px] font-medium text-ink">By person <span className="font-normal text-ink-3">– only what each person pressed</span></p>
              <table className="w-full min-w-[480px] border-collapse text-[14px]">
                <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-medium">Person</th><th className="px-3 font-medium">Contacted</th><th className="px-3 font-medium">Creators</th><th className="px-3 font-medium">Promises</th><th className="px-3 font-medium">On time</th></tr></thead>
                <tbody>{p.staff.byPerson.map((b) => <tr key={b.name} className="border-t border-line"><td className="py-2 pr-3 font-medium">{b.name}</td><td className="tnum px-3">{b.contacts}</td><td className="tnum px-3">{b.creators}</td><td className="tnum px-3">{b.promises}</td><td className="tnum px-3">{b.followUpsOnTime}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">Sales movement <span className="font-normal text-ink-3">– context only, system-detected</span></summary>
        <div className="space-y-3 px-5 pb-5 text-[14px] text-ink-2">
          {cmp.current && cmp.previous ? (
            <p>Comparing {fmtDayLabel(cmp.current.start)} – {fmtDayLabel(cmp.current.end)} with {fmtDayLabel(cmp.previous.start)} – {fmtDayLabel(cmp.previous.end)} ({cmp.current.days} days each).{cmp.shortened && <> Order data only reaches {fmtDayLabel(cmp.current.end)}, so both periods were shortened equally.</>}</p>
          ) : (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-ink">Comparison withheld. {cmp.withheld}</p>
          )}
          <ul className="grid gap-3 sm:grid-cols-4">
            <li><b className="tnum text-[20px] text-ink">{p.sales.newlySelling ?? "–"}</b><br />newly selling (first observed sale)</li>
            <li><b className="tnum text-[20px] text-ink">{p.sales.reactivated ?? "–"}</b><br />reactivated</li>
            <li><b className="tnum text-[20px] text-ink">{p.sales.managed}</b><br />managed creators</li>
            <li><b className="tnum text-[20px] text-ink">{p.sales.managedNow == null ? "–" : fmtRM(p.sales.managedNow)}</b><br />{p.sales.managedNow == null ? "their sales (withheld)" : `their sales · was ${fmtRM(p.sales.managedBefore ?? 0)} · ${p.sales.managedGrowing} up · ${p.sales.managedFalling} down`}</li>
          </ul>
          {p.sales.historyNote && <p className="text-[13.5px] text-ink-3">{p.sales.historyNote}</p>}
          <p className="text-[13.5px] text-ink-3">Order files cover {p.sales.coverage.affiliate} (affiliate) and {p.sales.coverage.shop} (shop) of the {p.sales.coverage.total} days. A missing upload is never read as zero sales. <Link className="underline" href="/">Open the sales overview</Link>.</p>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium text-ink">How these numbers are defined</summary>
        <ul className="list-disc space-y-2 px-10 pb-5 text-[14px] text-ink-2">
          <li><b>Staff-confirmed</b> = a person pressed a button. Opening WhatsApp or copying a message is never counted. <b>System-detected</b> = found in the uploaded TikTok files.</li>
          <li><b>Follow-up</b>: one per promise plus a creator-level one. Completed only by a recorded Contacted (or a promised date the creator gave). Rescheduled, paused and resolved-by-content are shown apart and earn no credit.</li>
          <li><b>Promise</b>: a creator’s date, optionally with video/LIVE, product and quantity. Moving the date keeps the original. <b>Fulfilled</b> = the required number of distinct matching pieces with a known posting date after the promise, or confirmed by staff.</li>
          <li><b>Relationship</b> is derived: Working together, Selling, Approached, Stalled (3+ contacts without a promise or content, or a promise 14+ days overdue), Inactive, Paused, New. Limits are in Settings.</li>
          <li><b>Content after outreach</b> counts distinct videos/LIVEs after the creator’s first recorded contact, each once; a verification date is never a posting date.</li>
          <li><b>Sales movement</b> compares equal-length periods only where both are fully covered by both order files. “First observed sale” = earliest sale in the uploaded history.</li>
          <li>No reply rate is measured, and message counts alone are never used to judge performance.</li>
        </ul>
      </details>
    </div>
  );
}
