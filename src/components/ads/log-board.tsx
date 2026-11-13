"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, ClipboardList, Clock, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogBatch } from "@/lib/ads/insights";
import { LOG_WINDOW } from "@/lib/range";
import { LogDelete } from "./log-delete";
import { VideoCell, day, nfmt, rm, rm2, roiFmt } from "./ui";

const V = {
  better: { label: "Sales Went Up", tone: "text-good", bg: "bg-good-soft", edge: "bg-good", icon: TrendingUp },
  same: { label: "About The Same", tone: "text-ink-2", bg: "bg-surface-2", edge: "bg-line-strong", icon: Minus },
  worse: { label: "Sales Went Down", tone: "text-critical", bg: "bg-critical-soft", edge: "bg-critical", icon: TrendingDown },
  early: { label: "Too Early", tone: "text-brand-strong", bg: "bg-brand-soft", edge: "bg-brand", icon: Clock },
} as const;

/** Boost Log as a timeline: each batch with a before and after chart, a verdict, and a scoreboard on top. */
export function LogBoard({ batches, saved, rangeLabel }: { batches: LogBatch[]; saved: boolean; rangeLabel: string }) {
  const stats = useMemo(() => {
    const done = batches.filter((b) => b.verdict !== "early");
    const up = done.filter((b) => b.verdict === "better").length;
    const spend = batches.reduce((a, b) => a + b.after.cost, 0), sales = batches.reduce((a, b) => a + b.after.revenue, 0);
    return { total: batches.length, up, done: done.length, rate: done.length ? Math.round((up / done.length) * 100) : null, spend, sales, roi: spend > 0 ? sales / spend : null };
  }, [batches]);
  if (!batches.length)
    return (
      <div className="grid place-items-center rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-20 text-center" data-testid="ads-empty-state">
        <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand"><ClipboardList className="size-8" /></span>
        <h2 className="mt-4 text-[20px] font-semibold text-ink">{rangeLabel === "Lifetime" ? "No Boosts Logged Yet" : "No Boosts In These Dates"}</h2>
        <Link href="/ads?tab=picks" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:bg-brand-strong">Open Boost Picks</Link>
      </div>
    );
  return (
    <div className="space-y-5" data-testid="ads-log">
      {saved && <p className="bx-pop flex items-center gap-2 rounded-2xl border border-good/30 bg-good-soft px-4 py-2.5 text-[14px] font-medium text-good" data-testid="ads-log-saved"><CheckCircle2 className="size-4" />Saved</p>}
      <section className="tile-grid" aria-label="Scoreboard" data-testid="ads-log-score">
        {[
          ["Boosts Logged", nfmt(stats.total), "", ClipboardList], ["Hit Rate", stats.rate == null ? "–" : `${stats.rate}%`, stats.done ? `${stats.up} of ${stats.done} raised sales` : "waiting for results", TrendingUp],
          ["Sales After Boosts", rm(stats.sales), `from ${rm(stats.spend)} spent`, TrendingUp], ["ROI After Boosts", roiFmt(stats.roi), "", TrendingUp],
        ].map(([l, v, sub, I], i) => { const Icon = I as typeof TrendingUp; return (
          <motion.div key={String(l)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-line bg-gradient-to-br from-brand-soft to-surface p-4"><Icon className="size-5 text-brand" /><p className="tnum mt-1 text-[26px] leading-none font-semibold text-ink">{String(v)}</p><p className="mt-1 text-[12.5px] font-medium text-ink-2">{String(l)}</p>{sub && <p className="text-[12px] text-ink-3">{String(sub)}</p>}</motion.div>); })}
      </section>
      <ol className="relative space-y-4 border-l-2 border-line pl-5">
        {batches.map((b, i) => {
          const v = V[b.verdict], Icon = v.icon;
          const pd = (k: { revenue: number }, d: number) => (d > 0 ? k.revenue / d : 0);
          const data = [{ name: `Before (${LOG_WINDOW}d)`, sales: Math.round(pd(b.before, LOG_WINDOW)) }, { name: `After (${b.afterDays || 0}d)`, sales: Math.round(pd(b.after, b.afterDays)) }];
          return (
            <motion.li key={b.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.3, i * 0.05) }} className="relative" data-testid="ads-log-batch">
              <span className={cn("absolute top-5 -left-[31px] grid size-5 place-items-center rounded-full ring-4 ring-bg", v.edge)}><Icon className="size-3 text-white" /></span>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold text-ink">{day(b.boostedOn)}</h2>
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", v.bg, v.tone)} data-testid="ads-log-verdict"><Icon className="size-3.5" />{v.label}</span>
                      <span className="ml-auto"><LogDelete id={b.id} /></span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-3">{b.videos.length} video{b.videos.length === 1 ? "" : "s"} · {rm2(b.totalBudget)} a day{b.days > 1 ? ` · ${b.days} days` : ""}{b.note ? ` · ${b.note}` : ""}{b.createdBy ? ` · ${b.createdBy}` : ""}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {[["Sales A Day", `${rm(pd(b.before, LOG_WINDOW))} → ${b.afterDays ? rm(pd(b.after, b.afterDays)) : "–"}`], ["ROI", `${roiFmt(b.before.roi)} → ${roiFmt(b.after.roi)}`], ["Orders", `${nfmt(b.before.orders)} → ${nfmt(b.after.orders)}`]].map(([l, x]) => <div key={l} className="rounded-xl bg-surface-2 px-2 py-2"><p className="tnum text-[13.5px] font-semibold text-ink">{x}</p><p className="text-[11.5px] text-ink-3">{l}</p></div>)}
                    </div>
                  </div>
                  <div className="h-[130px]" role="img" aria-label="Sales a day before and after the boost">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={44} />
                        <Tooltip formatter={(x) => [`RM ${x}`, "Sales a day"]} cursor={{ fill: "var(--surface-2)" }} />
                        <Bar dataKey="sales" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={700}>{data.map((_, k) => <Cell key={k} fill={k === 0 ? "var(--ink-3)" : b.verdict === "worse" ? "var(--critical)" : "var(--good)"} fillOpacity={k === 0 ? 0.5 : 0.9} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-4 py-2.5 text-[13.5px] font-medium text-brand hover:underline">Show Each Video</summary>
                  <ul className="divide-y divide-line px-4 pb-2">
                    {b.videos.map((x) => <li key={x.creativeId + x.productId} className="flex flex-wrap items-center gap-3 py-2"><span className="min-w-0 flex-1 basis-64"><VideoCell v={{ ...x, postedOn: null }} /></span><span className="tnum w-24 text-right text-[12.5px] text-ink-3">{x.budget > 0 ? rm2(x.budget) : "Shared"}</span><span className="tnum w-40 text-right text-[13px] text-ink-2">{rm(x.before.revenue)} → <b className="text-ink">{rm(x.after.revenue)}</b></span><span className="tnum w-24 text-right text-[13px] font-semibold text-ink">{roiFmt(x.before.roi)} → {roiFmt(x.after.roi)}</span></li>)}
                  </ul>
                </details>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
