"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createColumnHelper, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarCheck, Check, ChevronLeft, ChevronRight, Copy, Flame, Gem, KeyRound, Rocket, Sparkles, Telescope, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP, GROUPS, type Evidence, type GroupKey } from "@/lib/ads/groups";
import type { EstKey } from "@/lib/ads/explore";
import { BoostMap } from "./boost-map";
import { EstPill, EvidenceDots, GroupPill, PotentialBar, StatusPill, VideoCell, nfmt, rm, roiFmt, day } from "./ui";

export type PickRow = {
  key: string; creativeId: string; productId: string; title: string | null; creator: string | null; postedOn: string | null; productLabel: string;
  cost: number; orders: number; revenue: number; roi: number | null; rCost: number; rOrders: number; rRevenue: number; rRoi: number | null; cost7: number; organicGmv: number; views: number; lastSpend: string | null; daysSinceSpend: number | null;
  status: string | null; statusDay: string | null; statusLabel: string | null; boostedNow: boolean; lastLogged: string | null; group: GroupKey; why: string;
  est: EstKey; potential: number; evidence: Evidence; testAmount: number;
};
type View = GroupKey | "best";
/** One batch holds at most this many videos. */
const MAX_BATCH = 50;
const PAGE = 20;

const LANES: { key: View; label: string; icon: React.ComponentType<{ className?: string }>; tint: string; ring: string }[] = [
  { key: "best", label: "Best Picks", icon: Sparkles, tint: "from-brand-soft to-surface", ring: "ring-brand/40" },
  { key: "stopped", label: "Proven, Left Alone", icon: TrendingUp, tint: "from-good-soft to-surface", ring: "ring-good/40" },
  { key: "gem", label: "Hidden Gems", icon: Gem, tint: "from-brand-soft to-surface", ring: "ring-brand/40" },
  { key: "underfed", label: "Selling, Low Spend", icon: Flame, tint: "from-warn-soft to-surface", ring: "ring-warn/40" },
  { key: "explore", label: "Worth Exploring", icon: Telescope, tint: "from-brand-soft to-surface", ring: "ring-brand/40" },
];
const col = createColumnHelper<PickRow>();

