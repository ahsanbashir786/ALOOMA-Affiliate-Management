"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, Clock, Hourglass, Info, Landmark, PackageOpen, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CashData, PendingData, PnlData } from "@/lib/finance/data";
import { Pill } from "@/components/ads/ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dd = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const ds = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; };
const money = (n: number, cur = "RM") => `${n < 0 ? "−" : ""}${cur === "MYR" ? "RM" : cur} ${Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : String(Math.round(n)));
const card = "overflow-hidden rounded-2xl border border-line bg-surface";

function Big({ icon: Icon, label, value, sub, tone, i, testId }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone: "good" | "brand" | "warn" | "critical"; i: number; testId?: string }) {
  const bg = { good: "from-good-soft", brand: "from-brand-soft", warn: "from-warn-soft", critical: "from-critical-soft" }[tone];
  const fg = { good: "text-good", brand: "text-brand", warn: "text-warn", critical: "text-critical" }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("rounded-2xl border border-line bg-gradient-to-br to-surface p-4", bg)} data-testid={testId}>
      <Icon className={cn("size-5", fg)} /><p className="tnum mt-1.5 text-[26px] leading-none font-semibold text-ink">{value}</p><p className="mt-1 text-[12.5px] font-medium text-ink-2">{label}</p>{sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </motion.div>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = { PAID: { label: "Paid", tone: "good" }, PROCESSING: { label: "On Its Way", tone: "brand" }, FAILED: { label: "Payment Failed", tone: "critical" } };

// ───────────────────────────── Money Released ─────────────────────────────
export function CashBoard({ d, rangeLabel }: { d: CashData; rangeLabel: string }) {
  const [all, setAll] = useState(false);
  const list = all ? d.statements : d.statements.slice(0, 31);
  return (
    <div className="space-y-5" data-testid="fin-cash">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Money">
        <Big i={0} icon={Banknote} tone="good" label="Paid To You" value={money(d.paidOut)} sub={`${d.paidCount} payment${d.paidCount === 1 ? "" : "s"} in ${rangeLabel}`} testId="fin-paid" />
        <Big i={1} icon={Landmark} tone="brand" label="Settled By TikTok" value={money(d.settled)} sub={`${d.settledCount} daily statement${d.settledCount === 1 ? "" : "s"}`} />
        <Big i={2} icon={Clock} tone="warn" label="On Its Way" value={money(d.onItsWay)} sub={d.onItsWayCount ? `${d.onItsWayCount} statement${d.onItsWayCount === 1 ? "" : "s"} being paid` : "nothing waiting"} testId="fin-onway" />
        <Big i={3} icon={Hourglass} tone="brand" label="Not Settled Yet" value={money(d.unpaid)} sub={`${d.unpaidCount.toLocaleString("en-MY")} orders (TikTok's estimate)`} />
      </section>
      {d.failedCount > 0 && <p className="flex items-center gap-2 rounded-2xl border border-critical/30 bg-critical-soft px-4 py-2.5 text-[14px] font-medium text-critical" data-testid="fin-failed"><AlertTriangle className="size-4" />{d.failedCount} payment{d.failedCount === 1 ? "" : "s"} failed ({money(d.failed)}). Check your bank details in TikTok Seller Center.</p>}
      <section className={cn(card, "p-5")} aria-label="Settlement by day">
        <h2 className="mb-1 text-[16px] font-semibold text-ink">What TikTok Settled Each Day</h2>
        <p className="mb-3 text-[12.5px] text-ink-3">Each bar is one daily statement. Green is already in your bank, blue is on its way.</p>
        {d.series.length === 0 ? <p className="py-10 text-center text-[14px] text-ink-3">No statements in these dates.</p> : (
          <div className="h-[260px]" role="img" aria-label="Settlement by day, by payment status" data-testid="fin-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.series} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tickFormatter={ds} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v, n) => [money(Number(v)), n === "paid" ? "Paid" : n === "processing" ? "On its way" : "Failed"]} labelFormatter={(l) => dd(String(l))} cursor={{ fill: "var(--surface-2)" }} />
                <Bar dataKey="paid" stackId="a" fill="var(--good)" fillOpacity={0.85} /><Bar dataKey="processing" stackId="a" fill="var(--brand)" fillOpacity={0.8} /><Bar dataKey="failed" stackId="a" fill="var(--critical)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section className={card} aria-label="Statements">
        <h2 className="px-5 pt-4 pb-3 text-[16px] font-semibold text-ink">Daily Statements <span className="text-[13px] font-normal text-ink-3">· {d.statements.length}</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]" data-testid="fin-statements">
            <thead><tr className="border-y border-line bg-surface-2/60 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase"><th className="py-2.5 pl-5">Day</th><th className="py-2.5 text-right">Revenue</th><th className="py-2.5 text-right">Fees</th><th className="py-2.5 text-right">Adjustments</th><th className="py-2.5 text-right">Settlement</th><th className="py-2.5 pl-4">Status</th><th className="py-2.5">Paid On</th><th className="py-2.5 pr-5 text-right">Payment ID</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-line" data-testid="fin-statement-row">
                  <td className="py-2.5 pl-5 font-medium text-ink">{dd(s.day)}</td>
                  <td className="tnum py-2.5 text-right text-ink-2">{money(s.revenue)}</td><td className="tnum py-2.5 text-right text-ink-2">{money(s.fees)}</td><td className="tnum py-2.5 text-right text-ink-2">{s.adjustment ? money(s.adjustment) : "–"}</td>
                  <td className="tnum py-2.5 text-right font-semibold text-ink">{money(s.settlement)}</td>
                  <td className="py-2.5 pl-4"><Pill tone={STATUS[s.status ?? ""]?.tone ?? "muted"}>{STATUS[s.status ?? ""]?.label ?? s.status ?? "Unknown"}</Pill></td>
                  <td className="py-2.5 text-ink-2">{s.paidOn ? dd(s.paidOn) : "–"}</td><td className="py-2.5 pr-5 text-right font-mono text-[12px] text-ink-3">{s.paymentId ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.statements.length > list.length && <div className="border-t border-line px-5 py-2.5"><button type="button" onClick={() => setAll(true)} className="text-[13.5px] font-medium text-brand hover:underline">Show all {d.statements.length}</button></div>}
      </section>
      <p className="flex items-start gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />TikTok&apos;s &quot;Get Payments&quot; is not available in Malaysia, so payments are read from the daily statements (their payment status and payment time). A statement closes at 00:00 UTC, which is 08:00 in Malaysia.</p>
    </div>
  );
}

