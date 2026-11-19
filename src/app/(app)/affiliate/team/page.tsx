import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { loadTeam } from "@/lib/affiliate/team";
import { WINDOW } from "@/lib/affiliate/outcomes";
import { fmtDateTimeKL, fmtDayLabel } from "@/lib/time";
import { Badge, buttonClasses, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { cn, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
const pp = (n: number | null) => (n == null ? "–" : `${sign(n)}${Math.abs(Math.round(n))} points`);
const pc = (n: number | null) => (n == null ? "–" : `${sign(n)}${Math.abs(Math.round(n))}%`);
const KIND: Record<string, string> = { contacted: "Contacted", task_done: "Product Action Done", promised: "Promise Recorded", rescheduled: "Moved A Date", needs_help: "Needs Help", paused: "Paused", resumed: "Resumed", note: "Note" };

export default async function TeamPage() {
  const { denied } = await gate("creators", "Team");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const t = await loadTeam();
  if (!t) return null;
  const o = t.overall;

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description={`What the team is doing, live, and whether it brings sales. Each contact is judged ${WINDOW} days later: the creator's sales in the ${WINDOW} days from the contact against the ${WINDOW} days before, set against creators nobody contacted over the same days. Work done shows at once; results fill in as the days pass.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="team-kpis">
        {[
          { label: "Contacted Today", value: String(t.activity.today), sub: "live" },
          { label: "Contacted This Week", value: String(t.activity.week), sub: "last 7 days" },
          { label: "Actions Done This Week", value: String(t.activity.actionsDoneWeek), sub: `${t.activity.actionsDoneToday} today · product actions marked Done` },
          { label: "Waiting For Result", value: String(t.activity.waiting), sub: `creators inside the ${WINDOW} days` },
          { label: "Effect Of The Work", value: o.lift == null ? "Not yet" : pp(o.lift), sub: o.lift == null ? `needs a contact that is ${WINDOW} days old` : "against creators nobody contacted" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface px-4 py-3.5">
            <p className="text-[13px] font-medium text-ink-3">{k.label}</p>
            <p className={cn("tnum mt-0.5 text-[26px] leading-tight font-semibold tracking-tight", k.label === "Effect Of The Work" && o.lift != null && (o.lift >= 0 ? "text-good" : "text-critical") || "text-ink")}>{k.value}</p>
            <p className="text-[12.5px] text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      <Card data-testid="team-people">
        <CardHeader title="Per Person" description="Contacts recorded (from Actions and from product actions) and product actions marked Done. For the finished contacts (older than 14 days) how the creators' sales moved compared with creators nobody contacted." />
        {t.people.length === 0 ? <p className="px-5 pb-6 text-[14px] text-ink-3">Nothing recorded yet. When someone records a contact in Actions, it shows here at once.</p> : (
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[12.5px] text-ink-3"><tr><th className="py-2 font-medium">Person</th><th className="font-medium">Today</th><th className="font-medium">This Week</th><th className="font-medium">All Contacts</th><th className="font-medium">Actions Done</th><th className="font-medium">Finished</th><th className="font-medium">Their Creators&apos; Sales</th><th className="font-medium">Against Others</th></tr></thead>
              <tbody>
                {t.people.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2.5 font-semibold text-ink">{p.name}</td><td className="tnum">{p.today}</td><td className="tnum">{p.week}</td><td className="tnum">{p.contacts}</td><td className="tnum">{p.actionsDone}</td><td className="tnum">{p.finished}</td>
                    <td className="tnum">{pc(p.changePct)}</td>
                    <td className={cn("tnum font-semibold", p.lift == null ? "text-ink-3" : p.lift >= 0 ? "text-good" : "text-critical")}>{pp(p.lift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card data-testid="team-methods">
        <CardHeader title="Which Methods Work" description="The same comparison for each type of action, so you see which kind of contact lifts sales and which does not. Only finished contacts count (14 days passed) and only creators who were selling before." />
        {t.byAction.length === 0 ? <p className="px-5 pb-6 text-[14px] text-ink-3">No contact is {WINDOW} days old yet. The first results appear {WINDOW} days after the first recorded contact.</p> : (
          <ul className="px-5 pb-4">
            {t.byAction.map((a) => (
              <li key={a.action} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 text-[13.5px]">
                <span className="font-semibold text-ink">{a.action}</span>
                <span className="text-ink-3">{a.events} finished</span>
                <span className="tnum text-ink-2">their sales {pc(a.changePct)}</span>
                <span className={cn("tnum font-semibold", a.lift == null ? "text-ink-3" : a.lift >= 0 ? "text-good" : "text-critical")}>{pp(a.lift)} against others</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card data-testid="team-log">
        <CardHeader title="Activity Log" description="Every recorded action, newest first, with its result once it is known. Undone items stay in the log, crossed out." />
        {t.log.length === 0 ? <p className="px-5 pb-6 text-[14px] text-ink-3">No activity in the last 90 days.</p> : (
          <ul className="px-5 pb-4">
            {t.log.map((l) => (
              <li key={l.key} className={cn("grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-line py-2.5 text-[13.5px] sm:grid-cols-[150px_150px_1fr_220px]", l.reverted && "text-ink-3 line-through")}>
                <span className="tnum text-ink-3" title={fmtDateTimeKL(l.at)}>{fmtDayLabel(l.day)}</span>
                <span className="font-medium text-ink">{l.who}</span>
                <span className="min-w-0 truncate"><span className="text-ink-2">{KIND[l.kind] ?? l.kind}{l.action ? ` · ${l.action}` : ""}</span> {l.creator ? <OpenPanelButton username={l.creator} className="font-semibold text-brand hover:underline" /> : null}{l.product ? <span className="text-ink-3"> · {l.product}</span> : null}</span>
                <span className="tnum text-right text-[12.5px] sm:text-left">
                  {l.reverted ? <Badge tone="neutral">Undone</Badge> : l.before == null ? "" : l.complete ? <span className="text-ink-2">{fmtRM(l.before)} → <b className="text-ink">{fmtRM(l.after ?? 0)}</b></span> : <span className="text-ink-3">{(l.seen ?? 0) <= 0 ? "just contacted, results follow" : `day ${l.seen} of ${WINDOW}: ${fmtRM(l.after ?? 0)} so far`}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
