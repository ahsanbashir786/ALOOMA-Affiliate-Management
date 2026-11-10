"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Copy, Info, Rocket, Target } from "lucide-react";
import { Person } from "@/components/execution/ui";
import { cn } from "@/lib/utils";
import type { BoostData, BoostFilters, Kpi } from "@/lib/ads/boost";

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };

function Delta({ now, before, neutral }: { now: number | null; before: number | null; neutral?: boolean }) {
  if (now == null || before == null || before === 0) return <span className="text-[12.5px] text-ink-3">no earlier period</span>;
  const p = ((now - before) / before) * 100;
  const good = p > 0;
  const Icon = p >= 0 ? ArrowUp : ArrowDown;
  return <span className={cn("inline-flex items-center gap-0.5 text-[12.5px] font-medium", Math.abs(p) < 0.5 || neutral ? "text-ink-3" : good ? "text-good" : "text-critical")}><Icon className="size-3.5" />{Math.abs(p).toFixed(0)}% vs before</span>;
}

function Tile({ label, value, delta, hint }: { label: string; value: string; delta: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4" title={hint}>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className="tnum mt-0.5 text-[24px] leading-tight font-semibold text-ink">{value}</p>
      <p className="mt-1">{delta}</p>
    </div>
  );
}

export function BoostBoard({ data, filters, connected }: { data: BoostData; filters: BoostFilters; connected: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const key = (s: { creativeId: string; productId: string }) => `${s.creativeId}|${s.productId}`;
  const chosen = useMemo(() => data.suggestions.filter((s) => picked.has(key(s))), [data.suggestions, picked]);
  const sum = chosen.reduce((a, s) => ({ cost: a.cost + s.cost, rev: a.rev + s.revenue }), { cost: 0, rev: 0 });

  if (!connected)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="ads-not-connected">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Target className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect TikTok Ads first</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Connect it in Settings, then sync it in Data Sync → Ads Management. Your GMV Max results will appear here.</p>
        <Link href="/settings?tab=connection&src=ads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
      </div>
    );
  if (!data.hasData)
    return (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="ads-no-data">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Rocket className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">No video results yet</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Press Sync Now in Data Sync → Ads Management. When Creative Results has numbers, the videos worth boosting appear here.</p>
        <Link href="/sync?tab=ads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Data Sync</Link>
      </div>
    );

  const { now, before } = data;
  const tile = (label: string, k: keyof Kpi, fmt: (n: number) => string, neutral = false) => <Tile label={label} value={now[k] == null ? "–" : fmt(now[k] as number)} delta={<Delta now={now[k]} before={before[k]} neutral={neutral} />} />;
  const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";

  return (
    <div className="space-y-5" data-testid="ads-board">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={`Last ${data.days} days`}>
        {tile("Ad Spend", "cost", rm, true)}
        {tile("Sales From Ads", "revenue", rm)}
        {tile("Orders", "orders", (n) => n.toLocaleString("en-MY"))}
        {tile("ROI", "roi", (n) => `${n.toFixed(1)}×`)}
      </section>
      <p className="-mt-2 text-[12.5px] text-ink-3">Last {data.days} days ({day(data.from)} – {day(data.today)}){data.freshest ? ` · video results up to ${day(data.freshest)}` : ""}</p>

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end" data-testid="ads-filters">
        <label className="text-[12.5px] font-medium text-ink-2">Period
          <select name="days" defaultValue={filters.days} className={cn(input, "mt-1")}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Minimum ROI
          <input name="roi" type="number" min={1} defaultValue={filters.minRoi ?? ""} placeholder={`${data.minRoiUsed} (automatic)`} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Minimum orders
          <input name="orders" type="number" min={1} defaultValue={filters.minOrders} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Posted within (days)
          <input name="age" type="number" min={7} defaultValue={filters.maxAgeDays} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Product
          <select name="product" defaultValue={filters.product ?? ""} className={cn(input, "mt-1")}><option value="">All products</option>{data.products.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        </label>
        <div className="flex gap-2"><button type="submit" className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">Apply</button><Link href="/ads" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[14px] text-ink-2 hover:bg-surface-2">Reset</Link></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Videos worth boosting">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[16px] font-semibold text-ink">Videos Worth Boosting</h2>
            <p className="mt-0.5 text-[13px] text-ink-3" data-testid="ads-summary">{data.suggestions.length} of {data.considered.toLocaleString("en-MY")} videos with ad spend · ROI at least {data.minRoiUsed}× (your average is {data.accountRoi ? `${data.accountRoi.toFixed(1)}×` : "–"}) and at least {filters.minOrders} orders</p>
          </div>
          <details className="max-w-sm text-[12.5px] text-ink-3"><summary className="flex cursor-pointer items-center gap-1 hover:text-brand"><Info className="size-3.5" />How videos are chosen</summary>
            <p className="mt-1.5 leading-relaxed">Videos that already sell well through GMV Max (ROI and orders in the period), that are not too old, ranked by ROI and number of orders. A video that has had little spend compared with the others has room to grow. Whether TikTok accepts a boost for a video is checked by TikTok when you boost it.</p>
          </details>
        </div>
        {data.suggestions.length === 0 ? (
          <p className="px-5 pb-8 text-[14px] text-ink-3" data-testid="ads-empty">No video passes these rules. Lower the minimum ROI or orders, or widen the period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13.5px]" data-testid="ads-table">
              <thead>
                <tr className="border-y border-line bg-surface-2/60 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
                  <th className="w-10 px-4 py-2.5"><span className="sr-only">Select</span></th>
                  <th className="py-2.5 pr-3">Video</th><th className="py-2.5 pr-3">Product</th>
                  <th className="py-2.5 pr-3 text-right">Spend</th><th className="py-2.5 pr-3 text-right">Orders</th><th className="py-2.5 pr-3 text-right">Sales</th><th className="py-2.5 pr-3 text-right">ROI</th><th className="py-2.5 pr-3 text-right">Cost / Order</th><th className="py-2.5 pr-4 text-right">Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.map((s) => {
                  const on = picked.has(key(s));
                  return (
                    <tr key={key(s)} data-testid="ads-row" className={cn("border-b border-line align-top", on ? "bg-brand-soft/60" : "hover:bg-surface-2/50")}>
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Select video ${s.creativeId}`} checked={on} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(key(s))) n.delete(key(s)); else n.add(key(s)); return n; })} className="size-4 accent-[var(--brand)]" /></td>
                      <td className="max-w-[360px] py-3 pr-3">
                        <div className="flex items-start gap-2.5">
                          {s.creator ? <Person name={s.creator} size={30} /> : <span className="size-[30px] shrink-0 rounded-full bg-surface-2" />}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink" title={s.title ?? undefined}>{s.title || `Video ${s.creativeId.slice(-8)}`}</p>
                            <p className="text-[12.5px] text-ink-3">{s.creator ? <Link href={`/creators/${encodeURIComponent(s.creator)}`} className="text-brand hover:underline">@{s.creator}</Link> : "Creator not found"}{s.postedOn ? ` · ${day(s.postedOn)}` : ""}</p>
                            <p className="mt-1 flex flex-wrap gap-1">{s.reasons.map((r) => <span key={r} className={cn("rounded-full px-2 py-0.5 text-[11.5px]", r === "spending now" ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2")}>{r}</span>)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-ink-2"><span className="block max-w-[200px] truncate" title={s.productLabel}>{s.productLabel}</span>{s.account && <span className="text-[12px] text-ink-3">{s.account}</span>}</td>
                      <td className="tnum py-3 pr-3 text-right text-ink">{rm(s.cost)}</td>
                      <td className="tnum py-3 pr-3 text-right text-ink">{s.orders.toLocaleString("en-MY")}</td>
                      <td className="tnum py-3 pr-3 text-right text-ink">{rm(s.revenue)}</td>
                      <td className="tnum py-3 pr-3 text-right font-semibold text-good">{s.roi.toFixed(1)}×</td>
                      <td className="tnum py-3 pr-3 text-right text-ink-2">{s.costPerOrder != null ? `RM ${s.costPerOrder.toFixed(2)}` : "–"}</td>
                      <td className="tnum py-3 pr-4 text-right text-ink-2">{s.ctr != null ? `${(s.ctr * 100).toFixed(1)}%` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={cn("sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-pop transition-colors", chosen.length ? "border-brand/40" : "border-line")} data-testid="ads-selection">
        <span className="text-[14px] font-medium text-ink">{chosen.length ? `${chosen.length} video${chosen.length === 1 ? "" : "s"} selected` : "Select videos to build a boost batch"}</span>
        {chosen.length > 0 && <span className="text-[13px] text-ink-3">spent {rm(sum.cost)} · sales {rm(sum.rev)} · ROI {(sum.cost > 0 ? sum.rev / sum.cost : 0).toFixed(1)}×</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button disabled={!chosen.length} onClick={() => { void navigator.clipboard?.writeText(chosen.map((s) => s.creativeId).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Video IDs"}</button>
          <button disabled title="Next step: create the boost in TikTok from here, with a confirm box and a spending limit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-[13.5px] font-medium text-brand-strong opacity-70"><Rocket className="size-4" />Create Boost In TikTok · Coming Next</button>
        </span>
      </div>
    </div>
  );
}
