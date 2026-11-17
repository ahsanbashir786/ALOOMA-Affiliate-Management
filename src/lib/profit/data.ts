import "server-only";
import { cached } from "@/lib/swr";
import { sql as pg } from "@/db";
import { loadCosting } from "@/lib/stock/costing";

export const DEFAULT_FULFILMENT = 1.2;

export type MoneyState = "paid" | "processing" | "estimate" | "none";

/** One TikTok or Shopee order with what the platform paid (or will pay), what the pieces cost, and the profit before ads. Money TikTok takes away is a negative number. */
export type OrderProfit = {
  platform: "tiktok" | "shopee";
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
  /** Real ad spend per day for each channel: TikTok GMV Max and Shopee Ads. adSpend and adSpendDays below are the two added together. */
  adDays: { tiktok: Map<string, number>; shopee: Map<string, number> };
  perUnit: number;
  invoices: Map<string, number>; // month → real 3PL invoice
  adSpend: Map<string, number>; // month → real ad spend (GMV Max)
  adSpendDays: Map<string, number>; // day → real ad spend
  unknownSkus: Map<string, number>;
  costStart: string | null;
  startWarning: string | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function getFulfilmentRate(): Promise<number> {
  const [r] = await pg`select value from settings where key = 'profit_fulfilment'`;
  const v = Number((r?.value as { perUnit?: number } | undefined)?.perUnit);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_FULFILMENT;
}

let version = 0;
export const clearProfit = () => { version++; };

export const loadProfit = (): Promise<ProfitData> => cached("profit", "all", computeProfit, version);
async function computeProfit(): Promise<ProfitData> {
  const [costing, perUnit, fin, uns, invoices, adDays, shopeeEscrow, shopeeAds] = await Promise.all([
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
    pg`select to_char(day, 'YYYY-MM-DD') as d, sum(coalesce(cost, 0))::float8 as spend from ads_campaign_daily group by 1`,
    pg`select order_sn, escrow_amount::float8 as escrow, original_price::float8 as orig, seller_discount::float8 as disc, commission_fee::float8 as comm, ams_fee::float8 as ams,
        actual_shipping_fee::float8 as ship_actual, buyer_shipping_fee::float8 as ship_buyer, shipping_rebate::float8 as ship_rebate, compensation::float8 as comp, refund_amount::float8 as refund, released_at,
        -- the small amount Shopee moves from the order's money into the seller's ads wallet ("Ads Escrow Top Up Fee"); only newer orders have it
        (select coalesce(sum(abs(value::numeric)), 0) from jsonb_each_text(coalesce(raw -> 'order_income', '{}'::jsonb)) where key ~* 'ads' and value ~ '^-?[0-9]+(\.[0-9]+)?$')::float8 as ads_topup from shopee_escrow`,
    pg`select to_char(day, 'YYYY-MM-DD') as d, expense::float8 as spend from shopee_ads_daily`,
  ]);
  const spBy = new Map(shopeeEscrow.map((r) => [String(r.order_sn), r]));
  const finBy = new Map(fin.map((r) => [String(r.order_id), r]));
  const unsBy = new Map(uns.map((r) => [String(r.order_id), r]));
  const invoiceBy = new Map(invoices.map((r) => [String(r.m), Number(r.amount)]));

  // Pieces shipped in each month, to spread a real 3PL invoice over them.
  const monthPieces = new Map<string, number>();
  // Shopee FBS orders are packed by Shopee, so they are not part of the 3PL invoice.
  for (const o of costing.orders) { if (o.isFbs) continue; const m = o.day.slice(0, 7); monthPieces.set(m, (monthPieces.get(m) ?? 0) + (costing.byOrder.get(o.orderId)?.pieces ?? 0)); }
  const rateOf = (m: string) => { const inv = invoiceBy.get(m); const p = monthPieces.get(m) ?? 0; return inv != null && p > 0 ? inv / p : perUnit; };

  const rows: OrderProfit[] = [];
  for (const o of costing.orders) {
    const c = costing.byOrder.get(o.orderId);
    const f = o.platform === "tiktok" ? finBy.get(o.orderId) : undefined;
    const u = o.platform === "tiktok" ? unsBy.get(o.orderId) : undefined;
    const month = o.day.slice(0, 7);
    const pieces = c?.pieces ?? 0;
    let money: MoneyState = "none";
    let sales = 0, commission = 0, affiliate = 0, adFee = 0, shipping = 0, shipA = 0, shipB = 0, shipD = 0, reimb = 0, adjOther = 0, settlement = 0, paidAt: string | null = null;
    const sp = o.platform === "shopee" ? spBy.get(o.orderId) : undefined;
    if (sp) {
      // Shopee: what Shopee pays out (escrow) and the fees it takes. "paid" once Shopee has released the money (the release date), "settled, not paid yet" when the order is completed but not released, otherwise an estimate.
      money = sp.released_at ? "paid" : o.status === "COMPLETED" ? "processing" : "estimate";
      paidAt = sp.released_at ? new Date(sp.released_at as Date).toISOString() : null;
      sales = n(sp.orig) - n(sp.disc); commission = -Math.abs(n(sp.comm)); affiliate = -Math.abs(n(sp.ams));
      shipA = n(sp.ship_actual); shipB = n(sp.ship_buyer); shipD = n(sp.ship_rebate);
      shipping = -(shipA - shipB - shipD);
      adFee = -n(sp.ads_topup); // shown on the order, added back in profit (the real ad spend is taken off for the period instead), like TikTok's GMV Max top-up
      reimb = n(sp.comp); adjOther = -Math.abs(n(sp.refund)); settlement = n(sp.escrow);
    } else if (f) {
      money = f.all_paid ? "paid" : "processing";
      sales = n(f.rev); commission = n(f.comm); affiliate = n(f.aff); adFee = n(f.adfee); shipping = n(f.ship); shipA = n(f.ship_actual); shipB = n(f.ship_buyer); shipD = n(f.ship_disc);
      reimb = n(f.reimb); adjOther = n(f.adj_other); settlement = n(f.settle);
      paidAt = f.paid_at ? new Date(f.paid_at as Date).toISOString() : null;
    } else if (u && o.platform === "tiktok") {
      money = "estimate";
      sales = n(u.rev); commission = n(u.comm); affiliate = n(u.aff); adFee = n(u.adfee); shipping = n(u.ship); settlement = n(u.settle);
      adjOther = n(u.adj);
    }
    // Everything else TikTok takes (transaction fee, service fee, coupons, tax ...) is what is left, so the columns always add up to the settlement.
    const otherFees = money === "none" ? 0 : settlement - (sales + commission + affiliate + adFee + shipping + reimb + adjOther);
    const fulfilment = o.isFbs ? 0 : pieces * rateOf(month);
    const cost = c?.cost ?? 0;
    rows.push({
      platform: o.platform, orderId: o.orderId, day: o.day, month, status: o.status, isSample: o.isSample,
      skus: o.items.length ? (o.items.length > 2 ? `${o.items[0].qty} × ${o.items[0].sku} +${o.items.length - 1} more` : o.items.map((i) => `${i.qty} × ${i.sku}`).join(", ")) : "–",
      pieces, money, paidAt, sales, commission, affiliate, adFee, shipping, shippingActual: shipA, shippingBuyer: shipB, shippingDiscount: shipD, otherFees, reimbursement: reimb, deduction: adjOther, settlement,
      cost, fulfilment, returnedPieces: c?.returnedPieces ?? 0, flags: { noCost: c?.noCost ?? 0, short: c?.short ?? 0 },
      profitBeforeAds: money === "none" && !o.isSample ? null : settlement - adFee - cost - fulfilment,
    });
  }
  rows.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.orderId < b.orderId ? 1 : -1));
  // Ad spend counts only from the first day orders are counted. Ads that ran before have no sales or stock cost to set against them.
  const adSpendDays = new Map<string, number>();
  const adSpend = new Map<string, number>();
  const adDaysBy = { tiktok: new Map<string, number>(), shopee: new Map<string, number>() };
  for (const [ch, list] of [["tiktok", adDays], ["shopee", shopeeAds]] as const) {
    for (const r of list) {
      const d = String(r.d);
      if (costing.costStart && d < costing.costStart) continue;
      const v = Number(r.spend);
      adDaysBy[ch].set(d, v);
      adSpendDays.set(d, (adSpendDays.get(d) ?? 0) + v);
      adSpend.set(d.slice(0, 7), (adSpend.get(d.slice(0, 7)) ?? 0) + v);
    }
  }
  const value: ProfitData = { rows, adDays: adDaysBy, perUnit, invoices: invoiceBy, adSpend, adSpendDays, unknownSkus: costing.unknownSkus, costStart: costing.costStart, startWarning: costing.startWarning };
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

export type Channel = "all" | "tiktok" | "shopee";
export const CHANNELS: { key: Channel; label: string }[] = [{ key: "all", label: "All Channels" }, { key: "tiktok", label: "TikTok" }, { key: "shopee", label: "Shopee" }];
export const parseChannel = (v: string | undefined): Channel => (v === "tiktok" || v === "shopee" ? v : "all");

/** The same data for one channel, with that channel's own real ad spend (TikTok GMV Max, Shopee Ads). */
export function forChannel(data: ProfitData, ch: Channel): ProfitData {
  if (ch === "all") return data;
  const days = data.adDays[ch];
  const adSpend = new Map<string, number>();
  for (const [d, v] of days) adSpend.set(d.slice(0, 7), (adSpend.get(d.slice(0, 7)) ?? 0) + v);
  return { ...data, rows: data.rows.filter((r) => r.platform === ch), adSpend, adSpendDays: days };
}
