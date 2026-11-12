import "server-only";
import { sql as pg } from "@/db";
import { loadCosting } from "@/lib/stock/costing";

export const DEFAULT_FULFILMENT = 1.2;

export type MoneyState = "paid" | "processing" | "estimate" | "none";

/** One TikTok order with what TikTok paid (or will pay), what the pieces cost, and the profit before ads. Money TikTok takes away is a negative number. */
export type OrderProfit = {
  platform: "tiktok";
  orderId: string;
  day: string; // the day the order was placed (Kuala Lumpur)
  month: string; // YYYY-MM, the month the order was sold
  status: string | null;
  isSample: boolean;
  skus: string; // short text for the table
  pieces: number;
  money: MoneyState;
  paidAt: string | null;
  sales: number;
  commission: number;
  affiliate: number;
  adFee: number; // GMV Max ad fee TikTok took from this order's money (a top-up, not the real ad spend)
  shipping: number; // the seller shipping fee deducted by the platform, after what the buyer paid and the platform discount
  shippingActual: number;
  shippingBuyer: number;
  shippingDiscount: number;
  otherFees: number; // transaction fee, service fee, coupons, tax and the rest
  reimbursement: number;
  deduction: number; // adjustments taken off (shipping fee adjustment, penalties ...)
  settlement: number;
  cost: number; // what the pieces cost, FIFO, returned pieces taken off
  fulfilment: number;
  returnedPieces: number;
  flags: { noCost: number; short: number };
  /** settlement with the ad fee added back, less cost and fulfilment. null when TikTok has given no money data yet. */
  profitBeforeAds: number | null;
};

