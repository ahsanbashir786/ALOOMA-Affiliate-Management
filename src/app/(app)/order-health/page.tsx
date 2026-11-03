import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getOrderHealth } from "@/lib/insights/orders";
import { fmtDayLabel } from "@/lib/time";
import { ComboChart } from "@/components/viz/combo-chart";
import { Donut } from "@/components/viz/donut";
import { Heatmap } from "@/components/viz/heatmap";
import { HBars } from "@/components/viz/hbars";
import { Histogram } from "@/components/viz/histogram";
import { Section } from "@/components/viz/section";
import { StatTile } from "@/components/viz/stat-tile";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Order health" };

const d1 = (n: number | null) => (n == null ? "–" : `${n.toFixed(1)}%`);
const delta = (a: number | null, b: number | null) => (a != null && b ? ((a - b) / b) * 100 : null);

export default async function OrderHealthPage() {
  await requireUser();
  const o = await getOrderHealth(90);
  if (!o.start) return <div className="space-y-6"><PageHeader title="Order health" /><EmptyState title="No shop orders yet" description="Upload the All shop orders export in the Data hub to see cancellations, returns and delivery speed." /></div>;
  const lostTone = (p: number) => (p >= 25 ? "critical" : p >= 12 ? "warn" : "good") as "critical" | "warn" | "good";

  return (
    <div className="space-y-6">
      <PageHeader title="Order health" description={`${fmtDayLabel(o.start)} – ${fmtDayLabel(o.end!)} · last 90 days of orders we hold · free samples excluded`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Orders" value={o.totals.orders.toLocaleString()} spark={o.days.slice(-30).map((x) => x.orders)} sub="last 30 days trend" />
        <StatTile label="Cancelled" value={d1(o.totals.cancelPct)} delta={delta(o.totals.cancelPct, o.previous.cancelPct)} goodWhenUp={false} sub={`${o.totals.cancelled} orders · vs the 90 days before`} tone="critical" />
        <StatTile label="Returned / refunded" value={d1(o.totals.returnPct)} delta={delta(o.totals.returnPct, o.previous.returnPct)} goodWhenUp={false} sub={`${o.totals.returned} orders`} tone="serious" />
      </div>

      <Section title="Orders and cancellation rate" hint="Bars: orders per day · line: % cancelled · red dot: unusually high for that day">
        <ComboChart data={o.days.map((x) => ({ label: fmtDayLabel(x.day), bars: x.orders, line: x.ratePct == null ? null : Math.round(x.ratePct * 10) / 10, flag: o.flags.some((f) => f.day === x.day) }))} barLabel="Orders" lineLabel="Cancelled %" />
        {o.flags.length > 0 && <p className="mt-3 flex flex-wrap gap-2">{o.flags.slice(-6).map((f) => <Badge key={f.day} tone="critical">{fmtDayLabel(f.day)} · {f.value.toFixed(0)}% (usual {f.expected.toFixed(0)}%)</Badge>)}</p>}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Why orders are cancelled" hint="Cancelled orders, by reason given">
          {o.reasons.length ? <HBars items={o.reasons.map((r) => ({ label: r.label, value: r.n, tone: "critical" }))} /> : <p className="text-[14px] text-ink-3">No cancellations in this period.</p>}
        </Section>
        <Section title="Who cancels" hint="Customer, system or seller">
          <Donut caption="Cancellations by who" centre={String(o.totals.cancelled)} parts={o.cancelBy.map((c, i) => ({ label: c.label, value: c.n, tone: (["critical", "warn", "brand", "serious"] as const)[i % 4] }))} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Cash on delivery vs online" hint="Cancellation rate by payment method (30+ orders)">
          <HBars max={Math.max(20, ...o.payment.map((p) => p.cancelPct))} items={o.payment.map((p) => ({ label: p.label, value: p.cancelPct, display: `${p.cancelPct.toFixed(1)}%`, tone: lostTone(p.cancelPct), sub: `${p.orders} orders` }))} />
        </Section>
        <Section title="Products to watch" hint="Highest cancelled + returned share (30+ orders)">
          <ul className="space-y-3.5">
            {o.skus.map((s) => (
              <li key={s.sku} className="flex items-center gap-3">
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink" title={s.name}>{s.name}</span><span className="text-[12.5px] text-ink-3">{s.orders} orders · {s.returnPct.toFixed(0)}% returned</span></span>
                <Badge tone={lostTone(s.cancelPct + s.returnPct)}>{(s.cancelPct + s.returnPct).toFixed(0)}% lost</Badge>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="When orders arrive" hint="Orders by weekday for the last 8 weeks – darker means more">
        <Heatmap rows={o.heat.rows} cols={o.heat.cols.map((c) => fmtDayLabel(c))} cells={o.heat.cells} unit="orders" />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Time to ship" hint="From order placed to handed to the courier">
          <Histogram bins={o.shipHours} tone="brand" />
        </Section>
        <Section title="Time to deliver" hint="From shipped to delivered">
          <Histogram bins={o.deliverDays} tone="good" />
          {o.couriers.length > 0 && <ul className="mt-4 space-y-1.5 text-[14px]">{o.couriers.map((c) => <li key={c.name} className="flex items-center justify-between"><span>{c.name} <span className="text-ink-3">· {c.orders} orders</span></span><span className="tnum font-semibold">{c.medianDays.toFixed(1)} days typical</span></li>)}</ul>}
        </Section>
      </div>
      <p className="text-[12.5px] text-ink-3">Counts are distinct orders. An order is “cancelled” if any line was cancelled, “returned” if any line has a return. The window ends at the latest order we hold, so a missing upload is never read as a quiet period.</p>
    </div>
  );
}
