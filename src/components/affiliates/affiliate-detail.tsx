import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import type { Affiliate } from "@/lib/affiliates/service";
import { Td, Th } from "@/components/ui/primitives";
import { StateBadge } from "@/components/samples/result-badge";
import { fmtCompact, fmtDateShort, fmtInt, fmtRM } from "@/lib/utils";

const d = (s: string | null) => (s ? fmtDateShort(s) : "–");

/** Opened row: what she received, what she sold per SKU, and what to offer next. */
export function AffiliateDetail({ a, range }: { a: Affiliate; range?: string }) {
  // SKUs from samples and from sales, merged (case-insensitive).
  const sampledQty = new Map<string, number>();
  for (const l of a.lines) if (l.sku) sampledQty.set(l.sku.toUpperCase(), (sampledQty.get(l.sku.toUpperCase()) ?? 0) + l.quantity);
  const known = new Set(a.skus.map((s) => s.key));
  const onlySampled = [...sampledQty].filter(([k]) => !known.has(k));
  const nameOf = (sku: string) => a.lines.find((l) => l.sku?.toUpperCase() === sku)?.name ?? sku;
  const totals = a.skus.reduce((t, s) => ({ orders: t.orders + s.orders, qty: t.qty + s.qty, gmv: t.gmv + s.gmv, v: t.v + s.videoGmv, l: t.l + s.liveGmv }), { orders: 0, qty: 0, gmv: 0, v: 0, l: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <a href={`https://www.tiktok.com/@${a.username}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
          TikTok profile <ExternalLink className="size-3" />
        </a>
        <Link href={`/creators/${encodeURIComponent(a.username)}${range ? `?range=${range}` : ""}`} className="font-medium text-brand hover:underline">Full creator page</Link>
        {a.samples > 0 && <Link href={`/samples?view=all&q=${encodeURIComponent(a.username)}`} className="font-medium text-brand hover:underline">Open in sample tracker</Link>}
      </div>

      {a.action && (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px]">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <p className="text-ink"><span className="font-medium">{a.action.label}:</span> {a.action.text}</p>
        </div>
      )}

      <div className="grid gap-5">
        <section aria-label="Samples received">
          <h4 className="mb-2 text-[13px] font-semibold text-ink">Samples received</h4>
          {a.lines.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-3">No samples in the loaded data.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr><Th>Product</Th><Th align="right">Qty</Th><Th>Delivered</Th><Th>Status</Th><Th align="right">Videos</Th><Th align="right">Sales from it</Th></tr>
                </thead>
                <tbody>
                  {a.lines.map((l) => (
                    <tr key={l.id}>
                      <Td className="max-w-[260px]">
                        <span className="block leading-snug">{l.name ?? l.variation ?? l.sku}</span>
                        <span className="text-[11.5px] text-ink-3">{l.sku}{l.parts.length ? " · bundle" : ""}</span>
                        {l.parts.length > 0 && <span className="block text-[11.5px] text-ink-3">{l.parts.map((p) => `${p.qty}× ${p.name}`).join(", ")}</span>}
                      </Td>
                      <Td align="right">{l.quantity}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{d(l.deliveredAt)}</Td>
                      <Td><StateBadge state={l.state} manual={l.overridden} /></Td>
                      <Td align="right">{l.videos.length ? l.videos.filter((v) => v.product).length || l.videos.length : l.videoCount}{l.contentViews > 0 ? <span className="text-ink-3"> · {fmtCompact(l.contentViews)} views</span> : null}</Td>
                      <Td align="right" className="font-medium">{l.contentOrders > 0 ? `${fmtRM(l.contentGmv)} (${l.contentOrders})` : "–"}</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td colSpan={5} className="bg-surface-2/60 text-[12.5px] text-ink-2">Total from sample content (each product counted once)</Td>
                    <Td align="right" className="bg-surface-2/60 font-semibold text-good">{fmtRM(a.fromSamplesGmv)} ({fmtInt(a.fromSamplesOrders)})</Td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="Sales by SKU">
          <h4 className="mb-2 text-[13px] font-semibold text-ink">Sales by SKU</h4>
          {a.skus.length === 0 && onlySampled.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-3">No sales in the loaded data{range ? " for this date range" : ""}.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr><Th>SKU</Th><Th align="right">Sampled</Th><Th align="right">Orders</Th><Th align="right">GMV</Th><Th align="right">Video</Th><Th align="right">LIVE</Th></tr>
                </thead>
                <tbody>
                  {a.skus.map((s) => (
                    <tr key={s.key}>
                      <Td className="max-w-[260px]"><span className="block leading-snug">{s.name}</span><span className="text-[11.5px] text-ink-3">{s.sku}</span></Td>
                      <Td align="right">{sampledQty.get(s.key) ? `${sampledQty.get(s.key)} ✓` : "–"}</Td>
                      <Td align="right">{fmtInt(s.orders)}</Td>
                      <Td align="right" className="font-medium">{fmtRM(s.gmv)}</Td>
                      <Td align="right" className="text-ink-2">{s.videoGmv ? fmtRM(s.videoGmv) : "–"}</Td>
                      <Td align="right" className="text-ink-2">{s.liveGmv ? fmtRM(s.liveGmv) : "–"}</Td>
                    </tr>
                  ))}
                  {onlySampled.map(([k, q]) => (
                    <tr key={k}>
                      <Td className="max-w-[260px]"><span className="block leading-snug">{nameOf(k)}</span><span className="text-[11.5px] text-ink-3">{k}</span></Td>
                      <Td align="right">{q} ✓</Td>
                      <Td align="right" className="text-ink-3" colSpan={4}>no sales of this SKU yet</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td className="bg-surface-2/60 text-[12.5px] text-ink-2">Total</Td>
                    <Td align="right" className="bg-surface-2/60"> </Td>
                    <Td align="right" className="bg-surface-2/60 font-semibold">{fmtInt(totals.orders)}</Td>
                    <Td align="right" className="bg-surface-2/60 font-semibold">{fmtRM(totals.gmv)}</Td>
                    <Td align="right" className="bg-surface-2/60">{fmtRM(totals.v)}</Td>
                    <Td align="right" className="bg-surface-2/60">{fmtRM(totals.l)}</Td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {a.suggest.length > 0 && (
        <p className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">Samples to offer:</span> {a.suggest.join(", ")}{" "}
          <span className="text-ink-3">– top sellers she has not received or sold in the loaded data. Older months may change this.</span>
        </p>
      )}
    </div>
  );
}
