import type { Metadata } from "next";
import { resolvePeriod } from "@/lib/period";
import { getOrderHealth } from "@/lib/analytics/orders";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarList } from "@/components/charts/bar-list";
import { fmtInt, fmtPct, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const period = await resolvePeriod(await searchParams);
  const h = await getOrderHealth(period);
  if (!h.hasData) {
    return (
      <>
        <PageHeader title="Orders" description="Shop-wide order health: cancellations, payments, delivery and where buyers are." />
        <Card><EmptyState title="No shop orders in this period" description="Upload the all-orders export in the Data hub to see order health." /></Card>
      </>
    );
  }
  const cod = h.payments.find((p) => p.method === "Cash on delivery");
  const online = h.payments.filter((p) => p.method !== "Cash on delivery");
  const onlineOrders = online.reduce((a, p) => a + p.orders, 0);
  const onlineRate = onlineOrders ? online.reduce((a, p) => a + p.cancelRate * p.orders, 0) / onlineOrders : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description={`Shop-wide order health for ${period.label.toLowerCase()} – every channel, not just affiliates.`} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Orders" value={fmtInt(h.orders)} sub={`${fmtRM(h.net)} valid GMV`} />
        <KpiCard label="Avg. order value" value={fmtRM(h.aov, 2)} />
        <KpiCard label="Cancelled orders" value={fmtPct(h.cancelRate, 1)} invert sub={`${fmtInt(h.cancelledOrders)} orders`} />
        <KpiCard label="Returns" value={fmtInt(h.returnedOrders)} invert sub="return / refund requests" />
        <KpiCard label="Cash on delivery" value={fmtPct(h.codShare, 0)} sub="of GMV" />
        <KpiCard label="Delivery time" value={h.avgDeliveryDays == null ? "–" : `${h.avgDeliveryDays.toFixed(1)} days`} sub={h.avgShipHours == null ? undefined : `ships in ${h.avgShipHours.toFixed(0)}h`} hint="Average days from order to delivered, for orders already delivered." />
      </section>

      {cod && onlineOrders > 0 && cod.cancelRate > onlineRate * 1.3 && (
        <Card className="border-warn/40 bg-warn-soft px-5 py-4">
          <p className="text-[14.5px] font-semibold text-ink">Cash on delivery orders cancel {(cod.cancelRate / Math.max(onlineRate, 0.001)).toFixed(1)}× as often</p>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {fmtPct(cod.cancelRate, 0)} of COD orders are cancelled versus {fmtPct(onlineRate, 0)} of online-paid orders. Asking creators to encourage online payment is a direct way to protect commission and sales.
          </p>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Why orders are cancelled" description="Distinct orders by stated reason." />
          <div className="px-5 pb-5">
            <BarList color="var(--s2)" items={h.cancelReasons.map((r) => ({ label: r.reason, value: r.n, display: fmtInt(r.n), sub: r.by ?? undefined }))} emptyText="No cancellations." />
          </div>
        </Card>
        <Card>
          <CardHeader title="Payment methods" description="Orders and how often each method gets cancelled." />
          <div className="px-5 pb-5">
            <BarList items={h.payments.map((p) => ({ label: p.method, value: p.orders, display: fmtInt(p.orders), sub: `${fmtPct(p.cancelRate, 0)} cancelled`, highlight: p.method === "Cash on delivery" }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Where buyers are" description="Top states by valid GMV." />
          <div className="px-5 pb-5">
            <BarList items={h.states.map((s) => ({ label: s.state, value: s.gmv, display: fmtRM(s.gmv), sub: `${fmtInt(s.orders)} orders · ${fmtPct(s.cancelRate, 0)} cancelled` }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fulfilment" description="Order status and carrier speed." />
          <div className="space-y-5 px-5 pb-5">
            <BarList color="var(--s3)" items={h.statuses.map((s) => ({ label: s.status, value: s.orders, display: fmtInt(s.orders) }))} />
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-[12.5px] font-medium text-ink-3">Carrier · average days to deliver</p>
              <ul className="space-y-1.5 text-[13.5px]">
                {h.providers.map((p) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span className="text-ink-2">{p.name}</span>
                    <span className="tnum text-ink">{fmtInt(p.orders)} orders · {p.avgDays == null ? "–" : `${p.avgDays.toFixed(1)}d`}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
