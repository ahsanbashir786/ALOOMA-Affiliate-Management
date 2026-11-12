import type { OrderProfit, ProfitData } from "./data";

export type MonthRow = {
  month: string; orders: number; pieces: number; samples: number;
  sales: number; fees: number; shipping: number; adjustments: number; settlement: number; adTopUp: number;
  cost: number; fulfilment: number; profitBeforeAds: number; adSpend: number; net: number;
  margin: number | null; estimatedShare: number; noMoney: number;
};

const blank = (month: string): MonthRow => ({ month, orders: 0, pieces: 0, samples: 0, sales: 0, fees: 0, shipping: 0, adjustments: 0, settlement: 0, adTopUp: 0, cost: 0, fulfilment: 0, profitBeforeAds: 0, adSpend: 0, net: 0, margin: null, estimatedShare: 0, noMoney: 0 });

/** One row per month an order was sold in (or ads were run), newest first. Estimates for unpaid orders are included and counted in estimatedShare. */
export function monthlyRows(data: ProfitData, rows: OrderProfit[] = data.rows): MonthRow[] {
  const by = new Map<string, MonthRow & { estSales: number }>();
  const get = (m: string) => { let r = by.get(m); if (!r) { r = { ...blank(m), estSales: 0 }; by.set(m, r); } return r; };
  for (const o of rows) {
    const r = get(o.month);
    r.orders++; r.pieces += o.pieces;
    if (o.isSample) r.samples++;
    if (o.money === "none" && !o.isSample) { r.noMoney++; continue; }
    r.sales += o.sales; r.fees += o.commission + o.affiliate + o.otherFees; r.shipping += o.shipping; r.adjustments += o.reimbursement + o.deduction;
    r.settlement += o.settlement; r.adTopUp += o.adFee; r.cost += o.cost; r.fulfilment += o.fulfilment; r.profitBeforeAds += o.profitBeforeAds ?? 0;
    if (o.money === "estimate") r.estSales += o.sales;
  }
  for (const [m, spend] of data.adSpend) if (rows === data.rows || by.has(m)) get(m).adSpend = spend;
  return [...by.values()].map(({ estSales, ...r }) => ({ ...r, net: r.profitBeforeAds - r.adSpend, margin: r.sales > 0 ? (r.profitBeforeAds - r.adSpend) / r.sales : null, estimatedShare: r.sales > 0 ? estSales / r.sales : 0 })).sort((a, b) => (a.month < b.month ? 1 : -1));
}

export function sumMonths(ms: MonthRow[]): MonthRow {
  const t = blank("Total");
  for (const m of ms) for (const k of ["orders", "pieces", "samples", "sales", "fees", "shipping", "adjustments", "settlement", "adTopUp", "cost", "fulfilment", "profitBeforeAds", "adSpend", "noMoney"] as const) t[k] += m[k];
  t.net = t.profitBeforeAds - t.adSpend;
  t.margin = t.sales > 0 ? t.net / t.sales : null;
  const est = ms.reduce((s, m) => s + m.estimatedShare * m.sales, 0);
  t.estimatedShare = t.sales > 0 ? est / t.sales : 0;
  return t;
}
