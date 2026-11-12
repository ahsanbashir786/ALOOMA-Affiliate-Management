import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql as pg } from "@/db";
import { gate } from "@/lib/gate";
import { Badge, Card, CardHeader, PageHeader, Td, Th } from "@/components/ui/primitives";
import { loadProfit } from "@/lib/profit/data";
import { titleCase } from "@/lib/profit/claims";
import { MONEY_STATE, rm, tone } from "@/lib/profit/format";
import { loadCosting } from "@/lib/stock/costing";

export const metadata: Metadata = { title: "Profit And Loss" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/profit/order/[id]">) {
  const { denied } = await gate("profit", "Profit And Loss");
  if (denied) return denied;
  const id = decodeURIComponent((await params).id);
  const [data, costing] = await Promise.all([loadProfit(), loadCosting()]);
  const r = data.rows.find((x) => x.orderId === id);
  if (!r) notFound();
  const lines = costing.byOrder.get(id)?.lines ?? [];
  const tx = await pg`select t.type, t.adjustment_id, coalesce(t.settlement_amount, 0)::float8 as amount, s.payment_status, to_char(s.statement_time, 'YYYY-MM-DD') as day
    from tt_fin_transactions t left join tt_fin_statements s on s.id = t.statement_id where t.order_id = ${id} order by s.statement_time`;
  const ms = MONEY_STATE[r.money];
  const steps: { label: string; note?: string; v: number; strong?: boolean }[] = r.money === "none" && !r.isSample ? [] : [
    { label: "Sales", v: r.sales },
    { label: "TikTok Commission", v: r.commission },
    { label: "Affiliate Commission", v: r.affiliate },
    { label: "Ads Top-Up Taken By TikTok", note: "GMV Max ad fee deducted from this order's money. Not the real ad spend.", v: r.adFee },
    { label: "Seller Shipping Fee Deducted", note: r.shippingActual ? `Shipping ${rm(r.shippingActual)}, buyer paid ${rm(r.shippingBuyer)}, platform discount ${rm(r.shippingDiscount)}` : undefined, v: r.shipping },
    { label: "Transaction Fee, Service Fee, Tax And Other", v: r.otherFees },
    { label: "Reimbursements", v: r.reimbursement },
    { label: "Deductions (Adjustments)", v: r.deduction },
    { label: "Settlement From TikTok", v: r.settlement, strong: true },
  ];
  return (
    <div className="space-y-5">
      <Link href="/profit" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Profit And Loss</Link>
      <PageHeader title={`Order ${r.orderId}`} description={`${r.day} · ${r.pieces} pieces · ${r.status ?? ""}`} actions={<Badge tone={ms.tone}>{ms.label}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where The Money Went" description={r.money === "estimate" ? "TikTok has not paid this order yet. These are TikTok's estimates." : r.money === "none" ? "TikTok has not given money data for this order yet." : undefined} />
          <table className="w-full border-collapse" data-testid="order-waterfall">
            <tbody>
              {steps.map((s) => (
                <tr key={s.label} className={s.strong ? "bg-surface-2" : ""}>
                  <Td className={s.strong ? "font-semibold" : ""}>{s.label}{s.note && <span className="block text-[12px] font-normal text-ink-3">{s.note}</span>}</Td>
                  <Td align="right" className={s.strong ? "font-semibold" : s.v === 0 ? "text-ink-3" : ""}>{rm(s.v)}</Td>
                </tr>
              ))}
              <tr><Td>Product Cost <span className="text-[12px] text-ink-3">(First In, First Out{r.returnedPieces ? `, ${r.returnedPieces} returned` : ""})</span></Td><Td align="right">{rm(-r.cost)}</Td></tr>
              <tr><Td>Fulfilment</Td><Td align="right">{rm(-r.fulfilment)}</Td></tr>
              <tr className="bg-surface-2"><Td className="font-semibold">Profit Before Ads <span className="block text-[12px] font-normal text-ink-3">Settlement with the ads top-up added back, less cost and fulfilment</span></Td><Td align="right" className={`font-semibold ${tone(r.profitBeforeAds)}`}>{rm(r.profitBeforeAds)}</Td></tr>
            </tbody>
          </table>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="What The Pieces Cost" description="Each piece comes from the oldest stock that had arrived. A bundle is split into its parts." />
            <table className="w-full border-collapse" data-testid="order-cost-lines">
              <thead><tr><Th>SKU</Th><Th align="right">Pieces</Th><Th align="right">Cost</Th><Th>Taken From</Th></tr></thead>
              <tbody>
                {lines.map((l, i) => <tr key={i}><Td className="font-medium">{l.sku}</Td><Td align="right">{l.qty}</Td><Td align="right">{rm(l.cost)}</Td><Td className="text-[12.5px] text-ink-3">{l.from.replace(/OPENING/g, "Opening Stock")}</Td></tr>)}
                {!lines.length && <tr><Td colSpan={4} className="text-ink-3">No SKU on this order.</Td></tr>}
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="TikTok Finance Records" description="Every settlement line and adjustment TikTok made on this order." />
            <table className="w-full border-collapse"><thead><tr><Th>Day</Th><Th>What</Th><Th align="right">Amount</Th></tr></thead>
              <tbody>
                {tx.map((t, i) => <tr key={i}><Td>{(t.day as string) ?? "–"}</Td><Td>{t.adjustment_id ? titleCase(t.type as string) : "Order Settlement"} {t.payment_status ? <Badge tone={t.payment_status === "PAID" ? "good" : "brand"} className="ml-1">{t.payment_status === "PAID" ? "Paid" : "Not Paid Yet"}</Badge> : null}</Td><Td align="right">{rm(Number(t.amount))}</Td></tr>)}
                {!tx.length && <tr><Td colSpan={3} className="text-ink-3">TikTok has not settled this order yet.</Td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
