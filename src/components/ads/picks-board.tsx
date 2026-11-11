"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Copy, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP, GROUPS, type GroupKey } from "@/lib/ads/groups";
import { GroupPill, StatusPill, VideoCell, nfmt, rm, roiFmt, day, th, thr, td, tdr } from "./ui";

export type PickRow = {
  key: string; creativeId: string; productId: string; title: string | null; creator: string | null; postedOn: string | null; productLabel: string;
  cost: number; orders: number; revenue: number; roi: number | null; cost7: number; organicGmv: number; lastSpend: string | null;
  status: string | null; statusLabel: string | null; boostedNow: boolean; lastLogged: string | null; group: GroupKey; why: string;
};
type View = GroupKey | "best";

export function PicksBoard({ byGroup, best, counts, start, rules, autoRoi, accountRoi, products, product, q }: {
  byGroup: Record<GroupKey, PickRow[]>; best: PickRow[]; counts: Record<GroupKey, number>; start: View;
  rules: { minRoi: number; minOrders: number; idleDays: number; roiIsAuto: boolean }; autoRoi: number; accountRoi: number | null;
  products: { key: string; label: string }[]; product: string | null; q: string;
}) {
  const [view, setView] = useState<View>(start);
  const [picked, setPicked] = useState<Map<string, PickRow>>(new Map());
  const [copied, setCopied] = useState(false);
  const list = view === "best" ? best : byGroup[view];
  const total = view === "best" ? counts.stopped + counts.promise + counts.underfed + counts.never : counts[view];
  const chosen = useMemo(() => [...picked.values()], [picked]);
  const toggle = (r: PickRow) => setPicked((p) => { const n = new Map(p); if (n.has(r.key)) n.delete(r.key); else if (n.size < 50) n.set(r.key, r); return n; });
  const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";
  const chip = (k: View, label: string, n: number, about: string) => (
    <button key={k} type="button" onClick={() => setView(k)} title={about} data-testid={`ads-group-${k}`} aria-pressed={view === k}
      className={cn("flex min-w-[150px] flex-1 flex-col rounded-xl border px-3.5 py-2.5 text-left", view === k ? "border-brand/50 bg-brand-soft" : "border-line bg-surface hover:bg-surface-2")}>
      <span className={cn("text-[12.5px] font-medium", view === k ? "text-brand-strong" : "text-ink-2")}>{label}</span>
      <span className="tnum text-[20px] leading-tight font-semibold text-ink">{nfmt(n)}</span>
    </button>
  );
  const planHref = `/ads?tab=planner&v=${encodeURIComponent(chosen.map((c) => c.key).join(","))}`;

  return (
    <div className="space-y-5" data-testid="ads-picks">
      <section aria-label="Video groups" className="space-y-2">
        <p className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">Worth Boosting</p>
        <div className="flex flex-wrap gap-2">
          {chip("best", "Best Picks (All Four)", counts.stopped + counts.promise + counts.underfed + counts.never, "The strongest videos from the four groups beside this one")}
          {GROUPS.filter((g) => g.boost).map((g) => chip(g.key, g.label, counts[g.key], g.about))}
        </div>
        <p className="pt-1 text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">Do Not Boost</p>
        <div className="flex flex-wrap gap-2">{GROUPS.filter((g) => !g.boost).map((g) => chip(g.key, g.label, counts[g.key], g.about))}</div>
      </section>

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end" data-testid="ads-filters">
        <input type="hidden" name="tab" value="picks" /><input type="hidden" name="group" value={view} />
        <label className="text-[12.5px] font-medium text-ink-2">Good ROI Is At Least
          <input name="roi" type="number" min={1} step="0.5" defaultValue={rules.roiIsAuto ? "" : rules.minRoi} placeholder={`${autoRoi} (automatic)`} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Proven Means Orders ≥
          <input name="orders" type="number" min={1} defaultValue={rules.minOrders} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Stopped = No Spend For (Days)
          <input name="idle" type="number" min={1} defaultValue={rules.idleDays} className={cn(input, "mt-1")} />
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Product
          <select name="product" defaultValue={product ?? ""} className={cn(input, "mt-1")}><option value="">All products</option>{products.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        </label>
        <label className="text-[12.5px] font-medium text-ink-2">Creator Or Title
          <input name="q" defaultValue={q} placeholder="Search" className={cn(input, "mt-1")} />
        </label>
        <div className="flex gap-2"><button type="submit" className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">Apply</button><Link href="/ads?tab=picks" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[14px] text-ink-2 hover:bg-surface-2">Reset</Link></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Videos">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[16px] font-semibold text-ink">{view === "best" ? "Best Picks" : GROUP[view].label}</h2>
            <p className="mt-0.5 max-w-3xl text-[13px] text-ink-3" data-testid="ads-summary">{view === "best" ? "The strongest videos that are worth a boost, judged on all of their history." : GROUP[view].about} Showing {nfmt(list.length)} of {nfmt(total)}.</p>
          </div>
          <details className="max-w-sm text-[12.5px] text-ink-3"><summary className="flex cursor-pointer items-center gap-1 hover:text-brand"><Info className="size-3.5" />How videos are judged</summary>
            <p className="mt-1.5 leading-relaxed">Every video is judged on all of its ad history, not only recent days. Good ROI is {rules.minRoi}× or more (your all-time ROI is {roiFmt(accountRoi)}). Proven means {rules.minOrders} orders or more. Stopped means no ad spend for more than {rules.idleDays} days, or TikTok says it is not delivering. Sales without ads come from the Shop sync.</p>
          </details>
        </div>
        {list.length === 0 ? <p className="px-5 pb-8 text-[14px] text-ink-3" data-testid="ads-empty">No video in this group with these rules.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-[13.5px]" data-testid="ads-table">
              <thead><tr className="border-y border-line bg-surface-2/60">
                <th className="w-10 px-4 py-2.5"><span className="sr-only">Select</span></th>
                <th className={th}>Video</th><th className={th}>Group</th><th className={th}>Product</th><th className={th}>Delivery</th>
                <th className={thr}>All-Time Spend</th><th className={thr}>Orders</th><th className={thr}>Sales From Ads</th><th className={thr}>ROI</th><th className={thr}>Sales Without Ads</th><th className={cn(thr, "pr-4")}>Last Spend</th>
              </tr></thead>
              <tbody>
                {list.map((s) => {
                  const on = picked.has(s.key), can = GROUP[s.group].boost && !s.boostedNow;
                  return (
                    <tr key={s.key} data-testid="ads-row" className={cn("border-b border-line", on ? "bg-brand-soft/60" : "hover:bg-surface-2/50")}>
                      <td className="px-4 py-3 align-top"><input type="checkbox" aria-label={`Select video ${s.creativeId}`} disabled={!can} title={can ? undefined : s.boostedNow ? "Already in a boost now" : "This group should not be boosted"} checked={on} onChange={() => toggle(s)} className="size-4 accent-[var(--brand)] disabled:opacity-40" /></td>
                      <td className={cn(td, "max-w-[340px]")}><VideoCell v={s} />{(s.boostedNow || s.lastLogged) && <p className="mt-1 flex gap-1">{s.boostedNow && <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11.5px] text-good">Boost running now</span>}{s.lastLogged && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">You boosted it on {day(s.lastLogged)}</span>}</p>}</td>
                      <td className={td}><GroupPill group={s.group} /></td>
                      <td className={cn(td, "text-ink-2")}><span className="block max-w-[170px] truncate" title={s.productLabel}>{s.productLabel}</span></td>
                      <td className={td}><StatusPill status={s.status} label={s.statusLabel} /></td>
                      <td className={tdr}>{rm(s.cost)}</td><td className={tdr}>{nfmt(s.orders)}</td><td className={tdr}>{rm(s.revenue)}</td>
                      <td className={cn(tdr, "font-semibold", s.roi != null && s.roi >= rules.minRoi ? "text-good" : "text-ink")}>{roiFmt(s.roi)}</td>
                      <td className={cn(tdr, "text-ink-2")}>{s.organicGmv > 0 ? rm(s.organicGmv) : "–"}</td>
                      <td className={cn(tdr, "pr-4 text-ink-2")}>{s.lastSpend ? day(s.lastSpend) : "Never"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={cn("sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-pop", chosen.length ? "border-brand/40" : "border-line")} data-testid="ads-selection">
        <span className="text-[14px] font-medium text-ink">{chosen.length ? `${chosen.length} video${chosen.length === 1 ? "" : "s"} selected` : "Tick videos to build a boost batch"}</span>
        {chosen.length > 0 && <button type="button" onClick={() => setPicked(new Map())} className="text-[13px] text-ink-3 underline hover:text-ink">Clear</button>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPicked(new Map(list.filter((s) => GROUP[s.group].boost && !s.boostedNow).slice(0, 10).map((s) => [s.key, s])))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2" data-testid="ads-pick-top"><Sparkles className="size-4" />Pick Top 10</button>
          <button type="button" disabled={!chosen.length} onClick={() => { void navigator.clipboard?.writeText(chosen.map((s) => s.creativeId).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Video IDs"}</button>
          {chosen.length ? <Link href={planHref} data-testid="ads-open-planner" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-strong"><CalendarCheck className="size-4" />Plan This Batch</Link>
            : <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-4 text-[13.5px] font-medium text-brand-strong opacity-70"><CalendarCheck className="size-4" />Plan This Batch</span>}
        </span>
      </div>
    </div>
  );
}
