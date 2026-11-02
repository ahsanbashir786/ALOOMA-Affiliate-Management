import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getSampleItems, getSampleProducts } from "@/lib/samples/analysis";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { BarList } from "@/components/charts/bar-list";
import { SamplesNav } from "@/components/samples/samples-nav";
import { cn, fmtInt, fmtPct, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Sampled products" };

export default async function SampleProductsPage() {
  await requireUser();
  const [list, items] = await Promise.all([getSampleProducts(), getSampleItems()]);

  if (!list.length) {
    return (
      <div>
        <PageHeader title="Samples" description="Which sampled products turn into content and sales." />
        <SamplesNav current="/samples/products" />
        <Card><EmptyState title="No samples yet" description="Upload the All orders export to see which products you sample and what they bring back." /></Card>
      </div>
    );
  }
  const ranked = list.filter((p) => p.judged >= 2).sort((a, b) => b.gmvPerSample - a.gmvPerSample);
  const totalSamples = list.reduce((a, p) => a + p.samples, 0);

  return (
    <div>
      <PageHeader title="Samples" description="Which sampled products turn into content and sales – and what physically went out, with bundles split into their items." />
      <SamplesNav current="/samples/products" />
      <div className="space-y-5">
        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Sales per sample" description="Sales of the sampled product after delivery, divided by samples sent (products with at least 2 judged samples)." />
            <div className="px-5 pb-5">
              <BarList
                items={ranked.slice(0, 10).map((p, i) => ({
                  label: p.name,
                  value: p.gmvPerSample,
                  display: fmtRM(p.gmvPerSample),
                  sub: `${p.samples} samples · ${p.postingRate == null ? "–" : fmtPct(p.postingRate, 0)} posted`,
                  highlight: i === 0,
                }))}
                emptyText="Not enough samples past the posting deadline yet."
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Items sent" description="Single items that went out as samples. Bundles are split using your SKU list." />
            <div className="px-5 pb-5">
              <BarList
                color="var(--s3)"
                items={items.slice(0, 12).map((it) => ({ label: it.name, value: it.qty, display: fmtInt(it.qty), sub: `${it.creators} creators` }))}
              />
            </div>
          </Card>
        </section>

        <Card>
          <CardHeader title="Sampled SKUs" description={`${fmtInt(totalSamples)} samples across ${list.length} SKUs. Posting rate counts samples past their posting deadline.`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Samples</Th>
                  <Th align="right">Creators</Th>
                  <Th align="right">Posted</Th>
                  <Th align="right">Posting rate</Th>
                  <Th align="right">Days to post</Th>
                  <Th align="right">Sales after</Th>
                  <Th align="right">Orders</Th>
                  <Th align="right">Sales / sample</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.sku} className="hover:bg-surface-2/60">
                    <Td className="max-w-[360px]">
                      <span className="block leading-snug">{p.name}</span>
                      <span className="text-[11.5px] text-ink-3">
                        {p.sku}
                        {p.isSet && <Badge className="ml-1.5" tone="brand">Set</Badge>}
                      </span>
                      {p.contents && <span className="block text-[11.5px] text-ink-3">Contains {p.contents}</span>}
                    </Td>
                    <Td align="right">{fmtInt(p.samples)}</Td>
                    <Td align="right">{fmtInt(p.creators)}</Td>
                    <Td align="right">{fmtInt(p.posted)} / {fmtInt(p.judged)}</Td>
                    <Td align="right" className={cn(p.postingRate != null && p.postingRate < 0.5 && "font-medium text-serious")}>{p.postingRate == null ? "–" : fmtPct(p.postingRate, 0)}</Td>
                    <Td align="right">{p.avgDaysToPost == null ? "–" : `${p.avgDaysToPost.toFixed(1)}d`}</Td>
                    <Td align="right" className="font-medium">{p.contentGmv ? fmtRM(p.contentGmv) : "–"}</Td>
                    <Td align="right">{fmtInt(p.contentOrders)}</Td>
                    <Td align="right">{p.gmvPerSample ? fmtRM(p.gmvPerSample) : "–"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
