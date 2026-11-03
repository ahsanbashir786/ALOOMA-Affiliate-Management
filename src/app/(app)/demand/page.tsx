import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDemand } from "@/lib/insights/demand";
import { fmtDayLabel } from "@/lib/time";
import { one, type SP } from "@/lib/url";
import { ForecastChart, type ForecastPoint } from "@/components/viz/forecast-chart";
import { Section } from "@/components/viz/section";
import { Sparkline } from "@/components/viz/sparkline";
import { StatTile } from "@/components/viz/stat-tile";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Demand planning" };

export default async function DemandPage({ searchParams }: PageProps<"/demand">) {
  await requireUser();
  const sp = (await searchParams) as SP;
  const d = await getDemand(20);
  if (d.weeks.length < 2) return <div className="space-y-6"><PageHeader title="Demand planning" /><EmptyState title="Not enough orders yet" description={d.note ?? "Upload shop orders to see demand."} /></div>;
  const sel = d.items.find((i) => i.sku === one(sp.sku)) ?? null;
  const weekly = sel ? sel.weekly : d.total.weekly;
  const fc = sel ? sel.forecast : d.total.forecast;
  const data: ForecastPoint[] = [
    ...d.weeks.map((w, i) => ({ label: fmtDayLabel(w), actual: weekly[i] })),
    ...(fc ? fc.points.map((p, i) => ({ label: `+${i + 1}w`, forecast: Math.round(p.value), band: [Math.round(p.low), Math.round(p.high)] as [number, number] })) : []),
  ];
  if (fc) { const last = d.weeks.length - 1; data[last] = { ...data[last], forecast: data[last].actual }; }
  const next4 = fc ? Math.round(fc.points.reduce((a, p) => a + p.value, 0)) : null;
  const range = fc ? [Math.round(fc.points.reduce((a, p) => a + p.low, 0)), Math.round(fc.points.reduce((a, p) => a + p.high, 0))] : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Demand planning" description="Units sold per week (bundles broken into single items) and what the next 4 weeks are likely to need. Stock on hand is not recorded yet, so this shows demand, not what to buy." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={sel ? sel.name : "All items"} value={`${weekly.slice(-4).reduce((a, b) => a + b, 0)} units`} sub="sold in the last 4 weeks" delta={sel ? sel.trendPct : d.total.trendPct} />
        <StatTile label="Likely needed next 4 weeks" value={next4 == null ? "–" : `${next4} units`} sub={range ? `range ${range[0]}–${range[1]} (80%)` : (d.note ?? "needs at least 6 weeks of orders")} />
        <StatTile label="Free samples, last 4 weeks" value={`${(sel ? sel.sample4 : d.items.reduce((a, i) => a + i.sample4, 0))} units`} sub="shipped to creators" />
      </div>
      <Section title={sel ? sel.name : "All items"} hint={fc ? "Solid: actual · dashed: forecast · shaded: likely range" : "Forecast needs at least 6 complete weeks"} href={sel ? "/demand" : undefined} linkLabel="Show all items">
        <ForecastChart data={data} height={300} />
        {fc && <p className="mt-2 text-[12.5px] text-ink-3">Method: {fc.method}. It follows recent weeks; it does not know about campaigns or stock-outs.</p>}
      </Section>
      <Section title="Items" hint="Top sellers, last 4 weeks · click one to chart it">
        <ul className="divide-y divide-line">
          {d.items.map((i) => (
            <li key={i.sku}>
              <Link href={`/demand?sku=${encodeURIComponent(i.sku)}`} className={cn("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-1 py-3 hover:bg-surface-2 sm:grid-cols-[minmax(160px,2fr)_120px_90px_110px_90px]", sel?.sku === i.sku && "bg-surface-2")}>
                <span className="min-w-0"><span className="block truncate text-[14.5px] font-medium text-ink">{i.name}</span><span className="text-[12.5px] text-ink-3">{i.sku}</span></span>
                <span className="hidden sm:block"><Sparkline values={i.weekly} tone={i.trendPct != null && i.trendPct < -10 ? "critical" : "good"} /></span>
                <span className="tnum text-right text-[14.5px] font-semibold">{i.sold4}<span className="text-[12px] font-normal text-ink-3"> sold</span></span>
                <span className="tnum hidden text-right text-[14px] text-ink-2 sm:block">{i.next4 == null ? "–" : `${i.next4} next 4w`}</span>
                <span className={cn("tnum hidden text-right text-[14px] font-semibold sm:block", i.trendPct == null ? "text-ink-3" : i.trendPct >= 0 ? "text-good" : "text-critical")}>{i.trendPct == null ? "–" : `${i.trendPct >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(i.trendPct))}%`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
