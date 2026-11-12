import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarDays, Download, Handshake, PackageCheck, Receipt, Search, Settings2, TrendingUp, Truck, Wallet } from "lucide-react";
import { gate } from "@/lib/gate";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Td, Th, buttonClasses } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { TabLinks } from "@/components/ui/tab-links";
import { Pagination } from "@/components/ui/pagination";
import { PeriodBar } from "@/components/profit/period-bar";
import { ClaimsTable } from "@/components/profit/claims-board";
import { FulfilmentCard } from "@/components/profit/fulfilment-card";
import { MonthlyChart } from "@/components/profit/monthly-chart";
import { loadProfit, totalsOf, type OrderProfit, type ProfitData } from "@/lib/profit/data";
import { loadClaims, titleCase } from "@/lib/profit/claims";
import { monthlyRows, sumMonths } from "@/lib/profit/monthly";
import { inPeriod, resolvePeriod, type Period } from "@/lib/profit/period";
import { MONEY_STATE, rm, tone } from "@/lib/profit/format";
import { todayKL } from "@/lib/time";
import { fmtInt } from "@/lib/utils";
import { href, one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "Profit And Loss" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "orders", label: "Order Profit", icon: Receipt },
  { key: "monthly", label: "Monthly Profit And Loss", icon: CalendarDays },
  { key: "claims", label: "Claim Back", icon: Handshake },
  { key: "costs", label: "Fulfilment Cost", icon: Settings2 },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE = 50;

export default async function ProfitPage({ searchParams }: PageProps<"/profit">) {
  const { denied } = await gate("profit", "Profit And Loss");
  if (denied) return denied;
  const sp = (await searchParams) as SP;
  const tab: Tab = TABS.some((t) => t.key === one(sp.tab)) ? (one(sp.tab) as Tab) : "orders";
  const data = await loadProfit();
  // The monthly view starts with every month; the order list starts with the current month.
  const period = resolvePeriod(one(sp.range) ?? (tab === "monthly" && !one(sp.from) && !one(sp.to) ? "all" : undefined), one(sp.from), one(sp.to));
  const keep = { range: one(sp.range), from: one(sp.from), to: one(sp.to) };

  return (
    <div className="space-y-5">
      <PageHeader title="Profit And Loss" description="What TikTok paid on every order, what the pieces cost, and what is left. Orders are counted in the month they were sold." />
      <TabLinks label="Profit sections" items={TABS.map((t) => ({ href: href("/profit", { tab: t.key === "orders" ? undefined : t.key, ...(t.key === "orders" || t.key === "monthly" ? keep : {}) }), label: t.label, icon: t.icon, active: tab === t.key, testId: `profit-tab-${t.key}` }))} />
      {data.rows.length === 0 && tab !== "costs" ? (
        <Card><EmptyState icon={<Banknote className="size-5" />} title="No TikTok orders yet" description="Run a sync in Data Sync so the orders and TikTok's finance records are here." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      ) : tab === "orders" ? <Orders data={data} period={period} sp={sp} />
      : tab === "monthly" ? <Monthly data={data} period={period} />
      : tab === "claims" ? <Claims />
      : <Costs data={data} />}
    </div>
  );
}

function Bar({ period }: { period: Period }) {
  return <PeriodBar active={period.key} from={period.from ?? ""} to={period.to ?? ""} today={todayKL()} />;
}

function adSpendIn(data: ProfitData, period: Period): number {
  let s = 0;
  for (const [d, v] of data.adSpendDays) if (inPeriod(d, period)) s += v;
  return s;
}

