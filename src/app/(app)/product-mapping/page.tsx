import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getMappingView } from "@/lib/products/mapping";
import { EXCLUDED, PRODUCTS, UNMAPPED, productName } from "@/lib/products/catalog";
import { MappingBoard } from "@/components/products/mapping-board";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product Mapping" };
const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;

export default async function ProductMappingPage() {
  await requireUser("manager");
  const v = await getMappingView();
  const c = v.coverage;
  const pct = c.totalLines ? Math.round(((c.totalLines - c.unmappedLines) / c.totalLines) * 1000) / 10 : 100;
  const ok = c.unmappedLines === 0 && c.adds;
  return (
    <div className="space-y-6">
      <PageHeader title="Product Mapping" description="Which of your 13 products each TikTok listing and add-on SKU is. Every list in the system uses these names, in your order." />

      <section className="rounded-2xl border border-line bg-surface p-5" data-testid="coverage">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-ink">Coverage</h2>
          <p className={cn("text-[14px] font-medium", ok ? "text-good" : "text-warn")} data-testid="coverage-state">
            {c.unmappedLines === 0 ? "✓ Every order line is mapped" : `${c.unmappedLines.toLocaleString("en-MY")} order lines are not mapped (${(100 - pct).toFixed(1)}%)`}
            {c.adds ? " · ✓ the products add up to the total" : " · ✗ the products do NOT add up to the total – tell me"}
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        <div className="-mx-2 mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[14px]">
            <thead><tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3"><th className="px-2 py-2">Product</th><th className="px-2 py-2 text-right">Order Lines</th><th className="px-2 py-2 text-right">Sales</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...PRODUCTS.map((p) => p.key as string), EXCLUDED, UNMAPPED].map((k) => {
                const r = c.rows.find((x) => x.key === k);
                if (!r && k !== UNMAPPED && k !== EXCLUDED) return <tr key={k} className="text-ink-3"><td className="px-2 py-2">{productName(k)}</td><td className="tnum px-2 py-2 text-right">0</td><td className="tnum px-2 py-2 text-right">–</td></tr>;
                if (!r) return null;
                return <tr key={k} className={cn(k === UNMAPPED && "text-warn", k === EXCLUDED && "text-ink-3")}><td className="px-2 py-2">{k === EXCLUDED ? "Excluded (Not Counted Anywhere)" : productName(k)}</td><td className="tnum px-2 py-2 text-right">{r.lines.toLocaleString("en-MY")}</td><td className="tnum px-2 py-2 text-right">{rm(r.gmv)}</td></tr>;
              })}
              <tr className="font-semibold"><td className="px-2 py-2">Total</td><td className="tnum px-2 py-2 text-right">{c.totalLines.toLocaleString("en-MY")}</td><td className="tnum px-2 py-2 text-right">{rm(c.totalGmv)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <MappingBoard listings={v.listings} addons={v.addons} log={v.log} unconfirmed={v.unconfirmed} />
    </div>
  );
}