export function PicksBoard({ byGroup, best, counts, start, rules, autoRoi, accountRoi, products, product, q, rangeLabel, carry, rescue }: {
  byGroup: Record<GroupKey, PickRow[]>; best: PickRow[]; counts: Record<GroupKey, number>; start: View;
  rules: { minRoi: number; minOrders: number; idleDays: number; roiIsAuto: boolean }; autoRoi: number; accountRoi: number | null;
  products: { key: string; label: string }[]; product: string | null; q: string; rangeLabel: string; carry: string[][];
  /** What the Authorization Rescue tab holds. */ rescue: { videos: number; revenue: number };
}) {
  const [view, setView] = useState<View>(start);
  const [picked, setPicked] = useState<Map<string, PickRow>>(new Map());
  const [copied, setCopied] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const list = view === "best" ? best : byGroup[view];
  const total = view === "best" ? counts.stopped + counts.gem + counts.underfed + counts.explore : counts[view];
  const chosen = useMemo(() => [...picked.values()], [picked]);
  const toggle = (r: PickRow) => setPicked((p) => { const n = new Map(p); if (n.has(r.key)) n.delete(r.key); else if (n.size < MAX_BATCH) n.set(r.key, r); return n; });
  const boostable = (r: PickRow) => GROUP[r.group].boost && !r.boostedNow;
  const selectable = useMemo(() => list.filter(boostable), [list]);
  const allOn = selectable.length > 0 && selectable.slice(0, MAX_BATCH).every((s) => picked.has(s.key));
  const someOn = !allOn && selectable.some((s) => picked.has(s.key));
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = someOn; }, [someOn]);
  const toggleAll = () => setPicked((p) => { const n = new Map(p); if (allOn) { for (const s of selectable) n.delete(s.key); return n; } for (const s of selectable) { if (n.size >= MAX_BATCH) break; n.set(s.key, s); } return n; });
  // The map shows money against ROI for videos that had ad spend; for videos never used it shows views against sales without ads.
  const mode: "ads" | "organic" = view === "explore" || view === "never" || (view === "best" && !list.some((r) => r.cost > 0)) ? "organic" : "ads";

  const columns = useMemo(() => [
    col.display({ id: "pick", header: () => <input ref={allRef} type="checkbox" aria-label="Select all videos in this list" title={selectable.length ? `Select all ${Math.min(selectable.length, MAX_BATCH)} videos that can be boosted` : "Nothing here can be boosted"} disabled={!selectable.length} checked={allOn} onChange={toggleAll} data-testid="ads-select-all" className="size-4 accent-[var(--brand)] disabled:opacity-40" />,
      cell: ({ row }) => { const r = row.original; const can = boostable(r); return <input type="checkbox" aria-label={`Select video ${r.creativeId}`} disabled={!can} title={can ? undefined : r.boostedNow ? "Already in a boost now" : "This group should not be boosted"} checked={picked.has(r.key)} onChange={() => toggle(r)} className="size-4 accent-[var(--brand)] disabled:opacity-40" />; }, enableSorting: false }),
    col.accessor("potential", { id: "video", header: "Video", cell: ({ row }) => { const r = row.original; return (<div className="max-w-[330px]"><VideoCell v={r} />{(r.boostedNow || r.lastLogged) && <p className="mt-1 flex gap-1">{r.boostedNow && <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11.5px] text-good">Boost running now</span>}{r.lastLogged && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">You boosted it on {day(r.lastLogged)}</span>}</p>}</div>); } }),
    col.accessor("group", { id: "lane", header: "Group", enableSorting: false, cell: ({ row }) => <GroupPill group={row.original.group} /> }),
    col.accessor("potential", { id: "potential", header: "Potential", cell: ({ getValue }) => <PotentialBar value={getValue()} /> }),
    col.accessor("evidence", { id: "evidence", header: "Proof", enableSorting: false, cell: ({ getValue }) => <EvidenceDots level={getValue()} /> }),
    col.accessor("est", { id: "est", header: "Exploration (Est.)", enableSorting: false, cell: ({ getValue }) => <EstPill est={getValue()} /> }),
    col.accessor("rCost", { id: "spend", header: "Spend", meta: { num: true }, cell: ({ getValue }) => rm(getValue()) }),
    col.accessor("rOrders", { id: "orders", header: "Orders", meta: { num: true }, cell: ({ getValue }) => nfmt(getValue()) }),
    col.accessor("rRevenue", { id: "sales", header: "Sales", meta: { num: true }, cell: ({ row, getValue }) => (row.original.rRevenue > 0 || row.original.organicGmv <= 0 ? rm(getValue()) : <span className="text-ink-2" title="Sales without ads">{rm(row.original.organicGmv)}*</span>) }),
    col.accessor((r) => r.rRoi ?? -1, { id: "roi", header: "ROI", meta: { num: true }, cell: ({ row }) => { const r = row.original; return <span className={cn("font-semibold", r.rRoi != null && r.rRoi >= rules.minRoi ? "text-good" : "text-ink")} title={r.roi != null ? `All-time ROI ${roiFmt(r.roi)}` : undefined}>{roiFmt(r.rRoi)}{r.rRoi != null && r.rCost < 10 && <span className="block text-[11px] font-normal text-warn" title="Very little was spent, so this ROI may not hold when you spend more">tiny spend</span>}</span>; } }),
    col.accessor("testAmount", { id: "test", header: "Fair Test", meta: { num: true }, cell: ({ getValue, row }) => (GROUP[row.original.group].boost ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[12.5px] font-semibold text-brand-strong" title="A fair first budget a day: about 5 orders at its past cost per order, never below RM 5">RM {getValue()}</span> : <span className="text-ink-3">–</span>) }),
    col.accessor("daysSinceSpend", { id: "last", header: "Last Spend", meta: { num: true }, cell: ({ row }) => <span className="text-ink-2">{row.original.lastSpend ? day(row.original.lastSpend) : "Never"}</span> }),
  ], [picked, selectable, allOn, rules.minRoi]); // eslint-disable-line react-hooks/exhaustive-deps
  const table = useReactTable({ data: list, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: PAGE } }, autoResetPageIndex: true });
  useEffect(() => { table.setPageIndex(0); }, [view, table]);

  const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] text-ink focus:border-brand focus:outline-none";
  const planHref = `/ads?tab=planner&v=${encodeURIComponent(chosen.map((c) => c.key).join(","))}`;
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-5" data-testid="ads-picks">
      {/* ───── where to look ───── */}
      <section aria-label="Opportunities" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {LANES.map((l, i) => {
          const n = l.key === "best" ? counts.stopped + counts.gem + counts.underfed + counts.explore : counts[l.key as GroupKey];
          const on = view === l.key;
          return (
            <motion.button key={l.key} type="button" onClick={() => setView(l.key)} data-testid={`ads-group-${l.key}`} aria-pressed={on} title={l.key === "best" ? "The strongest videos from the four groups to the right" : GROUP[l.key as GroupKey].about}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              className={cn("flex flex-col items-start gap-1 rounded-2xl border bg-gradient-to-br p-4 text-left", l.tint, on ? cn("border-transparent ring-2", l.ring) : "border-line")}>
              <l.icon className="size-5 text-ink-2" />
              <span className="tnum text-[26px] leading-none font-semibold text-ink">{nfmt(n)}</span>
              <span className="text-[12.5px] font-medium text-ink-2">{l.label}</span>
            </motion.button>
          );
        })}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} whileHover={{ y: -2 }} className="sm:col-span-2 xl:col-span-1">
          <Link href="/ads?tab=rescue" data-testid="ads-group-rescue" title={GROUP.rescue.about} className="flex h-full flex-col items-start gap-1 rounded-2xl border border-critical/30 bg-gradient-to-br from-critical-soft to-surface p-4 text-left">
            <KeyRound className="size-5 text-critical" />
            <span className="tnum text-[26px] leading-none font-semibold text-ink">{nfmt(counts.rescue)}</span>
            <span className="text-[12.5px] font-medium text-ink-2">Authorization Rescue</span>
            {rescue.revenue > 0 && <span className="tnum text-[12px] text-critical">{rm(rescue.revenue)} sales locked</span>}
          </Link>
        </motion.div>
      </section>
      <section aria-label="Not for boosting" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[13px] font-medium text-ink-3">Do not boost</span>
        {GROUPS.filter((g) => !g.boost && g.key !== "rescue").map((g) => (
          <button key={g.key} type="button" onClick={() => setView(g.key)} data-testid={`ads-group-${g.key}`} aria-pressed={view === g.key} title={g.about}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium", view === g.key ? "border-brand/50 bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>{g.label}<span className="tnum text-ink-3">{nfmt(counts[g.key])}</span></button>
        ))}
      </section>

      {/* ───── the map ───── */}
      {list.length > 0 && (
        <motion.section key={view + "map"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-line bg-surface p-4" aria-label="Map of the videos">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-[15px] font-semibold text-ink">{view === "best" ? "Best Picks" : GROUP[view].label} <span className="font-normal text-ink-3">· {nfmt(total)} video{total === 1 ? "" : "s"}</span></h2>
            <p className="text-[12.5px] text-ink-3">{mode === "ads" ? "Top left is the golden corner: good ROI from little money. Click a bubble to pick it." : "Videos never used in ads. Top right sells and gets views on its own. Click a bubble to pick it."}</p>
          </div>
          <BoostMap rows={list} picked={new Set(picked.keys())} onToggle={toggle} mode={mode} />
        </motion.section>
      )}

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end" data-testid="ads-filters">
        <input type="hidden" name="tab" value="picks" /><input type="hidden" name="group" value={view} />{carry.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-[12.5px] font-medium text-ink-2">Good ROI Is At Least<input name="roi" type="number" min={1} step="0.5" defaultValue={rules.roiIsAuto ? "" : rules.minRoi} placeholder={`${autoRoi} (automatic)`} className={cn(input, "mt-1")} /></label>
        <label className="text-[12.5px] font-medium text-ink-2">Proven Means Orders ≥<input name="orders" type="number" min={1} defaultValue={rules.minOrders} className={cn(input, "mt-1")} /></label>
        <label className="text-[12.5px] font-medium text-ink-2">Stopped = No Spend For More Than (Days)<input name="idle" type="number" min={1} defaultValue={rules.idleDays} className={cn(input, "mt-1")} /></label>
        <label className="text-[12.5px] font-medium text-ink-2">Product<select name="product" defaultValue={product ?? ""} className={cn(input, "mt-1")}><option value="">All products</option>{products.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        <label className="text-[12.5px] font-medium text-ink-2">Creator Or Title<input name="q" defaultValue={q} placeholder="Search" className={cn(input, "mt-1")} /></label>
        <div className="flex gap-2"><button type="submit" className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong">Apply</button><Link href={`/ads?tab=picks${carry.map(([k, v]) => `&${k}=${v}`).join("")}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[14px] text-ink-2 hover:bg-surface-2">Reset</Link></div>
      </form>

      {/* ───── the table ───── */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Videos">
        <p className="px-5 pt-4 pb-3 text-[12.5px] text-ink-3" data-testid="ads-summary">{GROUP[view === "best" ? "stopped" : view].about && view !== "best" ? GROUP[view].about : "The strongest videos to boost, judged on all of their history."} Spend, orders, sales and ROI are for {rangeLabel}. Showing {nfmt(list.length)} of {nfmt(total)}. <span title="Sales marked * are the video's own sales without ads (Shop sync)">* sales without ads</span></p>
        {list.length === 0 ? <p className="px-5 pb-8 text-[14px] text-ink-3" data-testid="ads-empty">No video in this group with these rules.</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-[13.5px]" data-testid="ads-table">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-y border-line bg-surface-2/60">
                      {hg.headers.map((h) => {
                        const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num, can = h.column.getCanSort(), s = h.column.getIsSorted();
                        return (
                          <th key={h.id} className={cn("py-2.5 pr-3 text-[13px] font-medium text-ink-3", h.id === "pick" ? "w-10 px-4" : "", num ? "text-right" : "text-left")}>
                            {h.isPlaceholder ? null : can ? (
                              <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 hover:text-ink", num && "flex-row-reverse")}>{flexRender(h.column.columnDef.header, h.getContext())}{s === "asc" ? <ArrowUp className="size-3" /> : s === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}</button>
                            ) : flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {rows.map((row) => {
                      const on = picked.has(row.original.key);
                      return (
                        <motion.tr key={row.original.key} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} data-testid="ads-row" className={cn("border-b border-line", on ? "bg-brand-soft/60" : "hover:bg-surface-2/50")}>
                          {row.getVisibleCells().map((c) => {
                            const num = (c.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                            return <td key={c.id} className={cn("py-3 pr-3 align-top", c.column.id === "pick" ? "px-4" : "", num ? "tnum text-right" : "")}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>;
                          })}
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px] text-ink-3" data-testid="ads-pager">
                <span>Page {table.getState().pagination.pageIndex + 1} of {pageCount}</span>
                <span className="flex gap-1"><button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page" className="grid size-8 place-items-center rounded-lg border border-line-strong hover:bg-surface-2 disabled:opacity-40"><ChevronLeft className="size-4" /></button><button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page" className="grid size-8 place-items-center rounded-lg border border-line-strong hover:bg-surface-2 disabled:opacity-40"><ChevronRight className="size-4" /></button></span>
              </div>
            )}
          </>
        )}
      </section>

      {/* ───── the basket ───── */}
      <div className={cn("sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-pop", chosen.length ? "border-brand/40" : "border-line")} data-testid="ads-selection">
        <span className="text-[14px] font-medium text-ink">{chosen.length ? `${chosen.length} video${chosen.length === 1 ? "" : "s"} selected` : "Tick videos or click bubbles to build a boost batch"}</span>
        {chosen.length > 0 && <button type="button" onClick={() => setPicked(new Map())} className="text-[13px] text-ink-3 underline hover:text-ink">Clear</button>}
        {chosen.length >= MAX_BATCH && <span className="text-[12.5px] text-warn">Most videos one batch can hold</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPicked(new Map(list.filter(boostable).slice(0, 10).map((s) => [s.key, s])))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2" data-testid="ads-pick-top"><Sparkles className="size-4" />Pick Top 10</button>
          <button type="button" disabled={!chosen.length} onClick={() => { void navigator.clipboard?.writeText(chosen.map((s) => s.creativeId).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Video IDs"}</button>
          {chosen.length ? <Link href={planHref} data-testid="ads-open-planner" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-strong"><Rocket className="size-4" />Open Boost Studio</Link>
            : <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-4 text-[13.5px] font-medium text-brand-strong opacity-70"><CalendarCheck className="size-4" />Open Boost Studio</span>}
        </span>
      </div>
      <p className="sr-only"><StatusPill status={null} label={null} />{accountRoi}</p>
    </div>
  );
}
