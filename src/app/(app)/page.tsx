import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { getOwnAccounts } from "@/lib/analytics/settings";
import { getProductPerformance, getSourceMix, getTopCreators, getVideoAgeMix, kpisFor, SOURCES } from "@/lib/analytics/overview";
import { analyse } from "@/lib/analytics/recommendations";
import { buildInsights, segmentCounts } from "@/lib/analytics/insights";
import { SEGMENTS, SEGMENT_ORDER } from "@/lib/segments";
import { Card, CardHeader, EmptyState, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { Delta } from "@/components/ui/delta";
import { TrendChart } from "@/components/charts/trend-chart";
import { MixBar } from "@/components/charts/mix-bar";
import { InsightStrip } from "@/components/overview/insight-strip";
import { SegmentBadge } from "@/components/creators/segment-badge";
import { fmtDate, fmtInt, fmtPct, fmtRM, initials, pctChange } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const period = await resolvePeriod(await searchParams);
  const user = await getCurrentUser();

  if (!period.hasData) {
    return (
      <>
        <PageHeader title="Overview" description="Your affiliate performance across every source." />
        <Card>
          <EmptyState
            icon={<Database className="size-5" />}
            title="No data yet"
            description="Upload your TikTok Shop exports to see performance, spot your best creators and get recommended actions."
            action={
              user && user.role !== "viewer" ? (
                <Link href="/data" className={buttonClasses({ variant: "primary" })}>
                  Go to Data hub
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    );
  }

  const own = await getOwnAccounts();
  const [cur, prev, mix, age, top, products, analysis] = await Promise.all([
    kpisFor(period.start, period.end, own),
    kpisFor(period.prevStart, period.prevEnd, own),
    getSourceMix(period),
    getVideoAgeMix(period),
    getTopCreators(period, 8),
    getProductPerformance(period),
    analyse(period),
  ]);
  const qs = periodQuery(period);
  const insights = buildInsights({
    kpis: cur,
    mix,
    age,
    classified: analysis.classified,
    ctx: analysis.ctx,
    thresholds: analysis.thresholds,
    qs,
  });
  const counts = segmentCounts(analysis.classified);
  const hasPrev = period.prevEnd >= period.dataMin;
  const d = (a: number, b: number) => (hasPrev ? pctChange(a, b) : undefined);
  const prevLabel = hasPrev ? `vs ${fmtRM(prev.gmv)} before` : undefined;

  const series = SOURCES.map((s) => ({ key: s.key, label: s.label, color: s.color }));
  const mixItems = SOURCES.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    value: mix.totals[s.key],
    prev: hasPrev ? mix.prevTotals[s.key] : undefined,
  })).filter((i) => i.value > 0 || (i.prev ?? 0) > 0);
  const maxProduct = Math.max(1, ...products.map((p) => p.gmv));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          <>
            {period.label} · {fmtDate(period.start)} – {fmtDate(period.end)}. Affiliate figures count valid sales only
            (cancelled and returned orders are excluded).
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          label="Affiliate GMV"
          value={fmtRM(cur.gmv)}
          delta={d(cur.gmv, prev.gmv)}
          sub={prevLabel}
          hint="Valid sales attributed to creators, after cancellations and returns."
        />
        <KpiCard label="Orders" value={fmtInt(cur.orders)} delta={d(cur.orders, prev.orders)} sub={`${fmtInt(cur.items)} items`} />
        <KpiCard label="Avg. order value" value={fmtRM(cur.aov, 2)} delta={d(cur.aov, prev.aov)} />
        <KpiCard
          label="Selling creators"
          value={fmtInt(cur.creators)}
          delta={d(cur.creators, prev.creators)}
          sub={`${fmtInt(analysis.ctx.sellers)} above RM ${Math.round(analysis.ctx.minSeller)}`}
        />
        <KpiCard
          label="Commission cost"
          value={fmtRM(cur.commission)}
          delta={d(cur.commission, prev.commission)}
          invert
          sub={`${fmtPct(cur.commissionRate, 1)} of GMV`}
          hint="Estimated or actual standard + Shop Ads commission on valid sales."
        />
        <KpiCard
          label="Cancelled / returned"
          value={fmtPct(cur.cancelRate + cur.returnRate, 1)}
          delta={d(cur.cancelRate + cur.returnRate, prev.cancelRate + prev.returnRate)}
          invert
          sub={`${fmtPct(cur.codShare, 0)} cash on delivery`}
          hint="Share of gross affiliate sales lost to cancellations and returns."
        />
      </section>

      <InsightStrip insights={insights} />

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sales by source"
            description={
              mix.hasShopData
                ? `Valid sales across the whole shop, by where they came from${mix.bucket === "week" ? " (weekly)" : ""}.`
                : "Affiliate sales by content type. Upload the all-orders export to include brand LIVE and organic sales."
            }
          />
          <div className="px-5 pb-5">
            <TrendChart data={mix.trend} series={series} weekly={mix.bucket === "week"} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Source mix"
            description={
              mix.hasShopData ? `Affiliates drive ${fmtPct(mix.affiliateShare, 0)} of shop sales.` : "Affiliate sources only."
            }
          />
          <div className="px-5 pb-5">
            <MixBar items={mixItems} />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Top creators"
            description="Ranked by valid GMV in this period."
            action={
              <Link href={`/creators?${qs}`} className="flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                All creators <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <tbody>
                {top.map((c, i) => {
                  const seg = analysis.classified.find((x) => x.username === c.username);
                  return (
                    <tr key={c.username} className="group">
                      <td className="w-10 border-t border-line py-2.5 pl-5 text-[13px] text-ink-3 tnum">{i + 1}</td>
                      <td className="border-t border-line py-2.5">
                        <Link href={`/creators/${encodeURIComponent(c.username)}?${qs}`} className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2">
                            {initials(c.username)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium text-ink group-hover:text-brand">
                              {c.username}
                            </span>
                            <span className="tnum text-[12px] text-ink-3">{fmtInt(c.orders)} orders · {fmtPct(c.share, 1)} of GMV</span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden border-t border-line px-3 py-2.5 md:table-cell">
                        <SegmentBadge segment={seg?.segment ?? null} short />
                      </td>
                      <td className="tnum border-t border-line px-3 py-2.5 text-right text-[14px] font-medium text-ink">{fmtRM(c.gmv)}</td>
                      <td className="border-t border-line py-2.5 pr-5 text-right">
                        <Delta value={hasPrev ? pctChange(c.gmv, c.prevGmv) : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Where to focus"
            description="Creators grouped by what they need next."
            action={
              <Link href={`/opportunities?${qs}`} className="flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
                Opportunities <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <ul className="px-2 pb-3">
            {SEGMENT_ORDER.filter((k) => counts.has(k) && k !== "steady").map((k) => {
              const c = counts.get(k)!;
              return (
                <li key={k}>
                  <Link
                    href={`/opportunities?${qs}&segment=${k}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2"
                  >
                    <SegmentBadge segment={k} />
                    <span className="flex-1" />
                    <span className="tnum text-[13px] text-ink-3">{fmtRM(c.gmv)}</span>
                    <span className="tnum w-8 text-right text-[14px] font-semibold text-ink">{c.n}</span>
                  </Link>
                </li>
              );
            })}
            {!counts.size && <li className="px-3 py-6 text-center text-[13px] text-ink-3">No creators above the seller threshold yet.</li>}
          </ul>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            {SEGMENTS.underposting.summary}
          </p>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Products"
          description="Valid affiliate GMV by product."
          action={
            <Link href={`/products?${qs}`} className="flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
              Product detail <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <ul className="px-5 pb-4">
          {products.slice(0, 6).map((p) => (
            <li key={p.productId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-t border-line py-3 first:border-t-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto]">
              <span className="text-[14px] leading-snug text-ink" title={p.name}>{p.shortName}</span>
              <div className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-surface-2 sm:order-none sm:col-span-1">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(p.gmv / maxProduct) * 100}%` }} />
              </div>
              <span className="tnum text-right text-[14px] font-medium text-ink">{fmtRM(p.gmv)}</span>
              <span className="hidden w-16 justify-end sm:flex">
                <Delta value={hasPrev ? pctChange(p.gmv, p.prevGmv) : null} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