export type ProfitData = {
  rows: OrderProfit[];
  perUnit: number;
  invoices: Map<string, number>; // month → real 3PL invoice
  adSpend: Map<string, number>; // month → real ad spend (GMV Max)
  adSpendDays: Map<string, number>; // day → real ad spend
  unknownSkus: Map<string, number>;
  costStart: string | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function getFulfilmentRate(): Promise<number> {
  const [r] = await pg`select value from settings where key = 'profit_fulfilment'`;
  const v = Number((r?.value as { perUnit?: number } | undefined)?.perUnit);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_FULFILMENT;
}

let memo: { at: number; value: ProfitData } | null = null;
export const clearProfit = () => { memo = null; };

export async function loadProfit(): Promise<ProfitData> {
  if (memo && Date.now() - memo.at < 30_000) return memo.value;
  const [costing, perUnit, fin, uns, invoices, ads, adDays] = await Promise.all([
    loadCosting(),
    getFulfilmentRate(),
    pg`
      select t.order_id,
        sum(coalesce(t.revenue_amount, 0))::float8 as rev,
        sum(coalesce(t.platform_commission, 0))::float8 as comm,
        sum(coalesce(t.affiliate_commission, 0))::float8 as aff,
        sum(coalesce(t.gmv_max_ad_fee, 0))::float8 as adfee,
        sum(coalesce(t.shipping_cost_amount, 0))::float8 as ship,
        sum(coalesce(t.actual_shipping_fee, 0))::float8 as ship_actual,
        sum(coalesce(t.customer_paid_shipping, 0))::float8 as ship_buyer,
        sum(coalesce(t.shipping_discount, 0))::float8 as ship_disc,
        sum(coalesce(t.settlement_amount, 0))::float8 as settle,
        sum(case when t.adjustment_id is not null and upper(coalesce(t.type, '')) ~ '(REIMBURS|COMPENSAT)' then coalesce(t.adjustment_amount, t.settlement_amount, 0) else 0 end)::float8 as reimb,
        sum(case when t.adjustment_id is not null and not upper(coalesce(t.type, '')) ~ '(REIMBURS|COMPENSAT)' then coalesce(t.adjustment_amount, t.settlement_amount, 0) else 0 end)::float8 as adj_other,
        bool_and(coalesce(s.payment_status, '') = 'PAID') as all_paid,
        max(s.payment_time) as paid_at
      from tt_fin_transactions t left join tt_fin_statements s on s.id = t.statement_id
      where t.order_id is not null group by t.order_id`,
    pg`
      select order_id,
        sum(coalesce(est_settlement_amount, 0))::float8 as settle, sum(coalesce(est_revenue_amount, 0))::float8 as rev,
        sum(coalesce(est_shipping_cost_amount, 0))::float8 as ship, sum(coalesce(est_fee_tax_amount, 0))::float8 as fee, sum(coalesce(est_adjustment_amount, 0))::float8 as adj,
        sum(coalesce(nullif(coalesce(raw #>> '{est_fee_tax_breakdown,fee,gmv_max_ad_fee_amount}', raw #>> '{fee_tax_breakdown,fee,gmv_max_ad_fee_amount}'), '')::numeric, 0))::float8 as adfee,
        sum(coalesce(nullif(coalesce(raw #>> '{est_fee_tax_breakdown,fee,platform_commission_amount}', raw #>> '{fee_tax_breakdown,fee,platform_commission_amount}'), '')::numeric, 0))::float8 as comm,
        sum(coalesce(nullif(coalesce(raw #>> '{est_fee_tax_breakdown,fee,affiliate_commission_amount}', raw #>> '{fee_tax_breakdown,fee,affiliate_commission_amount}'), '')::numeric, 0))::float8 as aff
      from tt_fin_unsettled where order_id is not null group by order_id`,
    pg`select to_char(month, 'YYYY-MM') as m, amount::float8 as amount from profit_fulfilment_months`,
    pg`select to_char(day, 'YYYY-MM') as m, sum(coalesce(cost, 0))::float8 as spend from ads_campaign_daily group by 1`,
    pg`select to_char(day, 'YYYY-MM-DD') as d, sum(coalesce(cost, 0))::float8 as spend from ads_campaign_daily group by 1`,
  ]);
  const finBy = new Map(fin.map((r) => [String(r.order_id), r]));
  const unsBy = new Map(uns.map((r) => [String(r.order_id), r]));
  const invoiceBy = new Map(invoices.map((r) => [String(r.m), Number(r.amount)]));

  // Pieces shipped in each month, to spread a real 3PL invoice over them.
  const monthPieces = new Map<string, number>();
  for (const o of costing.orders) { const m = o.day.slice(0, 7); monthPieces.set(m, (monthPieces.get(m) ?? 0) + (costing.byOrder.get(o.orderId)?.pieces ?? 0)); }
  const rateOf = (m: string) => { const inv = invoiceBy.get(m); const p = monthPieces.get(m) ?? 0; return inv != null && p > 0 ? inv / p : perUnit; };

  const rows: OrderProfit[] = [];
  for (const o of costing.orders) {
    const c = costing.byOrder.get(o.orderId);
    const f = finBy.get(o.orderId);
    const u = unsBy.get(o.orderId);
    const month = o.day.slice(0, 7);
    const pieces = c?.pieces ?? 0;
    let money: MoneyState = "none";
    let sales = 0, commission = 0, affiliate = 0, adFee = 0, shipping = 0, shipA = 0, shipB = 0, shipD = 0, reimb = 0, adjOther = 0, settlement = 0, paidAt: string | null = null;
    if (f) {
      money = f.all_paid ? "paid" : "processing";
      sales = n(f.rev); commission = n(f.comm); affiliate = n(f.aff); adFee = n(f.adfee); shipping = n(f.ship); shipA = n(f.ship_actual); shipB = n(f.ship_buyer); shipD = n(f.ship_disc);
      reimb = n(f.reimb); adjOther = n(f.adj_other); settlement = n(f.settle);
      paidAt = f.paid_at ? new Date(f.paid_at as Date).toISOString() : null;
    } else if (u) {
      money = "estimate";
      sales = n(u.rev); commission = n(u.comm); affiliate = n(u.aff); adFee = n(u.adfee); shipping = n(u.ship); settlement = n(u.settle);
      adjOther = n(u.adj);
    }
    // Everything else TikTok takes (transaction fee, service fee, coupons, tax ...) is what is left, so the columns always add up to the settlement.
    const otherFees = money === "none" ? 0 : settlement - (sales + commission + affiliate + adFee + shipping + reimb + adjOther);
    const fulfilment = pieces * rateOf(month);
    const cost = c?.cost ?? 0;
    rows.push({
      platform: "tiktok", orderId: o.orderId, day: o.day, month, status: o.status, isSample: o.isSample,
      skus: o.items.length ? (o.items.length > 2 ? `${o.items[0].qty} × ${o.items[0].sku} +${o.items.length - 1} more` : o.items.map((i) => `${i.qty} × ${i.sku}`).join(", ")) : "–",
      pieces, money, paidAt, sales, commission, affiliate, adFee, shipping, shippingActual: shipA, shippingBuyer: shipB, shippingDiscount: shipD, otherFees, reimbursement: reimb, deduction: adjOther, settlement,
      cost, fulfilment, returnedPieces: c?.returnedPieces ?? 0, flags: { noCost: c?.noCost ?? 0, short: c?.short ?? 0 },
      profitBeforeAds: money === "none" && !o.isSample ? null : settlement - adFee - cost - fulfilment,
    });
  }
  rows.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.orderId < b.orderId ? 1 : -1));
  const value: ProfitData = { rows, perUnit, invoices: invoiceBy, adSpend: new Map(ads.map((r) => [String(r.m), Number(r.spend)])), adSpendDays: new Map(adDays.map((r) => [String(r.d), Number(r.spend)])), unknownSkus: costing.unknownSkus, costStart: costing.costStart };
  memo = { at: Date.now(), value };
  return value;
}

export type Totals = {
  orders: number; pieces: number; sales: number; settlement: number; adFee: number; shipping: number; commission: number; affiliate: number; otherFees: number; reimbursement: number; deduction: number;
  cost: number; fulfilment: number; profitBeforeAds: number; estimated: number; noMoney: number; samples: number; noCost: number;
};

export function totalsOf(rows: OrderProfit[]): Totals {
  const t: Totals = { orders: 0, pieces: 0, sales: 0, settlement: 0, adFee: 0, shipping: 0, commission: 0, affiliate: 0, otherFees: 0, reimbursement: 0, deduction: 0, cost: 0, fulfilment: 0, profitBeforeAds: 0, estimated: 0, noMoney: 0, samples: 0, noCost: 0 };
  for (const r of rows) {
    t.orders++; t.pieces += r.pieces;
    if (r.isSample) t.samples++;
    if (r.money === "none" && !r.isSample) { t.noMoney++; continue; } // no money data yet: not counted in money or profit
    if (r.money === "estimate") t.estimated++;
    t.sales += r.sales; t.settlement += r.settlement; t.adFee += r.adFee; t.shipping += r.shipping; t.commission += r.commission; t.affiliate += r.affiliate; t.otherFees += r.otherFees;
    t.reimbursement += r.reimbursement; t.deduction += r.deduction; t.cost += r.cost; t.fulfilment += r.fulfilment; t.profitBeforeAds += r.profitBeforeAds ?? 0; t.noCost += r.flags.noCost;
  }
  return t;
}
