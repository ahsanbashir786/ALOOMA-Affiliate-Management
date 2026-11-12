import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, todayKL } from "@/lib/time";
import { sqlFrom, type Range } from "@/lib/ads/range";

// Finance, read from TikTok Shop's own settlement records (tt_fin_*). Amounts keep TikTok's signs: money TikTok takes (a fee, shipping) is negative.
// Days are Kuala Lumpur days. A statement is TikTok's daily settlement (it closes at 00:00 UTC = 08:00 in Malaysia).

const num = (v: unknown) => (v == null ? 0 : Number(v));
const KL = "Asia/Kuala_Lumpur";

export type StatementRow = { id: string; day: string; settlement: number; revenue: number; fees: number; adjustment: number; status: string | null; paidOn: string | null; paymentId: string | null; payable: number | null; reserve: number | null };
export type CashData = {
  hasData: boolean; latestStatement: string | null; currency: string;
  paidOut: number; paidCount: number; settled: number; settledCount: number; onItsWay: number; onItsWayCount: number; failed: number; failedCount: number;
  unpaid: number; unpaidCount: number; reserve: number;
  series: { day: string; paid: number; processing: number; failed: number }[]; statements: StatementRow[];
};

export async function cashData(range: Range): Promise<CashData> {
  const from = sqlFrom(range), to = range.to;
  const [c] = await rows<{ n: number; latest: string | null; cur: string | null }>(sql`select count(*)::int as n, to_char(max(statement_time) at time zone ${KL}, 'YYYY-MM-DD') as latest, max(currency) as cur from tt_fin_statements`);
  const [k] = await rows<{ paid: number; paid_n: number; settled: number; settled_n: number; proc: number; proc_n: number; fail: number; fail_n: number; reserve: number }>(sql`
    select
      coalesce(sum(settlement_amount) filter (where payment_status = 'PAID' and (payment_time at time zone ${KL})::date between ${from}::date and ${to}::date), 0)::float8 as paid,
      (count(*) filter (where payment_status = 'PAID' and (payment_time at time zone ${KL})::date between ${from}::date and ${to}::date))::int as paid_n,
      coalesce(sum(settlement_amount) filter (where (statement_time at time zone ${KL})::date between ${from}::date and ${to}::date), 0)::float8 as settled,
      (count(*) filter (where (statement_time at time zone ${KL})::date between ${from}::date and ${to}::date))::int as settled_n,
      coalesce(sum(settlement_amount) filter (where payment_status = 'PROCESSING'), 0)::float8 as proc,
      (count(*) filter (where payment_status = 'PROCESSING'))::int as proc_n,
      coalesce(sum(settlement_amount) filter (where payment_status = 'FAILED'), 0)::float8 as fail,
      (count(*) filter (where payment_status = 'FAILED'))::int as fail_n,
      coalesce(sum(reserve_amount) filter (where (statement_time at time zone ${KL})::date between ${from}::date and ${to}::date), 0)::float8 as reserve
    from tt_fin_statements`);
  const [u] = await rows<{ amt: number; n: number }>(sql`select coalesce(sum(est_settlement_amount), 0)::float8 as amt, count(*)::int as n from tt_fin_unsettled`);
  const list = await rows<{ id: string; day: string; s: number; r: number; f: number; a: number; st: string | null; paid_on: string | null; pid: string | null; pay: number | null; res: number | null }>(sql`
    select id, to_char(statement_time at time zone ${KL}, 'YYYY-MM-DD') as day, coalesce(settlement_amount, 0)::float8 as s, coalesce(revenue_amount, 0)::float8 as r, coalesce(fee_amount, 0)::float8 as f, coalesce(adjustment_amount, 0)::float8 as a,
      payment_status as st, to_char(payment_time at time zone ${KL}, 'YYYY-MM-DD') as paid_on, nullif(payment_id, '') as pid, payable_amount::float8 as pay, reserve_amount::float8 as res
    from tt_fin_statements where (statement_time at time zone ${KL})::date between ${from}::date and ${to}::date order by statement_time desc limit 400`);
  const statements = list.map((x): StatementRow => ({ id: x.id, day: x.day, settlement: num(x.s), revenue: num(x.r), fees: num(x.f), adjustment: num(x.a), status: x.st, paidOn: x.paid_on, paymentId: x.pid, payable: x.pay == null ? null : num(x.pay), reserve: x.res == null ? null : num(x.res) }));
  // One bar a day, in the status colour. Newest 120 days at most so the chart stays readable.
  const last = statements.slice(0, 120).reverse();
  const series = last.map((x) => ({ day: x.day, paid: x.status === "PAID" ? x.settlement : 0, processing: x.status === "PROCESSING" || !x.status ? x.settlement : 0, failed: x.status === "FAILED" ? x.settlement : 0 }));
  return {
    hasData: (c?.n ?? 0) > 0, latestStatement: c?.latest ?? null, currency: c?.cur || "MYR",
    paidOut: num(k?.paid), paidCount: num(k?.paid_n), settled: num(k?.settled), settledCount: num(k?.settled_n), onItsWay: num(k?.proc), onItsWayCount: num(k?.proc_n), failed: num(k?.fail), failedCount: num(k?.fail_n),
    unpaid: num(u?.amt), unpaidCount: num(u?.n), reserve: num(k?.reserve), series, statements,
  };
}

