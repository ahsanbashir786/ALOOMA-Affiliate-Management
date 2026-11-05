"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { confirmSuggested, setListingProduct, setSkuProduct, undoMapChange } from "@/app/actions/products";
import { EXCLUDED, PRODUCTS, UNMAPPED } from "@/lib/products/catalog";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { AddOn, Listing, MapLog } from "@/lib/products/mapping";

const fmtRM = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const nm = (k: string | null) => (k === EXCLUDED ? "Excluded" : PRODUCTS.find((p) => p.key === k)?.name ?? "Unmapped");

function ProductSelect({ value, onChange, disabled, label, followLabel }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; followLabel?: string }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-full min-w-[210px] rounded-lg border border-line-strong bg-surface px-2 text-[13.5px] text-ink disabled:opacity-60">
      {followLabel ? <option value="">{followLabel}</option> : <option value={UNMAPPED}>Unmapped</option>}
      {PRODUCTS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      <option value={EXCLUDED}>Excluded (Not Sold Any More)</option>
    </select>
  );
}

export function MappingBoard({ listings, addons, log, unconfirmed }: { listings: Listing[]; addons: AddOn[]; log: MapLog[]; unconfirmed: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ error?: string }>) => { setErr(""); start(async () => { const r = await fn(); if (r.error) setErr(r.error); router.refresh(); }); };

  return (
    <div className="space-y-6" aria-busy={pending}>
      {err && <p className="rounded-lg bg-critical-soft px-3 py-2 text-[14px] text-critical" role="alert">{err}</p>}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Listings</h2>
            <p className="text-[13.5px] text-ink-3">One row per TikTok listing (product ID). Choose which of your 13 products it is. “Suggested” is only my first guess from the title and what the listing sells.</p>
          </div>
          <button type="button" disabled={pending || unconfirmed === 0} onClick={() => run(() => confirmSuggested())} data-testid="confirm-all" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-40">
            <Check className="size-4" /> Confirm All Suggested ({unconfirmed})
          </button>
        </div>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[980px]" data-testid="listings-table">
            <thead><tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3"><th className="px-2 py-2">Listing</th><th className="px-2 py-2 text-right">Orders</th><th className="px-2 py-2">What It Sells</th><th className="px-2 py-2">Your Product</th><th className="px-2 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {listings.map((l) => (
                <tr key={l.productId} data-testid={`listing-${l.productId}`} className="align-top">
                  <td className="max-w-[340px] px-2 py-3"><p className="text-[14px] leading-snug font-medium text-ink">{l.title}</p><p className="text-[12px] text-ink-3">ID …{l.productId.slice(-6)} · {l.priceMin != null ? `RM ${l.priceMin}–${l.priceMax}` : "price ?"} · {l.skus} SKU{l.skus === 1 ? "" : "s"}</p></td>
                  <td className="tnum px-2 py-3 text-right"><p className="text-[14px] font-semibold">{l.orders.toLocaleString("en-MY")}</p><p className="text-[12px] text-ink-3">{l.gmv > 0 ? fmtRM(l.gmv) : "no sales"}{l.samples ? ` · ${l.samples} samples` : ""}</p></td>
                  <td className="max-w-[230px] px-2 py-3 text-[12.5px] text-ink-2">{l.variations.length ? l.variations.join(" / ") : "–"}{l.families.length > 0 && <p className="mt-0.5 text-ink-3">{l.families.map((f) => `${f.name} ${f.lines.toLocaleString("en-MY")}`).join(" · ")}</p>}</td>
                  <td className="px-2 py-3"><ProductSelect label={`Product of listing ${l.productId}`} value={l.key ?? UNMAPPED} disabled={pending} onChange={(v) => run(() => setListingProduct(l.productId, v))} /></td>
                  <td className="px-2 py-3">
                    {l.key && l.confirmed ? <Badge tone="good">Confirmed</Badge>
                      : l.key ? <span className="flex flex-col items-start gap-1"><Badge tone="warn">Suggested</Badge><button type="button" disabled={pending} onClick={() => run(() => confirmSuggested(l.productId))} className="text-[12.5px] font-medium text-brand hover:underline">Confirm</button></span>
                      : <Badge tone="critical">Unmapped</Badge>}
                    {!l.confirmed && <p className="mt-1 max-w-[190px] text-[12px] text-ink-3">{l.key ? l.suggestion.why : l.suggestion.key ? `Suggestion: ${nm(l.suggestion.key)} – ${l.suggestion.why}` : l.suggestion.why}</p>}
                    {l.confirmed && l.key !== l.suggestion.key && l.suggestion.key && <p className="mt-1 max-w-[190px] text-[12px] text-ink-3">I had suggested: {nm(l.suggestion.key)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[17px] font-semibold text-ink">Add-on SKUs</h2>
        <p className="mb-3 text-[13.5px] text-ink-3">The same seller SKU appears in more than one listing. When it is a big part of one listing (its home) and a tiny part of another, it is probably an add-on there (for example a pillow inside a mattress protector listing). Orders of a SKU you move here count under that product, not under its listing.</p>
        {addons.length === 0 ? <p className="text-[14px] text-ink-3">No add-on SKUs found.</p> : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[900px]" data-testid="addons-table">
              <thead><tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3"><th className="px-2 py-2">SKU</th><th className="px-2 py-2">Sold Inside Listing</th><th className="px-2 py-2 text-right">Lines</th><th className="px-2 py-2">Counts As</th><th className="px-2 py-2" /></tr></thead>
              <tbody className="divide-y divide-line">
                {addons.map((a) => (
                  <tr key={a.skuId} data-testid={`addon-${a.skuId}`} className="align-top">
                    <td className="px-2 py-3"><p className="text-[14px] font-medium text-ink">{a.sellerSku}</p><p className="text-[12px] text-ink-3">{a.variation ?? "–"} · SKU ID …{a.skuId.slice(-6)}</p></td>
                    <td className="max-w-[300px] px-2 py-3 text-[13px] text-ink-2">{a.listingTitle}<p className="text-[12px] text-ink-3">{nm(a.listingKey)}{a.sharePct ? ` · only ${a.sharePct}% of its lines` : ""}</p></td>
                    <td className="tnum px-2 py-3 text-right text-[14px] font-semibold">{a.lines.toLocaleString("en-MY")}</td>
                    <td className="px-2 py-3"><ProductSelect label={`Product of SKU ${a.skuId}`} value={a.overrideKey ?? ""} followLabel={`Follows Its Listing (${nm(a.listingKey)})`} disabled={pending} onChange={(v) => run(() => setSkuProduct(a.skuId, a.productId, v || null))} /></td>
                    <td className="px-2 py-3">{a.overrideKey === null && a.homeTitle && <button type="button" disabled={pending} onClick={() => run(() => setSkuProduct(a.skuId, a.productId, a.suggestedKey))} data-testid={`addon-use-${a.skuId}`} className={cn("text-[13px] font-medium text-brand hover:underline")}>Use Suggested: {nm(a.suggestedKey)}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {log.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-2 text-[17px] font-semibold text-ink">Recent Changes</h2>
          <ul className="divide-y divide-line text-[13.5px]" data-testid="map-log">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-ink-3">{l.at.slice(0, 16).replace("T", " ")}</span>
                <span className="text-ink-2">{l.by ?? "System"}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{l.kind === "sku" ? `SKU ${l.ref.slice(-6)}` : l.label}: {l.from ?? "none"} → {l.to ?? "follows listing"}</span>
                {l.undone ? <span className="text-ink-3">undone</span> : <button type="button" disabled={pending} onClick={() => run(() => undoMapChange(l.id))} className="font-medium text-brand hover:underline">Undo</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
