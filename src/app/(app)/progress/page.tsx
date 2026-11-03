import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getProgress, PROGRESS_RANGES } from "@/lib/workflow/progress";
import { fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { fmtRM, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Progress" };

function Stat({ label, value, sub, kind }: { label: string; value: React.ReactNode; sub?: React.ReactNode; kind?: "staff" | "system" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
        {kind && <Badge tone={kind === "staff" ? "brand" : "neutral"}>{kind === "staff" ? "Staff-confirmed" : "System-detected"}</Badge>}
      </div>
      <p className="tnum mt-1 text-[26px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  await requireUser("admin");
  const sp = (await searchParams) as SP;
  const days = PROGRESS_RANGES.find((d) => String(d) === one(sp.days)) ?? 28;
  const p = await getProgress(days);
  const f = p.followUps;
  const s = p.staff;
  const c = p.content;
  const pr = p.promises;
  const cmp = p.sales.comparison;
  const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Progress"
        description={`${fmtDayLabel(p.window.start)} – ${fmtDayLabel(p.window.end)} (${days} days, Malaysia time).`}
        actions={
          <div role="group" aria-label="Period" className="inline-flex overflow-hidden rounded-lg border border-line-strong text-[13px] font-medium">
            {PROGRESS_RANGES.map((d) => (
              <Link key={d} href={`/progress?days=${d}`} aria-current={d === days ? "page" : undefined} className={cn("px-3 py-1.5", d === days ? "bg-brand text-white" : "hover:bg-surface-2")}>
                {d} days
              </Link>
            ))}
          </div>
        }
      />

      <section aria-label="Staff work" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Follow-ups</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="staff" label="On-time rate" value={pct(f.onTimeRate)} sub={`${f.onTime} on time ÷ (${f.onTime} on time + ${f.late} late + ${f.overdueOpen} still overdue)`} />
          <Stat kind="staff" label="Follow-ups due" value={f.due} sub={`${f.notYetDue} not due yet`} />
          <Stat kind="staff" label="Set aside, not done" value={f.rescheduled + f.pausedOrCancelled} sub={`${f.rescheduled} rescheduled · ${f.pausedOrCancelled} paused or cancelled – earn no credit`} />
          <Stat kind="system" label="Resolved automatically" value={f.resolvedAutomatically} sub="the promised content appeared, so nothing was left to chase" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="staff" label="Different creators contacted" value={s.creatorsContacted} sub={`${s.contactActions} “Contacted” actions in total`} />
          <Stat kind="staff" label="Promises recorded" value={s.promisesRecorded} sub="new promises only" />
          <Stat kind="staff" label="Deadlines moved" value={s.deadlinesMoved} sub="not counted as new promises" />
        </div>
        {s.byPerson.length > 0 && (
          <Card>
            <CardHeader title="By person" description="Only what each person pressed in the app." />
            <table className="w-full border-collapse text-[13.5px]">
              <thead><tr className="text-left text-ink-3"><th className="px-5 py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Contacted actions</th><th className="px-3 py-2 font-medium">Creators</th><th className="px-3 py-2 font-medium">Promises</th><th className="px-3 py-2 font-medium">Follow-ups on time</th></tr></thead>
              <tbody>
                {s.byPerson.map((b) => (
                  <tr key={b.name} className="border-t border-line"><td className="px-5 py-2 font-medium">{b.name}</td><td className="tnum px-3">{b.contacts}</td><td className="tnum px-3">{b.creators}</td><td className="tnum px-3">{b.promises}</td><td className="tnum px-3">{b.followUpsOnTime}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section aria-label="Promises and content" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Promises and content</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="staff" label="Promises due" value={pr.due} sub={`current deadline in this period · ${pr.withoutSample} without a sample`} />
          <Stat kind="system" label="Fulfilled" value={pr.fulfilledOnTime + pr.fulfilledLate + pr.fulfilledTimingUnknown} sub={`${pr.fulfilledOnTime} on time · ${pr.fulfilledLate} late · ${pr.fulfilledTimingUnknown} posting date unknown · ${pr.bySystem} found by the system · ${pr.byStaff} confirmed by staff`} />
          <Stat kind="system" label="In progress" value={pr.partial + pr.toReview} sub={`${pr.partial} partly done (e.g. 1 of 2) · ${pr.toReview} need a quick check`} />
          <Stat kind="system" label="Overdue" value={pr.overdueOpen} sub={`${pr.notYetDue} not due yet · fulfilled promises are never counted overdue`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="system" label="New content after outreach" value={c.total} sub={`distinct pieces, each counted once · ${c.postedAfterContact} posted after the first contact · ${c.undatedSeenAfterContact} first seen after it (posting date unknown) · ${c.confirmedByStaff} confirmed by staff · ${c.fromCreatorsWithoutSamples} from creators without samples`} />
        </div>
        {c.videoReportCoverage.covered < c.videoReportCoverage.total && (
          <p className="text-[12.5px] text-warn">Video analysis covers only {c.videoReportCoverage.covered} of {c.videoReportCoverage.total} days here, so content counts are a minimum.</p>
        )}
      </section>

      <section aria-label="Sales" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Sales movement</h2>
        {cmp.current && cmp.previous ? (
          <p className="text-[13px] text-ink-2">
            Comparing {fmtDayLabel(cmp.current.start)} – {fmtDayLabel(cmp.current.end)} with {fmtDayLabel(cmp.previous.start)} – {fmtDayLabel(cmp.previous.end)} ({cmp.current.days} days each).
            {cmp.shortened && <> Order data only reaches {fmtDayLabel(cmp.current.end)}, so both periods were shortened equally.</>}
          </p>
        ) : (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-ink">Comparison withheld. {cmp.withheld}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="system" label="Newly selling creators" value={p.sales.newlySelling ?? "–"} sub={p.sales.newlySelling == null ? "not enough covered history" : "first observed sale in this period"} />
          <Stat kind="system" label="Reactivated creators" value={p.sales.reactivated ?? "–"} sub={p.sales.reactivated == null ? "not enough covered history" : "sold earlier, nothing in the 28 days before, selling again"} />
          <Stat kind="system" label="Managed creators" value={p.sales.managed} sub="contacted at least once" />
          <Stat
            kind="system"
            label="Their sales vs previous period"
            value={p.sales.managedNow == null ? "–" : fmtRM(p.sales.managedNow)}
            sub={p.sales.managedNow == null ? "withheld (see above)" : `was ${fmtRM(p.sales.managedBefore ?? 0)} · ${p.sales.managedGrowing} growing · ${p.sales.managedFalling} falling`}
          />
        </div>
        {p.sales.historyNote && <p className="text-[12.5px] text-ink-3">{p.sales.historyNote}</p>}
        <p className="text-[12.5px] text-ink-3">Order files cover {p.sales.coverage.affiliate} (affiliate) and {p.sales.coverage.shop} (shop) of the {p.sales.coverage.total} days in this period.</p>
      </section>

      <Card>
        <CardHeader title="How these numbers are defined" />
        <ul className="list-disc space-y-1.5 px-9 pb-5 text-[13.5px] text-ink-2">
          <li><b>Staff-confirmed</b> = a person pressed a button. Opening WhatsApp or copying a message is never counted. <b>System-detected</b> = found in the uploaded TikTok files.</li>
          <li><b>On-time rate</b> = follow-ups completed on or before their due day (through Contacted, or a promised date the creator gave) ÷ (completed on time + completed late + still overdue). Rescheduling, pausing, cancelling and automatic resolution are shown separately and earn no credit.</li>
          <li><b>Promise</b> = a creator’s date, optionally with video/LIVE, product and quantity. Moving the date keeps the original and changes only the current deadline; it is not a new promise.</li>
          <li><b>Fulfilled</b> = the agreed number of distinct pieces of the right type and product, with a known posting date on or after the day the promise was recorded (or confirmed by staff). “On time” uses the posting date; if it is unknown the promise is shown as fulfilled with unknown timing. Without an agreed product the system only suggests matches for you to confirm.</li>
          <li><b>New content after outreach</b> = distinct videos/LIVEs (samples or not) posted after the creator’s first recorded contact, plus pieces first seen after it whose posting date is unknown, plus pieces staff confirmed in the period. A confirmation date is never used as a posting date. This shows timing only – it does not show the contact caused it.</li>
          <li><b>Sales comparisons</b> use the recorded period of each uploaded order file. Equal-length periods are compared only where both are fully covered by both order files; a missing upload is never read as zero sales. <b>First observed sale</b> = the earliest sale in the uploaded history.</li>
          <li>No reply rate is measured: replies are not logged.</li>
        </ul>
      </Card>
    </div>
  );
}