// ───────────────────────────── Profit and Loss ─────────────────────────────
type Step = { name: string; start: number; end: number; kind: "total" | "up" | "down" };

function waterfall(p: PnlData): Step[] {
  const steps: Step[] = [];
  let run = 0;
  const total = (name: string, value: number) => { steps.push({ name, start: 0, end: value, kind: "total" }); run = value; };
  const delta = (name: string, v: number) => { if (v === 0) return; const s = run; run += v; steps.push({ name, start: s, end: run, kind: v >= 0 ? "up" : "down" }); };
  total("Sales", p.sales);
  delta("Discounts", p.sellerDiscounts); delta("Refunds", p.refunds);
  total("Revenue", p.revenue);
  delta("Fees", p.feesTotal); delta("Shipping", p.shipping); delta("Adjust.", p.adjustments);
  total("Settlement", p.settlement);
  delta("Ads", -p.adSpendCounted);
  total("Profit*", p.profitBeforeCost);
  return steps;
}


function Row({ label, amount, bold, child, note, tone, pct }: { label: string; amount: number; bold?: boolean; child?: boolean; note?: string; tone?: "good" | "bad"; pct: (n: number) => string }) {
  return (
    <tr className={cn("border-b border-line", bold && "bg-surface-2/60")}>
      <td className={cn("py-2.5 pr-3", child ? "pl-10 text-ink-2" : "pl-5", bold && "font-semibold text-ink")}>{label}{note && <span className="ml-2 text-[12px] font-normal text-ink-3">{note}</span>}</td>
      <td className={cn("tnum py-2.5 pr-3 text-right", bold ? "font-semibold text-ink" : "text-ink-2", tone === "good" && "text-good", tone === "bad" && "text-critical")}>{money(amount)}</td>
      <td className="tnum w-20 py-2.5 pr-5 text-right text-[12.5px] text-ink-3">{pct(amount)}</td>
    </tr>
  );
}

