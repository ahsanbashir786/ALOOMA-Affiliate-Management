import type { Metadata } from "next";
import Link from "next/link";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { getSampleReport } from "@/lib/analytics/samples";
import { Card, CardHeader, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarList } from "@/components/charts/bar-list";
import { fmtDate, fmtInt, fmtPct, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Samples" };

export default async function SamplesPage({ searchParams }: PageProps<"/samples">) {
  const period = await resolvePeriod(await searchParams);
  const qs = periodQuery(period);
  const r = await getSampleReport(period);
  if (!r) {
    return (
      <>
        <PageHeader title="Samples" description="Are your free samples turning into content and sales?" />
        <Card><EmptyState title="No sample data for this period" description="Upload the Sample analysis export in the Data hub." /></Card>
      </>
    );
  }
  const t = r.totals;
  const shippedRows = r.rows.filter((x) => x.shipped > 0);
  const noContent = shippedRows.filter((x) => x.videos + x.lives === 0).sort((a, b) => b.shipped - a.shipped).slice(0, 15);
  const winners = [...shippedRows].sort((a, b) => b.roi45 - a.roi45 || b.contentGmv - a.contentGmv).filter((x) => x.contentGmv > 0).slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Samples"
        description={`Sample analysis for ${fmtDate(r.snapshot.start)} – ${fmtDate(r.snapshot.end)}. ROI is TikTok's estimate of GMV against sample cost.`}
      />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Samples shipped" value={fmtInt(t.shipped)} sub={`${fmtInt(t.requested)} requested`} />
        <KpiCard label="Posted content" value={`${fmtInt(t.posted)} / ${fmtInt(t.posted + t.noContent)}`} sub="creators with samples" hint="Creators who received samples and posted at least one video or LIVE." />
        <KpiCard label="No content yet" value={fmtInt(t.noContent)} sub="creators" invert />
        <KpiCard label="Content GMV" value={fmtRM(t.contentGmv)} sub="from sample content" />
        <KpiCard label="Break-even or better" value={fmtPct(t.breakeven, 0)} sub={`avg 45-day ROI ${t.avgRoi45.toFixed(1)}`} hint="Share of sampled creators whose 45-day ROI is at least 1." />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Return on samples" description="45-day ROI of creators who received samples." />
          <div className="px-5 pb-5">
            <BarList items={r.roiBuckets.map((b, i) => ({ label: b.label, value: b.n, display: fmtInt(b.n), highlight: i === 3 }))} />
            <p className="mt-4 text-[12.5px] text-ink-3">
              Concentrate samples on creators who convert; pause them for creators who keep receiving samples without posting.
            </p>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Shipped, but no content" description="Chase these first – the sample cost is already spent." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead><tr><Th>Creator</Th><Th align="right">Requested</Th><Th align="right">Shipped</Th><Th align="right">Posting rate</Th></tr></thead>
              <tbody>
                {noContent.map((x) => (
                  <tr key={x.username} className="hover:bg-surface-2/60">
                    <Td><Link href={`/creators/${encodeURIComponent(x.username)}?${qs}`} className="text-ink hover:text-brand hover:underline">{x.username}</Link></Td>
                    <Td align="right">{fmtInt(x.requested)}</Td>
                    <Td align="right">{fmtInt(x.shipped)}</Td>
                    <Td align="right">{fmtPct(x.postingRate, 0)}</Td>
                  </tr>
                ))}
                {!noContent.length && <tr><Td colSpan={4} className="py-8 text-center text-ink-3">Everyone with samples has posted. 🎉</Td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Best returns on samples" description="Creators whose sample content sold the most relative to cost." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr><Th>Creator</Th><Th align="right">Shipped</Th><Th align="right">Videos / LIVEs</Th><Th align="right">Content GMV</Th><Th align="right">45-day ROI</Th><Th align="right">90-day ROI</Th></tr>
            </thead>
            <tbody>
              {winners.map((x) => (
                <tr key={x.username} className="hover:bg-surface-2/60">
                  <Td><Link href={`/creators/${encodeURIComponent(x.username)}?${qs}`} className="text-ink hover:text-brand hover:underline">{x.username}</Link></Td>
                  <Td align="right">{fmtInt(x.shipped)}</Td>
                  <Td align="right">{x.videos} / {x.lives}</Td>
                  <Td align="right" className="font-medium">{fmtRM(x.contentGmv)}</Td>
                  <Td align="right">{x.roi45.toFixed(1)}</Td>
                  <Td align="right">{x.roi90.toFixed(1)}</Td>
                </tr>
              ))}
              {!winners.length && <tr><Td colSpan={6} className="py-8 text-center text-ink-3">No sampled creator has generated sales yet.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
