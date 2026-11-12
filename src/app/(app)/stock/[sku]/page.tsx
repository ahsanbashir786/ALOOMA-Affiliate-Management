import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { gate } from "@/lib/gate";
import { Badge, Card, CardHeader, PageHeader, Td, Th } from "@/components/ui/primitives";
import { skuDetail } from "@/lib/stock/overview";
import { normSku } from "@/lib/stock/sku";
import { fmtInt, fmtRM } from "@/lib/utils";
import { fmtDayLabel } from "@/lib/time";

export const metadata: Metadata = { title: "Stock And Costing" };
export const dynamic = "force-dynamic";

export default async function SkuPage({ params }: PageProps<"/stock/[sku]">) {
  const { denied } = await gate("stock", "Stock And Costing");
  if (denied) return denied;
  const sku = normSku(decodeURIComponent((await params).sku));
  const d = await skuDetail(sku);
  return (
    <div className="space-y-5">
      <Link href="/stock" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Stock And Costing</Link>
      <PageHeader title={d.sku} description={[d.name, d.family].filter(Boolean).join(" · ") || undefined} />
      <Card>
        <CardHeader title="Stock Layers" description={`Sold on TikTok: ${fmtInt(d.sold)} pieces, cost ${fmtRM(d.costOfSold, 2)}.${d.short ? ` ${fmtInt(d.short)} pieces had no stock found.` : ""}`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse" data-testid="sku-layers">
            <thead><tr><Th>Order</Th><Th>Arrived</Th><Th align="right">Pieces</Th><Th align="right">Cost Per Piece</Th><Th align="right">Left</Th><Th>Status</Th></tr></thead>
            <tbody>
              {d.layers.map((l) => (
                <tr key={l.orderNo}>
                  <Td className="font-medium">{l.orderNo === "OPENING" ? "Opening Stock" : `Order ${l.orderNo}`}</Td>
                  <Td className="text-ink-2">{fmtDayLabel(l.arrival)} {l.arrival.slice(0, 4)}</Td>
                  <Td align="right">{fmtInt(l.qty)}</Td>
                  <Td align="right">{fmtRM(l.unitCost, 2)}</Td>
                  <Td align="right">{fmtInt(l.left)}</Td>
                  <Td>{l.left === 0 ? <Badge>Used Up</Badge> : l.left === l.qty ? <Badge tone="brand">Untouched</Badge> : <Badge tone="warn">Partly Used</Badge>}</Td>
                </tr>
              ))}
              {!d.layers.length && <tr><Td colSpan={6} className="text-ink-3">No stock-in order has this SKU.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
