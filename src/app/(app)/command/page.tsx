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
import { StatTile } from "@/components/viz/stat-tile";
import { Sparkline } from "@/components/viz/sparkline";
import { ComboChart } from "@/components/viz/combo-chart";
import { ForecastChart, type ForecastPoint } from "@/components/viz/forecast-chart";
import { getAffiliateDirectory, STATUS_ORDER, ACTION_ORDER } from "@/lib/workflow/directory";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Command centre" };

export default async function CommandPage() {
  await requireUser("admin");
  const [d, dir] = await Promise.all([getCommand(), getAffiliateDirectory({ samples: "with", page: 1, size: 1 })]);
  const rel = d.progress.relationships;
  const o = d.orders;
  const gaugeTone = (v: number | null, good: number, ok: number) => (v == null ? "brand" : v >= good ? "good" : v >= ok ? "warn" : "critical") as "good" | "warn" | "critical" | "brand";
  const cancelDelta = o.totals.cancelPct != null && o.previous.cancelPct ? ((o.totals.cancelPct - o.previous.cancelPct) / o.previous.cancelPct) * 100 : null;
  const fc = d.demand.total.forecast;
  const forecastData: ForecastPoint[] = [
    ...d.demand.weeks.map((w, i) => ({ label: fmtDayLabel(w), actual: d.demand.total.weekly[i] })),
    ...(fc ? fc.points.map((p, i) => ({ label: `+${i + 1}w`, forecast: Math.round(p.value), band: [Math.round(p.low), Math.round(p.high)] as [number, number] })) : []),
  ];
  if (fc && forecastData.length > fc.points.length) { const last = d.demand.weeks.length - 1; forecastData[last] = { ...forecastData[last], forecast: forecastData[last].actual }; }
  const unusual = o.flags.slice(-3);

  return (
    <div className="space-y-6">
      <PageHeader title="Command centre" description={`${fmtDayLabel(d.today)} · everything that needs your attention, from the records`} />

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

      {/* orders */}
      <Section title="Order health" hint={o.start ? `${fmtDayLabel(o.start)} – ${fmtDayLabel(o.end!)} · orders per day with the cancellation rate` : "No shop orders loaded"} href="/order-health" linkLabel="Order health">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <ComboChart data={o.days.map((x) => ({ label: fmtDayLabel(x.day), bars: x.orders, line: x.ratePct == null ? null : Math.round(x.ratePct * 10) / 10, flag: o.flags.some((f) => f.day === x.day) }))} barLabel="Orders" lineLabel="Cancelled %" height={240} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatTile label="Cancelled" value={o.totals.cancelPct == null ? "–" : `${o.totals.cancelPct.toFixed(1)}%`} delta={cancelDelta} goodWhenUp={false} sub={cancelDelta == null ? "of orders in this period" : "vs the 90 days before"} href="/order-health" />
            <StatTile label="Returned / refunded" value={o.totals.returnPct == null ? "–" : `${o.totals.returnPct.toFixed(1)}%`} sub={`${o.totals.returned} orders`} href="/order-health" />
          </div>
        </div>
        {unusual.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-ink-2"><span className="font-medium text-ink">Unusual days:</span>{unusual.map((f) => <Badge key={f.day} tone="critical">{fmtDayLabel(f.day)} · {f.value.toFixed(0)}% cancelled (usually {f.expected.toFixed(0)}%)</Badge>)}</p>
        )}
      </Section>

      {/* demand */}
      <Section title="Demand outlook" hint="Units sold per week, with the next 4 weeks forecast" href="/demand" linkLabel="Demand planning">
        {d.demand.weeks.length < 2 ? <p className="text-[14.5px] text-ink-3">{d.demand.note}</p> : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <ForecastChart data={forecastData} height={240} />
            <div className="space-y-3">
              <StatTile label="Needed next 4 weeks" value={d.demand.total.next4 == null ? "–" : `${d.demand.total.next4} units`} delta={d.demand.total.trendPct} sub={d.demand.total.next4 == null ? (d.demand.note ?? "Not enough history") : "all items, bundles broken into parts"} />
              <ul className="space-y-2">
                {d.demand.items.slice(0, 4).map((i) => (
                  <li key={i.sku} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-[14px] text-ink" title={i.name}>{i.name}</span><span className="w-20"><Sparkline values={i.weekly} tone={i.trendPct != null && i.trendPct < -10 ? "critical" : "good"} /></span><span className="tnum w-12 text-right text-[13.5px] font-semibold">{i.sold4}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
