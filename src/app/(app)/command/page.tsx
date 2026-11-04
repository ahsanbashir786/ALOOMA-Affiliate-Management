import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCommand } from "@/lib/insights/command";
import { fmtDayLabel } from "@/lib/time";
import { Gauge } from "@/components/viz/gauge";
import { Funnel } from "@/components/viz/funnel";
import { Histogram } from "@/components/viz/histogram";
import { Section } from "@/components/viz/section";
import { getAffiliateDirectory, STATUS_ORDER, ACTION_ORDER } from "@/lib/workflow/directory";
import { Badge } from "@/components/ui/primitives";
import { WorkHeader } from "@/components/work/work-header";
import { rows } from "@/lib/analytics/sql";
import { sql } from "drizzle-orm";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Command centre" };

export default async function CommandPage() {
  await requireUser("admin");
  const [d, dir, [doneRow]] = await Promise.all([
    getCommand(),
    getAffiliateDirectory({ samples: "with", page: 1, size: 1 }),
    rows<{ n: number }>(sql`select count(*)::int as n from staff_events where reverted_at is null and kind in ('contacted', 'promised', 'needs_help') and (at at time zone 'Asia/Kuala_Lumpur')::date = (now() at time zone 'Asia/Kuala_Lumpur')::date`),
  ]);
  const atRisk = dir.statusCounts.Slipping + dir.statusCounts.Silent;
  const rel = d.progress.relationships;
  const gaugeTone = (v: number | null, good: number, ok: number) => (v == null ? "brand" : v >= good ? "good" : v >= ok ? "warn" : "critical") as "good" | "warn" | "critical" | "brand";

  return (
    <div className="space-y-6">
      <WorkHeader current="review" title="Command centre" isOwner purpose={`${fmtDayLabel(d.today)} · The one-glance summary. Every number opens the screen behind it.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        {[
          { label: "Lines to act on", n: dir.actionCounts.todo, hint: "open in the table", href: "/affiliates?action=todo", tone: "text-ink" },
          { label: "Due & overdue", n: d.work.due, hint: "open Daily Actions", href: "/today?view=due", tone: d.work.due > 0 ? "text-critical" : "text-ink" },
          { label: "Done today", n: doneRow?.n ?? 0, hint: "actions staff recorded", href: "/today?view=done", tone: "text-good" },
          { label: "Silent or slipping", n: atRisk, hint: "creators losing momentum", href: "/affiliates?status=Slipping", tone: atRisk > 0 ? "text-warn" : "text-ink" },
        ].map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface-2">
            <p className="text-[13px] font-medium text-ink-3">{t.label}</p>
            <p className={cn("tnum text-[28px] leading-tight font-semibold", t.tone)}>{t.n}</p>
            <p className="text-[12.5px] text-ink-3">{t.hint}</p>
          </Link>
        ))}
      </div>

      {/* data health */}
      <div className="flex flex-wrap gap-2.5" aria-label="Data freshness">
        {d.freshness.map((f) => (
          <Link key={f.kind} href="/data" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[14px] hover:bg-surface-2">
            <span className={cn("size-2.5 rounded-full", f.status === "ok" ? "bg-good" : f.status === "stale" ? "bg-warn" : "bg-critical")} />
            <span className="font-medium text-ink">{f.label}</span>
            <span className="text-ink-3">{f.lastDataOn ? (f.ageDays === 0 ? "today" : `${f.ageDays}d ago`) : "not loaded"}</span>
          </Link>
        ))}
      </div>

      {/* execution + decisions */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Staff execution" hint="Last 28 days · what people pressed" href="/progress" linkLabel="Details" className="lg:col-span-2">
          <div className="grid grid-cols-2 items-center gap-6 sm:grid-cols-3">
            <Gauge value={d.gauges.onTimePct} tone={gaugeTone(d.gauges.onTimePct, 80, 50)} label="Follow-ups on time" sub={`${d.progress.followUps.onTime} of ${d.progress.followUps.onTime + d.progress.followUps.late + d.progress.followUps.overdueOpen} judged`} />
            <Gauge value={d.gauges.reliabilityPct} tone={gaugeTone(d.gauges.reliabilityPct, 70, 40)} label="Promises kept on time" sub="last 90 days" />
            <Link href="/today?view=due" className="col-span-2 block rounded-2xl bg-surface-2 p-5 text-center hover:bg-line sm:col-span-1">
              <p className="tnum text-[44px] font-semibold leading-none text-ink">{d.work.due}</p>
              <p className="mt-2 text-[15px] font-medium text-ink">due or overdue now</p>
              <p className="mt-1 text-[13px] text-ink-3">{d.work.verify} to verify · {d.work.samples} samples</p>
            </Link>
          </div>
        </Section>
        <Section title="Needs your decision" hint="Derived, not typed">
          {d.decisions.length === 0 ? <p className="text-[14.5px] text-ink-2">Nothing right now.</p> : (
            <ul className="-my-1 divide-y divide-line">
              {d.decisions.slice(0, 5).map((x) => (
                <li key={x.key}><Link href={x.href} className="flex items-center gap-3 py-2.5 hover:bg-surface-2"><Badge tone={x.tone === "critical" ? "critical" : "warn"}>{x.count}</Badge><span className="min-w-0 flex-1 text-[14.5px] text-ink">{x.title}</span><ArrowRight className="size-4 shrink-0 text-ink-3" /></Link></li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Creator performance" hint="Product lines by status and by action – click to open the table already filtered" href="/affiliates" linkLabel="Affiliate Data Management">
        <div className="grid gap-5 sm:grid-cols-2" data-testid="command-links">
          <div>
            <p className="mb-2 text-[13.5px] font-medium text-ink-2">By status</p>
            <p className="flex flex-wrap gap-2">
              {STATUS_ORDER.filter((k) => dir.statusCounts[k] > 0).map((k) => (
                <Link key={k} href={`/affiliates?status=${k}`} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-[14px] hover:bg-surface-2">{k} <b className="tnum">{dir.statusCounts[k]}</b></Link>
              ))}
            </p>
          </div>
          <div>
            <p className="mb-2 text-[13.5px] font-medium text-ink-2">What needs doing</p>
            <p className="flex flex-wrap gap-2">
              <Link href="/affiliates?action=todo" className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3 py-1 text-[14px] font-medium text-brand hover:bg-brand hover:text-white">To Do <b className="tnum">{dir.actionCounts.todo}</b></Link>
              {ACTION_ORDER.filter((k) => dir.actionCounts[k] > 0 && k !== "Wait" && k !== "Keep").map((k) => (
                <Link key={k} href={`/affiliates?action=${k}`} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-[14px] hover:bg-surface-2">{k} <b className="tnum">{dir.actionCounts[k]}</b></Link>
              ))}
            </p>
          </div>
        </div>
      </Section>

      {/* affiliates */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Creator pipeline" hint="Where collaborations stand" href="/affiliates" linkLabel="Directory">
          <Funnel
            stages={[
              { label: "Approached", value: rel.approached + rel.collaborating + rel.active + rel.stalled + rel.inactive + rel.paused, href: "/progress/records?m=rel_approached&days=28", tone: "brand" },
              { label: "Working together", value: rel.collaborating, href: "/progress/records?m=rel_collaborating&days=28", tone: "good" },
              { label: "Selling", value: rel.active, href: "/progress/records?m=rel_active&days=28", tone: "good" },
            ]}
          />
          <p className="mt-4 flex flex-wrap gap-2 text-[13.5px]">
            <Link href="/progress/records?m=rel_stalled&days=28"><Badge tone="critical">{rel.stalled} stalled</Badge></Link>
            <Link href="/progress/records?m=rel_paused&days=28"><Badge tone="neutral">{rel.paused} paused</Badge></Link>
            <Link href="/progress/records?m=rel_inactive&days=28"><Badge tone="warn">{rel.inactive} inactive</Badge></Link>
          </p>
        </Section>
        <Section title="Sample journey" hint="From shipping to selling" href="/affiliates?action=Chase" linkLabel="Chase list">
          <Funnel
            stages={[
              { label: "Sent", value: d.sampleFunnel.sent, tone: "brand" },
              { label: "Delivered", value: d.sampleFunnel.delivered, tone: "brand" },
              { label: "Posted", value: d.sampleFunnel.posted, tone: "good" },
              { label: "Selling", value: d.sampleFunnel.selling, tone: "good" },
            ]}
          />
          <p className="mb-2 mt-5 text-[13.5px] font-medium text-ink-2">Days from delivery to posting</p>
          <Histogram bins={d.timeToPost} tone="good" />
        </Section>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink-3">
        <span className="font-medium text-ink-2">Shop operations</span>
        <Link href="/order-health" className="text-brand hover:underline">Order health</Link>
        <Link href="/demand" className="text-brand hover:underline">Demand planning</Link>
      </p>
    </div>
  );
}
