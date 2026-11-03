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
  const s = p.staff;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const noCoverage = "Not enough order history to compare";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Progress"
        description={`${fmtDayLabel(p.window.start)} – ${fmtDayLabel(p.window.end)} (${days} days, Malaysia time), compared with the ${days} days before it.`}
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
        <h2 className="text-[15px] font-semibold">Staff work</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="staff" label="Follow-ups due" value={s.followUpsDue} sub={`${s.onTime} on time · ${s.late} late · ${s.overdueOpen} still overdue`} />
          <Stat kind="staff" label="Completed on time" value={pct(s.onTime, s.followUpsDue)} sub="of follow-ups whose due date fell in this period" />
          <Stat kind="staff" label="Different creators contacted" value={s.creatorsContacted} sub={`${s.contactActions} “Contacted” actions in total`} />
          <Stat kind="staff" label="Promises recorded" value={s.promisesRecorded} sub="creator gave a date" />
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
          <Stat kind="staff" label="Promises due" value={p.promises.due} sub="promised date fell in this period" />
          <Stat kind="system" label="Fulfilled" value={p.promises.fulfilledOnTime + p.promises.fulfilledLate} sub={`${p.promises.fulfilledOnTime} on time · ${p.promises.fulfilledLate} late · ${p.promises.bySystem} found by the system · ${p.promises.byStaff} confirmed by staff`} />
          <Stat kind="system" label="Not fulfilled yet" value={p.promises.open} sub="no matching content seen" />
          <Stat kind="system" label="New content after outreach" value={p.content.afterContact} sub={`${p.content.allVerified} confirmed pieces in total this period · each piece counted once · appeared after a contact, not proven to be caused by it`} />
        </div>
      </section>

      <section aria-label="Sales" className="space-y-2">
        <h2 className="text-[15px] font-semibold">Sales movement</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat kind="system" label="Newly selling creators" value={p.sales.newlySelling ?? "–"} sub={p.sales.newlySelling == null ? noCoverage : `first sale we can see (order history starts ${fmtDayLabel(p.sales.coverageStart!)}) · none in the 28 days before`} />
          <Stat kind="system" label="Reactivated creators" value={p.sales.reactivated ?? "–"} sub={p.sales.reactivated == null ? noCoverage : "sold earlier, nothing in the 28 days before, selling again"} />
          <Stat kind="system" label="Managed creators" value={p.sales.managed} sub="contacted at least once" />
          <Stat
            kind="system"
            label="Their sales vs previous period"
            value={p.sales.managedNow == null ? "–" : fmtRM(p.sales.managedNow)}
            sub={p.sales.managedNow == null ? noCoverage : `was ${fmtRM(p.sales.managedBefore ?? 0)} · ${p.sales.managedGrowing} growing · ${p.sales.managedFalling} falling`}
          />
        </div>
      </section>

      <Card>
        <CardHeader title="How these numbers are defined" />
        <ul className="list-disc space-y-1.5 px-9 pb-5 text-[13.5px] text-ink-2">
          <li><b>Staff-confirmed</b> = a person pressed a button (Contacted, Promised date, …). Opening WhatsApp or copying a message is never counted.</li>
          <li><b>System-detected</b> = found in the uploaded TikTok files (content, sales). Staff can confirm or reject uncertain matches.</li>
          <li><b>Follow-up</b> = the next-action date set when staff press Contacted / Promised / Needs help. “On time” = done on or before the due date (Malaysia time).</li>
          <li><b>Different creators contacted</b> counts each creator once. Undone actions are excluded.</li>
          <li><b>Promise fulfilled</b> = content for the sample the promise was about appeared on or after the day it was recorded (or staff confirmed a link). Other videos never count.</li>
          <li><b>New content after outreach</b> = confirmed videos/LIVEs, each counted once, first seen after the creator’s first recorded contact. It shows timing only – it does not prove the contact caused it, and sales after contact are not credited to staff.</li>
          <li><b>Newly selling</b> = first sale visible in the order history; only shown when the history reaches back 28 days before the period. Order data: {p.sales.coverageStart ? `${fmtDayLabel(p.sales.coverageStart)} – ${fmtDayLabel(p.sales.coverageEnd!)}` : "none uploaded"}.</li>
          <li>Sales movement compares equal-length periods and is hidden when the earlier period isn’t covered by uploaded orders. No reply rate is measured: replies are not logged.</li>
        </ul>
      </Card>
    </div>
  );
}
