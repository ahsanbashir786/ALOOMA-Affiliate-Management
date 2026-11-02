import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { resolvePeriod } from "@/lib/period";
import { getProductPerformance } from "@/lib/analytics/overview";
import { pickSnapshot } from "@/lib/analytics/snapshots";
import { rows } from "@/lib/analytics/sql";
import { quantile } from "@/lib/analytics/classify";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { Delta } from "@/components/ui/delta";
import { cn, fmtInt, fmtPct, fmtRM, pctChange } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const period = await resolvePeriod(await searchParams);
  const list = await getProductPerformance(period);
  const snap = await pickSnapshot("product_list", period.start, period.end);
  const extra = snap
    ? await rows<{ product_id: string; samples: number; videos: number; live_streams: number; sales_creators: number }>(sql`
        select product_id, samples, videos, live_streams, sales_creators from product_snapshots where upload_id = ${snap.uploadId}`)
    : [];
  const ex = new Map(extra.map((e) => [e.product_id, e]));
  const hasPrev = period.prevEnd >= period.dataMin;

  if (!list.length) {
    return (
      <>
        <PageHeader title="Products" description="How each product performs and who is selling it." />
        <Card><EmptyState title="No product sales in this period" description="Choose a wider date range or upload affiliate orders." /></Card>
      </>
    );
  }

  const perCreator = list.map((p) => (p.creators ? p.gmv / p.creators : 0));
  const medPer = quantile([...perCreator].sort((a, b) => a - b), 0.5);
  const medCreators = quantile(list.map((p) => p.creators).sort((a, b) => a - b), 0.5);
  const totalGmv = list.reduce((a, p) => a + p.gmv, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="How each product performs, how many creators sell it, and where a product is under-promoted." />
      <Card>
        <CardHeader title="Product performance" description={`Valid affiliate GMV, ${period.label.toLowerCase()}. Posting and sample counts come from the product list export${snap ? ` (${snap.start} – ${snap.end})` : ""}.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th align="right">GMV</Th>
                <Th align="right">Share</Th>
                <Th align="right">vs prev.</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Creators</Th>
                <Th align="right">GMV / creator</Th>
                <Th align="right">Cancelled</Th>
                <Th align="right">Commission</Th>
                <Th align="right">Videos</Th>
                <Th align="right">Samples</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => {
                const e = ex.get(p.productId);
                const under = p.creators > 0 && p.creators <= medCreators && perCreator[i] >= medPer && p.gmv > 0;
                return (
                  <tr key={p.productId} className="hover:bg-surface-2/60">
                    <Td className="max-w-[320px]">
                      <span className="block leading-snug" title={p.name}>{p.shortName}</span>
                      {under && <Badge tone="brand" className="mt-1">Under-promoted</Badge>}
                    </Td>
                    <Td align="right" className="font-medium">{fmtRM(p.gmv)}</Td>
                    <Td align="right" className="text-ink-2">{fmtPct(totalGmv ? p.gmv / totalGmv : 0, 0)}</Td>
                    <Td align="right"><Delta value={hasPrev ? pctChange(p.gmv, p.prevGmv) : null} /></Td>
                    <Td align="right">{fmtInt(p.orders)}</Td>
                    <Td align="right">{fmtInt(p.creators)}</Td>
                    <Td align="right">{fmtRM(perCreator[i])}</Td>
                    <Td align="right" className={cn(p.cancelRate >= 0.15 && "font-medium text-serious")}>{fmtPct(p.cancelRate, 0)}</Td>
                    <Td align="right" className="text-ink-2">{p.gmv ? fmtPct(p.commission / p.gmv, 1) : "–"}</Td>
                    <Td align="right">{e ? fmtInt(e.videos) : "–"}</Td>
                    <Td align="right">{e ? fmtInt(e.samples) : "–"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
          “Under-promoted” = fewer creators than the median product, but each of them sells more than the median per creator. Recruiting more creators for these is the quickest way to scale them.
        </p>
      </Card>
    </div>
  );
}