// ───────── Profit and loss ─────────
export type PnlLine = { key: string; label: string; amount: number; /** Shown inside the group above it. */ child?: boolean; note?: string };
export type PnlData = {
  hasData: boolean; orders: number; from: string | null; to: string; currency: string;
  sales: number; sellerDiscounts: number; refunds: number; revenue: number;
  fees: PnlLine[]; feesTotal: number; shipping: number; shippingParts: { actual: number; customerPaid: number; discount: number }; adjustments: number;
  settlement: number; /** TikTok's own settlement total for the same statements. */ statementTotal: number; /** Settlement minus revenue + shipping + fees + adjustments. Not zero means a line is missing. */ gap: number;
  gmvMaxFeeInSettlement: number; adSpend: number; adSpendCounted: number; adMode: "auto-in" | "auto-out" | "in" | "out";
  profitBeforeCost: number; series: { day: string; revenue: number; fees: number; shipping: number; settlement: number }[];
};

/** `adsMode`: "in" = take the ad spend from Ads Manager off the profit, "out" = do not (TikTok already took it in the fees), null = decide automatically. */
export async function pnlData(range: Range, adsMode: "in" | "out" | null): Promise<PnlData> {
  const from = sqlFrom(range), to = range.to;
  const [t] = await rows<{ n: number; orders: number; sub: number; sd: number; sdr: number; rs: number; rev: number; pc: number; ac: number; tf: number; sfp: number; gmv: number; gcf: number; oth: number; tax: number; ship: number; ash: number; cps: number; sdc: number; adj: number; st: number; cur: string | null }>(sql`
    select count(*)::int as n, (count(*) filter (where t.type = 'ORDER' or t.order_id is not null))::int as orders,
      coalesce(sum(t.subtotal_before_discount), 0)::float8 as sub, coalesce(sum(t.seller_discount), 0)::float8 as sd, coalesce(sum(t.seller_discount_refund), 0)::float8 as sdr, coalesce(sum(t.refund_subtotal), 0)::float8 as rs,
      coalesce(sum(t.revenue_amount), 0)::float8 as rev, coalesce(sum(t.platform_commission), 0)::float8 as pc, coalesce(sum(t.affiliate_commission), 0)::float8 as ac, coalesce(sum(t.transaction_fee), 0)::float8 as tf,
      coalesce(sum(t.sfp_service_fee), 0)::float8 as sfp, coalesce(sum(t.gmv_max_ad_fee), 0)::float8 as gmv, coalesce(sum(t.gmv_max_coupon_fee), 0)::float8 as gcf, coalesce(sum(t.other_fees), 0)::float8 as oth, coalesce(sum(t.tax_amount), 0)::float8 as tax,
      coalesce(sum(t.shipping_cost_amount), 0)::float8 as ship, coalesce(sum(t.actual_shipping_fee), 0)::float8 as ash, coalesce(sum(t.customer_paid_shipping), 0)::float8 as cps, coalesce(sum(t.shipping_discount), 0)::float8 as sdc,
      coalesce(sum(t.adjustment_amount), 0)::float8 as adj, coalesce(sum(t.settlement_amount), 0)::float8 as st, (select max(currency) from tt_fin_statements) as cur
    from tt_fin_transactions t join tt_fin_statements s on s.id = t.statement_id
    where (s.statement_time at time zone ${KL})::date between ${from}::date and ${to}::date`);
  const [st] = await rows<{ amt: number }>(sql`select coalesce(sum(settlement_amount), 0)::float8 as amt from tt_fin_statements where (statement_time at time zone ${KL})::date between ${from}::date and ${to}::date`);
  const [ads] = await rows<{ cost: number }>(sql`select coalesce(sum(cost), 0)::float8 as cost from ads_campaign_daily where day between ${from}::date and ${to}::date`);
  const series = await rows<{ day: string; rev: number; fee: number; ship: number; st: number }>(sql`
    select to_char(s.statement_time at time zone ${KL}, 'YYYY-MM-DD') as day, coalesce(sum(t.revenue_amount), 0)::float8 as rev, coalesce(sum(t.fee_tax_amount), 0)::float8 as fee, coalesce(sum(t.shipping_cost_amount), 0)::float8 as ship, coalesce(sum(t.settlement_amount), 0)::float8 as st
    from tt_fin_transactions t join tt_fin_statements s on s.id = t.statement_id where (s.statement_time at time zone ${KL})::date between ${from}::date and ${to}::date group by 1 order by 1 limit 400`);
  const fees: PnlLine[] = [
    { key: "platform", label: "TikTok Commission", amount: num(t.pc) }, { key: "affiliate", label: "Affiliate Commission", amount: num(t.ac) }, { key: "txn", label: "Transaction Fee", amount: num(t.tf) },
    { key: "sfp", label: "Shipping Programme Fee (SFP)", amount: num(t.sfp) }, { key: "gmv", label: "GMV Max Ad Fee", amount: num(t.gmv) }, { key: "gmvc", label: "GMV Max Coupon Fee", amount: num(t.gcf) },
    { key: "other", label: "Other TikTok Fees", amount: num(t.oth) }, { key: "tax", label: "Taxes (SST and others)", amount: num(t.tax) },
  ];
  const feesTotal = fees.reduce((a, f) => a + f.amount, 0);
  const revenue = num(t.rev), shipping = num(t.ship), adjustments = num(t.adj), settlement = num(t.st);
  const gap = Math.round((settlement - (revenue + shipping + feesTotal + adjustments)) * 100) / 100;
  const gmvIn = num(t.gmv) + num(t.gcf);
  const adSpend = num(ads?.cost);
  // If TikTok already takes the GMV Max ad fee out of the settlement, counting the Ads Manager spend as well would count it twice.
  const mode: PnlData["adMode"] = adsMode ?? (gmvIn !== 0 ? "auto-out" : "auto-in");
  const counted = mode === "in" || mode === "auto-in" ? adSpend : 0;
  return {
    hasData: num(t?.n) > 0, orders: num(t?.orders), from: range.from, to, currency: t?.cur || "MYR",
    sales: num(t.sub), sellerDiscounts: num(t.sd) + num(t.sdr), refunds: num(t.rs), revenue, fees, feesTotal, shipping, shippingParts: { actual: num(t.ash), customerPaid: num(t.cps), discount: num(t.sdc) }, adjustments,
    settlement, statementTotal: num(st?.amt), gap, gmvMaxFeeInSettlement: gmvIn, adSpend, adSpendCounted: counted, adMode: mode, profitBeforeCost: settlement - counted,
    series: series.map((x) => ({ day: x.day, revenue: num(x.rev), fees: num(x.fee), shipping: num(x.ship), settlement: num(x.st) })),
  };
}