function Orders({ data, period, sp }: { data: ProfitData; period: Period; sp: SP }) {
  const inRange = data.rows.filter((r) => inPeriod(r.day, period));
  const t = totalsOf(inRange);
  const adSpend = adSpendIn(data, period);
  const net = t.profitBeforeAds - adSpend;
  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const money = one(sp.money) ?? "";
  const problem = one(sp.problem) ?? "";
  const sort = one(sp.sort) ?? "date";
  let rows = inRange.filter((r) =>
    (!q || r.orderId.toLowerCase().includes(q) || r.skus.toLowerCase().includes(q)) &&
    (!money || r.money === money) &&
    (!problem || (problem === "cost" ? r.flags.noCost > 0 || r.flags.short > 0 : problem === "loss" ? (r.profitBeforeAds ?? 0) < 0 : problem === "deduction" ? r.deduction < 0 : problem === "return" ? r.returnedPieces > 0 : true)));
  if (sort === "low") rows = rows.slice().sort((a, b) => (a.profitBeforeAds ?? Infinity) - (b.profitBeforeAds ?? Infinity));
  else if (sort === "high") rows = rows.slice().sort((a, b) => (b.profitBeforeAds ?? -Infinity) - (a.profitBeforeAds ?? -Infinity));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const exportHref = href("/api/profit/export", { range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const base = { tab: undefined, range: one(sp.range), from: one(sp.from), to: one(sp.to), q: one(sp.q), money: one(sp.money), problem: one(sp.problem), sort: one(sp.sort) };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2"><Bar period={period} /><a href={exportHref} className={buttonClasses({ variant: "secondary" })} data-testid="export-orders"><Download className="size-4" />Download Excel</a></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" data-testid="profit-tiles">
        <StatTile icon={Receipt} label="Orders" value={fmtInt(t.orders)} note={`${fmtInt(t.pieces)} pieces${t.samples ? ` · ${t.samples} samples` : ""}`} tone="neutral" />
        <StatTile icon={Wallet} label="Money From TikTok" value={rm(t.settlement, 0)} note={t.estimated ? `${t.estimated} ${t.estimated === 1 ? "order is" : "orders are"} still an estimate` : "All settled"} />
        <StatTile icon={PackageCheck} label="Product Cost" value={rm(t.cost, 0)} note="First In, First Out" tone="neutral" />
        <StatTile icon={Truck} label="Fulfilment" value={rm(t.fulfilment, 0)} note="Packing and sending" tone="neutral" />
        <StatTile icon={TrendingUp} label="Profit Before Ads" value={<span className={tone(t.profitBeforeAds)}>{rm(t.profitBeforeAds, 0)}</span>} note={`Real ad spend ${rm(adSpend, 0)}`} tone="good" />
        <StatTile icon={Banknote} label="Net Profit" value={<span className={tone(net)}>{rm(net, 0)}</span>} note={t.sales > 0 ? `${((net / t.sales) * 100).toFixed(1)}% of sales` : undefined} tone={net < 0 ? "critical" : "good"} />
      </div>
      {(t.noMoney > 0 || t.noCost > 0) && (
        <Card className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-warn-soft px-4 py-3 text-[13.5px]" data-testid="profit-warnings">
          <AlertTriangle className="size-4 text-warn" />
          {t.noMoney > 0 && <span><b>{t.noMoney}</b> {t.noMoney === 1 ? "order has" : "orders have"} no money data from TikTok yet. {t.noMoney === 1 ? "It is" : "They are"} not counted in the totals.</span>}
          {t.noCost > 0 && <span><b>{fmtInt(t.noCost)}</b> pieces have no cost because their SKU is not in the stock list (see Stock And Costing).</span>}
        </Card>
      )}
      <Card>
        <CardHeader title="Orders" description="Money TikTok takes away is shown as a negative number. Profit is before ads: the real ad spend is taken off in the Net Profit box." action={
          <form action="/profit" className="flex flex-wrap items-center gap-2">
            {(["range", "from", "to"] as const).map((k) => one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null)}
            <div className="relative"><Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-3" /><input name="q" defaultValue={one(sp.q)} placeholder="Order ID or SKU" className="h-9 w-48 rounded-md border border-line-strong bg-surface pl-8 text-[14px] placeholder:text-ink-3 focus:border-brand" /></div>
            <select name="money" defaultValue={money} className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[14px]"><option value="">All Money States</option>{Object.entries(MONEY_STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <select name="problem" defaultValue={problem} className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[14px]"><option value="">All Orders</option><option value="loss">Losing Money</option><option value="cost">Cost Problems</option><option value="deduction">Has A Deduction</option><option value="return">Returned</option></select>
            <select name="sort" defaultValue={sort} className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[14px]"><option value="date">Newest First</option><option value="low">Lowest Profit First</option><option value="high">Highest Profit First</option></select>
            <button className={buttonClasses({ variant: "secondary" })}>Filter</button>
          </form>
        } />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse" data-testid="profit-table">
            <thead><tr><Th>Order</Th><Th>Money</Th><Th align="right">Sales</Th><Th align="right">TikTok Fees</Th><Th align="right">Shipping Deducted</Th><Th align="right">Adjustments</Th><Th align="right">Settlement</Th><Th align="right">Ads Top-Up</Th><Th align="right">Product Cost</Th><Th align="right">Fulfilment</Th><Th align="right">Profit Before Ads</Th></tr></thead>
            <tbody>
              {shown.map((r) => <OrderRow key={r.orderId} r={r} />)}
              {!shown.length && <tr><td colSpan={11}><EmptyState title="No orders match" description="Try another period or filter." /></td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} pageSize={PAGE} hrefFor={(p) => href("/profit", { ...base, page: p })} />
      </Card>
    </>
  );
}

function OrderRow({ r }: { r: OrderProfit }) {
  const ms = MONEY_STATE[r.money];
  const none = r.money === "none" && !r.isSample;
  return (
    <tr className="hover:bg-surface-2/60" data-testid="order-row">
      <Td className="min-w-52">
        <Link href={`/profit/order/${encodeURIComponent(r.orderId)}`} className="font-medium text-brand hover:underline">{r.orderId}</Link>
        {r.isSample && <Badge className="ml-1.5">Sample</Badge>}{r.returnedPieces > 0 && <Badge tone="warn" className="ml-1.5">Returned</Badge>}
        <span className="block max-w-64 truncate text-[12px] text-ink-3">{r.day} · {r.skus}</span>
      </Td>
      <Td>{r.isSample && r.money === "none" ? <Badge>No Sale</Badge> : <Badge tone={ms.tone}>{ms.label}</Badge>}</Td>
      <Td align="right">{none ? "–" : rm(r.sales)}</Td>
      <Td align="right">{none ? "–" : rm(r.commission + r.affiliate + r.otherFees)}</Td>
      <Td align="right">{none ? "–" : rm(r.shipping)}</Td>
      <Td align="right" className={r.reimbursement + r.deduction !== 0 ? "" : "text-ink-3"}>{none ? "–" : rm(r.reimbursement + r.deduction)}</Td>
      <Td align="right" className="font-medium">{none ? "–" : rm(r.settlement)}</Td>
      <Td align="right" className="text-ink-3">{none ? "–" : rm(r.adFee)}</Td>
      <Td align="right">{rm(r.cost)}{(r.flags.noCost > 0 || r.flags.short > 0) && <Badge tone="warn" className="ml-1">{r.flags.noCost ? "No Cost" : "No Stock"}</Badge>}</Td>
      <Td align="right">{rm(r.fulfilment)}</Td>
      <Td align="right" className={`font-semibold ${tone(r.profitBeforeAds)}`}>{rm(r.profitBeforeAds)}</Td>
    </tr>
  );
}

function Monthly({ data, period }: { data: ProfitData; period: Period }) {
  const all = monthlyRows(data);
  const shownRows = all.filter((m) => (!period.from || m.month >= period.from.slice(0, 7)) && (!period.to || m.month <= period.to.slice(0, 7)));
  const total = sumMonths(shownRows);
  const chart = shownRows.slice().reverse().map((m) => ({ month: m.month, net: m.net }));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[13.5px] text-ink-2">Every month, newest first. Choose a period to look at fewer months.</p><Bar period={period} /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="monthly-tiles">
        <StatTile icon={Receipt} label="Sales" value={rm(total.sales, 0)} note={`${fmtInt(total.orders)} orders`} tone="neutral" />
        <StatTile icon={PackageCheck} label="Product Cost And Fulfilment" value={rm(total.cost + total.fulfilment, 0)} tone="neutral" />
        <StatTile icon={TrendingUp} label="Real Ad Spend" value={rm(total.adSpend, 0)} tone="warn" />
        <StatTile icon={Banknote} label="Net Profit" value={<span className={tone(total.net)}>{rm(total.net, 0)}</span>} note={total.margin != null ? `${(total.margin * 100).toFixed(1)}% of sales` : undefined} tone={total.net < 0 ? "critical" : "good"} />
      </div>
      <Card><CardHeader title="Net Profit By Month" description="After product cost, fulfilment and the real ad spend." /><MonthlyChart data={chart} /></Card>
      <Card>
        <CardHeader title="Monthly Profit And Loss" description="Months with unpaid orders use TikTok's estimate, shown in the Estimate column. Those numbers become exact when TikTok pays." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse" data-testid="monthly-table">
            <thead><tr><Th>Month</Th><Th align="right">Orders</Th><Th align="right">Sales</Th><Th align="right">TikTok Fees</Th><Th align="right">Shipping Deducted</Th><Th align="right">Adjustments</Th><Th align="right">Product Cost</Th><Th align="right">Fulfilment</Th><Th align="right">Real Ad Spend</Th><Th align="right">Net Profit</Th><Th align="right">Margin</Th><Th align="right">Estimate</Th></tr></thead>
            <tbody>
              {shownRows.map((m) => (
                <tr key={m.month} className="hover:bg-surface-2/60" data-testid="month-row">
                  <Td className="font-medium">{m.month}</Td>
                  <Td align="right">{fmtInt(m.orders)}{m.noMoney > 0 && <span className="ml-1 text-[12px] text-ink-3" title="Orders with no money data yet">({m.noMoney} waiting)</span>}</Td>
                  <Td align="right">{rm(m.sales)}</Td>
                  <Td align="right">{rm(m.fees)}</Td>
                  <Td align="right">{rm(m.shipping)}</Td>
                  <Td align="right">{rm(m.adjustments)}</Td>
                  <Td align="right">{rm(m.cost)}</Td>
                  <Td align="right">{rm(m.fulfilment)}</Td>
                  <Td align="right">{rm(m.adSpend)}</Td>
                  <Td align="right" className={`font-semibold ${tone(m.net)}`}>{rm(m.net)}</Td>
                  <Td align="right">{m.margin == null ? "–" : `${(m.margin * 100).toFixed(1)}%`}</Td>
                  <Td align="right">{m.estimatedShare > 0.005 ? <Badge tone="warn">{Math.round(m.estimatedShare * 100)}%</Badge> : <span className="text-ink-3">Exact</span>}</Td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-semibold"><Td>Total</Td><Td align="right">{fmtInt(total.orders)}</Td><Td align="right">{rm(total.sales)}</Td><Td align="right">{rm(total.fees)}</Td><Td align="right">{rm(total.shipping)}</Td><Td align="right">{rm(total.adjustments)}</Td><Td align="right">{rm(total.cost)}</Td><Td align="right">{rm(total.fulfilment)}</Td><Td align="right">{rm(total.adSpend)}</Td><Td align="right" className={tone(total.net)}>{rm(total.net)}</Td><Td align="right">{total.margin == null ? "–" : `${(total.margin * 100).toFixed(1)}%`}</Td><Td /></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

async function Claims() {
  const c = await loadClaims();
  const open = c.items.filter((i) => i.status === "open");
  const sum = (xs: { amount: number }[]) => xs.reduce((s, i) => s + i.amount, 0);
  const claimed = c.items.filter((i) => i.status === "claimed"), recovered = c.items.filter((i) => i.status === "recovered");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="claim-tiles">
        <StatTile icon={Handshake} label="To Claim" value={rm(sum(open), 0)} note={`${open.length} ${open.length === 1 ? "item" : "items"}`} tone="warn" />
        <StatTile icon={Receipt} label="Already Claimed" value={rm(sum(claimed), 0)} note={`${claimed.length} ${claimed.length === 1 ? "item" : "items"}, waiting for TikTok`} tone="neutral" />
        <StatTile icon={Wallet} label="Recovered By You" value={rm(sum(recovered), 0)} note={`${recovered.length} ${recovered.length === 1 ? "item" : "items"}`} tone="good" />
        <StatTile icon={PackageCheck} label="Reimbursed By TikTok" value={rm(c.reimbursed, 0)} note={`${c.reimbursedCount} ${c.reimbursedCount === 1 ? "payment" : "payments"} received`} tone="good" />
      </div>
      <Card>
        <CardHeader title="Claim Back" description="Money TikTok took off an order that may be wrong, and shipping fees that are far above the usual. Mark what you do about each one." />
        {c.items.length ? <ClaimsTable items={c.items} /> : <EmptyState icon={<Handshake className="size-5" />} title="Nothing to claim" description="No deduction or unusual shipping fee was found in TikTok's finance records." />}
      </Card>
      {c.types.length > 0 && (
        <Card>
          <CardHeader title="All Adjustment Types" description="Every kind of adjustment TikTok has made on an order. Reimbursements are counted in the box above; deductions are listed here." />
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse" data-testid="claim-types"><thead><tr><Th>Type</Th><Th align="right">Times</Th><Th align="right">Amount</Th></tr></thead><tbody>{c.types.map((t) => <tr key={t.type}><Td>{titleCase(t.type)}</Td><Td align="right">{t.count}</Td><Td align="right" className={tone(t.amount)}>{rm(t.amount)}</Td></tr>)}</tbody></table></div>
        </Card>
      )}
    </>
  );
}

function Costs({ data }: { data: ProfitData }) {
  const pieces = new Map<string, number>();
  for (const r of data.rows) pieces.set(r.month, (pieces.get(r.month) ?? 0) + r.pieces);
  const months = [...pieces.keys()].sort().reverse().map((m) => ({ month: m, pieces: pieces.get(m) ?? 0, invoice: data.invoices.get(m) ?? null, rate: data.invoices.has(m) && (pieces.get(m) ?? 0) > 0 ? data.invoices.get(m)! / pieces.get(m)! : data.perUnit }));
  return <FulfilmentCard rate={data.perUnit} months={months} />;
}