export function PnlBoard({ p, rangeLabel }: { p: PnlData; rangeLabel: string }) {
  const path = usePathname(), params = useSearchParams();
  const adsHref = (v: "in" | "out" | "") => { const q = new URLSearchParams(params.toString()); q.set("tab", "pnl"); if (v) q.set("ads", v); else q.delete("ads"); return `${path}?${q.toString()}`; };
  const steps = waterfall(p);
  const data = steps.map((s) => ({ name: s.name, base: Math.min(s.start, s.end), size: Math.abs(s.end - s.start), kind: s.kind, value: s.kind === "total" ? s.end : s.end - s.start }));
  const pct = (n: number) => (p.revenue ? `${((Math.abs(n) / Math.abs(p.revenue)) * 100).toFixed(1)}%` : "");
  const adLabel = p.adMode === "in" || p.adMode === "auto-in" ? "Counted" : "Not counted";
  return (
    <div className="space-y-5" data-testid="fin-pnl">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
        <Big i={0} icon={ArrowUpRight} tone="brand" label="Revenue" value={money(p.revenue)} sub={`${p.orders.toLocaleString("en-MY")} orders settled · ${rangeLabel}`} />
        <Big i={1} icon={ArrowDownRight} tone="critical" label="TikTok Fees, Shipping, Adjustments" value={money(p.feesTotal + p.shipping + p.adjustments)} sub={pct(p.feesTotal + p.shipping + p.adjustments) + " of revenue"} />
        <Big i={2} icon={Banknote} tone="good" label="Settlement (TikTok Pays You)" value={money(p.settlement)} testId="fin-settlement" />
        <Big i={3} icon={Scale} tone={p.profitBeforeCost >= 0 ? "good" : "critical"} label="Profit Before Product Cost" value={money(p.profitBeforeCost)} sub={`after ${money(p.adSpendCounted)} ad spend`} testId="fin-profit" />
      </section>
      <section className={cn(card, "p-5")} aria-label="Waterfall">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">From Sales To Profit</h2>
        <div className="h-[280px]" role="img" aria-label="From sales to profit" data-testid="fin-waterfall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} interval={0} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={46} />
              <Tooltip formatter={(_, __, item) => [money((item.payload as { value: number }).value), (item.payload as { name: string }).name]} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="size" stackId="w" radius={[6, 6, 6, 6]} animationDuration={700}>{data.map((x, i) => <Cell key={i} fill={x.kind === "total" ? "var(--brand)" : x.kind === "up" ? "var(--good)" : "var(--critical)"} fillOpacity={x.kind === "total" ? 0.85 : 0.8} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">* Before the cost of the products you sell (not set up yet).</p>
      </section>
      <section className={card} aria-label="Statement of profit and loss">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3"><h2 className="text-[16px] font-semibold text-ink">Profit And Loss · {rangeLabel}</h2>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium", Math.abs(p.gap) < 0.05 ? "bg-good-soft text-good" : "bg-warn-soft text-warn")} data-testid="fin-reconcile" title={`TikTok's own settlement total for these statements: ${money(p.statementTotal)}`}>
            {Math.abs(p.gap) < 0.05 ? <><CheckCircle2 className="size-3.5" />Adds up to TikTok&apos;s settlement</> : <><AlertTriangle className="size-3.5" />A line is missing: {money(p.gap)}</>}
          </span>
        </div>
        <table className="w-full border-collapse text-[13.5px]"><tbody>
          <Row label="Sales Before Discounts" amount={p.sales} pct={pct} /><Row label="Seller Discounts" amount={p.sellerDiscounts} child pct={pct} /><Row label="Refunds" amount={p.refunds} child pct={pct} />
          <Row label="Revenue (As TikTok Counts It)" amount={p.revenue} bold pct={pct} />
          {p.fees.filter((f) => f.amount !== 0).map((f) => <Row key={f.key} label={f.label} amount={f.amount} child note={f.key === "gmv" ? "taken by TikTok at settlement" : undefined} pct={pct} />)}
          <Row label="TikTok Fees And Taxes" amount={p.feesTotal} bold pct={pct} />
          <Row label="Shipping" amount={p.shipping} pct={pct} /><Row label="Adjustments And Penalties" amount={p.adjustments} pct={pct} />
          <Row label="Settlement: What TikTok Pays You" amount={p.settlement} bold tone="good" pct={pct} />
          <tr className="border-b border-line"><td className="py-2.5 pr-3 pl-5">GMV Max Ad Spend (From Ads Manager)<span className="ml-2 text-[12px] text-ink-3">{adLabel}</span></td><td className="tnum py-2.5 pr-3 text-right text-ink-2">{money(-p.adSpend)}</td><td className="w-20 py-2.5 pr-5 text-right text-[12.5px] text-ink-3">{pct(p.adSpend)}</td></tr>
          <Row label="Profit Before Product Cost" amount={p.profitBeforeCost} bold tone={p.profitBeforeCost >= 0 ? "good" : "bad"} pct={pct} />
          <tr className="border-b border-line text-ink-3"><td className="py-2.5 pr-3 pl-5">Cost Of Products Sold</td><td className="py-2.5 pr-3 text-right" colSpan={2}><span className="inline-flex items-center gap-1 pr-5"><PackageOpen className="size-3.5" />Not set up yet</span></td></tr>
        </tbody></table>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3" data-testid="fin-ads-switch">
          <span className="text-[12.5px] font-medium text-ink-2">Ad spend in the profit:</span>
          {([["", "Automatic"], ["in", "Count It"], ["out", "Do Not Count"]] as const).map(([v, l]) => {
            const on = (v === "" && (p.adMode === "auto-in" || p.adMode === "auto-out")) || p.adMode === v;
            return <Link key={v} href={adsHref(v)} scroll={false} aria-current={on ? "true" : undefined} className={cn("rounded-full px-3 py-1 text-[12.5px] font-medium", on ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:bg-brand-soft")}>{l}</Link>;
          })}
          <span className="text-[12px] text-ink-3">{p.gmvMaxFeeInSettlement !== 0 ? `TikTok already took ${money(Math.abs(p.gmvMaxFeeInSettlement))} of GMV Max fees inside the settlement, so Automatic does not count the Ads Manager spend again.` : "TikTok took no GMV Max fee in these statements, so Automatic counts the Ads Manager spend."}</span>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────── Not paid yet ─────────────────────────────
export function PendingBoard({ d }: { d: PendingData }) {
  const max = Math.max(1, ...d.buckets.map((b) => b.amount));
  return (
    <div className="space-y-5" data-testid="fin-pending">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Totals">
        <Big i={0} icon={Hourglass} tone="brand" label="Coming To You (Estimate)" value={money(d.total)} testId="fin-unpaid" />
        <Big i={1} icon={PackageOpen} tone="warn" label="Orders Not Paid Yet" value={d.count.toLocaleString("en-MY")} />
        <Big i={2} icon={Landmark} tone="good" label="Their Revenue" value={money(d.revenue)} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cn(card, "p-5")} aria-label="Age"><h2 className="mb-3 text-[16px] font-semibold text-ink">How Long Orders Have Waited</h2>
          <ul className="space-y-3">{d.buckets.map((b) => <li key={b.label}><div className="flex justify-between text-[13px]"><span className="font-medium text-ink-2">{b.label}</span><span className="tnum text-ink">{money(b.amount)} <span className="text-ink-3">· {b.count}</span></span></div><div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"><motion.span initial={{ width: 0 }} animate={{ width: `${(b.amount / max) * 100}%` }} className="block h-full rounded-full bg-brand/70" /></div></li>)}</ul>
        </section>
        <section className={cn(card, "p-5")} aria-label="Reasons"><h2 className="mb-3 text-[16px] font-semibold text-ink">Why They Are Not Paid Yet</h2>
          {d.reasons.length === 0 ? <p className="text-[14px] text-ink-3">TikTok gave no reasons.</p> : <ul className="space-y-2">{d.reasons.map((r) => <li key={r.reason} className="flex items-start justify-between gap-3 text-[13px]"><span className="text-ink-2">{r.reason}</span><span className="tnum shrink-0 text-ink">{money(r.amount)} <span className="text-ink-3">· {r.count}</span></span></li>)}</ul>}
        </section>
      </div>
      <section className={card} aria-label="Orders">
        <h2 className="px-5 pt-4 pb-3 text-[16px] font-semibold text-ink">Oldest First <span className="text-[13px] font-normal text-ink-3">· {d.rows.length} of {d.count.toLocaleString("en-MY")}</span></h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-[13.5px]" data-testid="fin-unpaid-table">
          <thead><tr className="border-y border-line bg-surface-2/60 text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase"><th className="py-2.5 pl-5">Order</th><th className="py-2.5">Ordered</th><th className="py-2.5">Delivered</th><th className="py-2.5 text-right">Waiting</th><th className="py-2.5 pl-4">Reason</th><th className="py-2.5 pr-5 text-right">Estimate</th></tr></thead>
          <tbody>{d.rows.map((r) => <tr key={r.id} className="border-b border-line" data-testid="fin-unpaid-row"><td className="py-2.5 pl-5 font-mono text-[12px] text-ink-2">{r.orderId ?? r.id}{r.type && r.type !== "ORDER" ? <span className="ml-2 text-ink-3">{r.type.toLowerCase()}</span> : null}</td><td className="py-2.5 text-ink-2">{r.createdOn ? dd(r.createdOn) : "–"}</td><td className="py-2.5 text-ink-2">{r.deliveredOn ? dd(r.deliveredOn) : "–"}</td><td className="tnum py-2.5 text-right text-ink-2">{r.ageDays != null ? `${r.ageDays} d` : "–"}</td><td className="max-w-[300px] truncate py-2.5 pl-4 text-ink-2" title={r.reason ?? undefined}>{r.reason ?? "–"}</td><td className="tnum py-2.5 pr-5 text-right font-medium text-ink">{money(r.estimate)}</td></tr>)}</tbody>
        </table></div>
      </section>
      <p className="flex items-start gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />These are TikTok&apos;s estimates and can change before the order is settled. The final amount is on the daily statement.</p>
    </div>
  );
}