// ───────── Not paid yet ─────────
export type PendingRow = { id: string; orderId: string | null; type: string | null; createdOn: string | null; deliveredOn: string | null; ageDays: number | null; reason: string | null; estimate: number; revenue: number };
export type PendingData = { hasData: boolean; total: number; count: number; revenue: number; buckets: { label: string; amount: number; count: number }[]; reasons: { reason: string; amount: number; count: number }[]; rows: PendingRow[]; currency: string };

export async function pendingData(): Promise<PendingData> {
  const today = todayKL();
  const [t] = await rows<{ n: number; amt: number; rev: number; cur: string | null }>(sql`select count(*)::int as n, coalesce(sum(est_settlement_amount), 0)::float8 as amt, coalesce(sum(est_revenue_amount), 0)::float8 as rev, max(currency) as cur from tt_fin_unsettled`);
  const list = await rows<{ id: string; oid: string | null; type: string | null; created: string | null; delivered: string | null; reason: string | null; est: number; rev: number }>(sql`
    select id, order_id as oid, type, to_char(order_create_time at time zone ${KL}, 'YYYY-MM-DD') as created, to_char(order_delivery_time at time zone ${KL}, 'YYYY-MM-DD') as delivered, unsettled_reason as reason,
      coalesce(est_settlement_amount, 0)::float8 as est, coalesce(est_revenue_amount, 0)::float8 as rev from tt_fin_unsettled order by order_create_time asc nulls last limit 2000`);
  const ageOf = (r: { created: string | null; delivered: string | null }) => { const d = r.delivered ?? r.created; return d ? Math.max(0, Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400_000)) : null; };
  const rowsOut = list.map((r): PendingRow => ({ id: r.id, orderId: r.oid, type: r.type, createdOn: r.created, deliveredOn: r.delivered, ageDays: ageOf(r), reason: r.reason, estimate: num(r.est), revenue: num(r.rev) }));
  const B = [["0 to 7 days", 0, 7], ["8 to 14 days", 8, 14], ["15 to 30 days", 15, 30], ["Over 30 days", 31, 9999]] as const;
  const buckets = B.map(([label, lo, hi]) => { const m = rowsOut.filter((r) => r.ageDays != null && r.ageDays >= lo && r.ageDays <= hi); return { label, amount: m.reduce((a, r) => a + r.estimate, 0), count: m.length }; });
  const rm = new Map<string, { amount: number; count: number }>();
  for (const r of rowsOut) { const k = r.reason || "No reason given"; const a = rm.get(k) ?? { amount: 0, count: 0 }; a.amount += r.estimate; a.count++; rm.set(k, a); }
  return {
    hasData: num(t?.n) > 0, total: num(t?.amt), count: num(t?.n), revenue: num(t?.rev), currency: t?.cur || "MYR", buckets,
    reasons: [...rm].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 8), rows: rowsOut.sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)).slice(0, 150),
  };
}

export const financeDefaultFrom = (today: string) => addDaysISO(today, -29);
