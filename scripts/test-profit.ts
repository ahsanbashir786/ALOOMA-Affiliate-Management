// Order profit, monthly profit and loss, claim back, new stock-in orders. Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-profit.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import ExcelJS from "exceljs";
import { sql as pg } from "../src/db";
import { priceOrder, parseOrderLines, templateWorkbook } from "../src/lib/stock/neworder";
import { runFifoWithReturns } from "../src/lib/stock/fifo";
import { clearCosting } from "../src/lib/stock/costing";
import { clearProfit, loadProfit, totalsOf } from "../src/lib/profit/data";
import { loadClaims, shippingLimit } from "../src/lib/profit/claims";
import { monthlyRows, sumMonths } from "../src/lib/profit/monthly";
import { resolvePeriod } from "../src/lib/profit/period";
import { rm } from "../src/lib/profit/format";
import { saveNewOrder, removeAppOrder } from "../src/lib/stock/save";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };
const near = (a: number | null | undefined, b: number, e = 0.011) => a != null && Math.abs(a - b) <= e;

async function xlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("S");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

(async () => {
  // ── pure: the price of a new order
  const p = priceOrder([{ sku: "A", paid: 100, free: 10, unitRmb: 16.5, rmbPerRm: null }, { sku: "B", paid: 50, free: 0, unitRmb: 33, rmbPerRm: 3.3 }], 1.65, 1500);
  check("price: freight is shared over the 150 paid pieces (RM 10 each)", near(p.freightPerPaid, 10));
  check("price: A costs 16.5 / 1.65 + 10 = RM 20 a piece, B 33 / 3.3 + 10 = RM 20", near(p.lines[0].totalCostRm, 2000) && near(p.lines[1].totalCostRm, 1000), JSON.stringify(p.lines));
  check("price: a line's own rate wins over the order's rate", p.lines[1].rmbPerRm === 3.3);
  check("price: landed = product + freight", near(p.landed, p.productRm + 1500) && p.free === 10);
  check("price: no paid pieces gives no freight share and no crash", priceOrder([{ sku: "A", paid: 0, free: 5, unitRmb: 1, rmbPerRm: null }], 1.6, 100).freightPerPaid === 0);

  // ── pure: reading a supplier file by its header names
  const sup = await parseOrderLines(await xlsx([["Supplier Co"], [], ["No", "Item Code", "Qty (pcs)", "Free", "Unit Price (RMB)", "Amount RMB"], [1, "nmp-q-wh-st", 1000, 20, 19.95, 19950], [2, "WPMP-Q-WH-ST", 500, 0, 23.45, 11725], [null, "TOTAL", 1500, 20, null, 31675]]));
  check("supplier file: headers found by name, SKUs upper-cased, total row ignored", sup.lines.length === 2 && sup.lines[0].sku === "NMP-Q-WH-ST" && sup.lines[0].paid === 1000 && sup.lines[0].free === 20 && sup.lines[0].unitRmb === 19.95, JSON.stringify(sup));
  const bad = await parseOrderLines(await xlsx([["Name", "Colour"], ["x", "y"]]));
  check("supplier file: a file with no SKU column is refused with a clear message", bad.lines.length === 0 && /SKU, Paid Qty, Unit Price RMB/.test(bad.warnings[0]));
  const tpl = await parseOrderLines(Buffer.from(await templateWorkbook()));
  check("template: the downloadable template reads back", tpl.lines.length === 2 && tpl.lines[1].free === 10);

  // ── pure: shipping limit and period
  check("claims: too few orders gives no shipping limit", shippingLimit([3, 3, 3]) === Infinity);
  check("claims: limit is twice the usual fee", near(shippingLimit(Array.from({ length: 25 }, () => 4)), 8));
  check("period: custom dates are kept", resolvePeriod(undefined, "2026-01-01", "2026-01-31").from === "2026-01-01");
  check("money: negative amounts show a minus sign", rm(-12.5) === "-RM 12.50" && rm(1234.5) === "RM 1,234.50" && rm(null) === "–");

  // ── pure: returns go back into stock at the cost they left with
  const lay = [{ id: 1, orderNo: "A", sortNo: 1, arrival: "2026-01-01", sku: "X", qty: 4, totalCost: 40 }, { id: 2, orderNo: "B", sortNo: 2, arrival: "2026-01-05", sku: "X", qty: 4, totalCost: 80 }];
  const rr = runFifoWithReturns(lay, [{ ref: "o1", day: "2026-01-02", sku: "X", qty: 4 }, { ref: "o2", day: "2026-01-10", sku: "X", qty: 5 }], [{ ref: "o1", day: "2026-01-08", sku: "X", qty: 2 }]);
  check("returns: 2 pieces come back at RM 10 and join the stock after layer B (older first)", near(rr.returnedCost.get("o1"), 20) && rr.costed[1].takes[0].orderNo === "B" && rr.costed[1].takes[1].orderNo === "RETURN" && near(rr.costed[1].cost, 4 * 20 + 1 * 10), JSON.stringify(rr.costed[1]));

  // ── database
  await pg`truncate tt_orders, tt_returns, tt_fin_transactions, tt_fin_statements, tt_fin_unsettled, ads_campaign_daily, stock_layers, stock_orders, stock_bundle_parts, stock_bundles, stock_skus, claim_back_items, profit_fulfilment_months cascade`;
  await pg`delete from settings where key = 'profit_fulfilment'`;
  await pg`insert into stock_orders (order_no, sort_no, kind, arrival_date, arrival_exact) values ('A', 1, 'order', '2026-01-01', true), ('B', 2, 'order', '2026-02-01', true)`;
  await pg`insert into stock_layers (order_no, sku, paid_qty, free_qty, total_cost_rm) values ('A', 'X', 10, 0, 100), ('B', 'X', 10, 0, 200)`;
  await pg`insert into stock_bundles (set_sku) values ('SET-X')`;
  await pg`insert into stock_bundle_parts (set_sku, part_sku, qty) values ('SET-X', 'X', 2)`;
  const ord = (id: string, day: string, sku: string, n: number, status = "COMPLETED", sample = false) => pg`insert into tt_orders (order_id, status, is_sample, created_at, paid_at, lines)
    values (${id}, ${status}, ${sample}, ${day + "T04:00:00Z"}, ${day + "T04:00:00Z"}, ${JSON.stringify(Array.from({ length: n }, () => ({ seller_sku: sku })))}::jsonb)`;
  await ord("P1", "2026-01-10", "X", 3); await ord("P2", "2026-01-12", "SET-X", 1); await ord("R1", "2026-01-15", "X", 4); await ord("S1", "2026-01-20", "X", 1, "COMPLETED", true);
  await ord("E1", "2026-02-03", "X", 1, "AWAITING_COLLECTION"); await ord("N1", "2026-02-05", "X", 1, "AWAITING_SHIPMENT"); await ord("C1", "2026-02-06", "X", 5, "CANCELLED");
  await pg`insert into tt_fin_statements (id, statement_time, payment_status, payment_time) values ('S-PAID', '2026-01-14T00:00:00Z', 'PAID', '2026-01-16T00:00:00Z'), ('S-PROC', '2026-01-17T00:00:00Z', 'PROCESSING', null)`;
  const tx = (st: string, id: string, order: string, o: Record<string, number | string | null>) => pg`insert into tt_fin_transactions (statement_id, id, type, order_id, adjustment_id, settlement_amount, revenue_amount, platform_commission, affiliate_commission, gmv_max_ad_fee, shipping_cost_amount, actual_shipping_fee, customer_paid_shipping, shipping_discount, adjustment_amount)
    values (${st}, ${id}, ${(o.type as string) ?? "ORDER"}, ${order}, ${(o.adj as string) ?? null}, ${o.settle as number}, ${(o.rev as number) ?? null}, ${(o.comm as number) ?? null}, ${(o.aff as number) ?? null}, ${(o.ad as number) ?? null}, ${(o.ship as number) ?? null}, ${(o.sa as number) ?? null}, ${(o.sb as number) ?? null}, ${(o.sd as number) ?? null}, ${(o.amt as number) ?? null})`;
  await tx("S-PAID", "t1", "P1", { rev: 100, comm: -5, aff: -10, ad: -8, ship: -4, sa: -6, sb: 2, sd: 0, settle: 73 });
  await tx("S-PROC", "t2", "P2", { rev: 50, comm: -2.5, settle: 47.5 });
  await tx("S-PROC", "t3", "P2", { type: "SHIPPING_FEE_ADJUSTMENT", adj: "adj-1", settle: -3, amt: -3 });
  await tx("S-PROC", "t4", "P2", { type: "LOGISTICS_REIMBURSEMENT", adj: "adj-2", settle: 5, amt: 5 });
  await tx("S-PAID", "t5", "R1", { rev: 80, comm: -4, ship: -4, settle: 60 });
  await pg`insert into tt_fin_unsettled (id, type, order_id, est_settlement_amount, est_revenue_amount, est_shipping_cost_amount, est_fee_tax_amount, raw) values ('u1', 'ORDER', 'E1', 40, 50, -5, -5, ${JSON.stringify({ est_fee_tax_breakdown: { fee: { gmv_max_ad_fee_amount: -3 } } })}::jsonb)`;
  await pg`insert into tt_returns (return_id, order_id, status, return_type, skus, created_at) values ('ret1', 'R1', 'RETURN_OR_REFUND_REQUEST_COMPLETE', 'RETURN_AND_REFUND', ${JSON.stringify([{ seller_sku: "X" }, { seller_sku: "X" }])}::jsonb, '2026-01-25T04:00:00Z'), ('ret2', 'P1', 'REFUND_ONLY', 'REFUND', ${JSON.stringify([{ seller_sku: "X" }])}::jsonb, '2026-01-26T04:00:00Z')`;
  await pg`insert into ads_campaign_daily (advertiser_id, campaign_id, day, cost) values ('a', 'c', '2026-01-20', 30), ('a', 'c', '2026-02-10', 20)`;
  clearCosting(); clearProfit();

  const d = await loadProfit();
  const by = new Map(d.rows.map((r) => [r.orderId, r]));
  check("orders: cancelled orders are left out, the rest are listed", d.rows.length === 6 && !by.has("C1"), String(d.rows.length));
  const P1 = by.get("P1")!, P2 = by.get("P2")!, R1 = by.get("R1")!, S1 = by.get("S1")!, E1 = by.get("E1")!, N1 = by.get("N1")!;
  check("P1: paid, settlement RM 73, the RM 8 ads top-up and RM 4 shipping are shown", P1.money === "paid" && near(P1.settlement, 73) && near(P1.adFee, -8) && near(P1.shipping, -4) && near(P1.shippingActual, -6) && near(P1.commission, -5) && near(P1.affiliate, -10), JSON.stringify(P1));
  check("P1: 3 pieces cost RM 30 and fulfilment is 3 × RM 1.20 (a refund without the goods back keeps the cost)", near(P1.cost, 30) && near(P1.fulfilment, 3.6), `${P1.cost}/${P1.fulfilment}`);
  check("P1: profit before ads = 73 + 8 − 30 − 3.6 = RM 47.40", near(P1.profitBeforeAds, 47.4), String(P1.profitBeforeAds));
  check("P2: money is settled but not paid yet", P2.money === "processing");
  check("P2: a bundle of 2 takes 2 pieces from stock (RM 20)", P2.pieces === 2 && near(P2.cost, 20), `${P2.pieces}/${P2.cost}`);
  check("P2: the RM 5 reimbursement and the RM 3 deduction are split out, columns add up to the settlement", near(P2.reimbursement, 5) && near(P2.deduction, -3) && near(P2.settlement, 49.5) && near(P2.sales + P2.commission + P2.affiliate + P2.adFee + P2.shipping + P2.otherFees + P2.reimbursement + P2.deduction, P2.settlement), JSON.stringify(P2));
  check("P2: profit = 49.5 − 20 − 2.4 = RM 27.10", near(P2.profitBeforeAds, 27.1), String(P2.profitBeforeAds));
  check("R1: 2 of 4 pieces came back, so the cost is RM 20", R1.returnedPieces === 2 && near(R1.cost, 20), `${R1.returnedPieces}/${R1.cost}`);
  check("R1: profit = 60 − 20 − 4.8 = RM 35.20", near(R1.profitBeforeAds, 35.2), String(R1.profitBeforeAds));
  check("S1: a sample is a cost only (RM 10 + RM 1.20)", S1.isSample && near(S1.profitBeforeAds, -11.2), String(S1.profitBeforeAds));
  check("E1: an unpaid order uses TikTok's estimate, with the ads fee found in it", E1.money === "estimate" && near(E1.settlement, 40) && near(E1.adFee, -3), JSON.stringify(E1));
  check("E1: the piece that came back is used first (RM 10), so profit = 40 + 3 − 10 − 1.2 = RM 31.80", near(E1.cost, 10) && near(E1.profitBeforeAds, 31.8), `${E1.cost}/${E1.profitBeforeAds}`);
  check("N1: no money data yet, so no profit is shown", N1.money === "none" && N1.profitBeforeAds === null);
  check("FIFO: layer A ran out, so no order is short of stock", d.rows.every((r) => r.flags.short === 0 && r.flags.noCost === 0));

  const jan = d.rows.filter((r) => r.month === "2026-01");
  const tj = totalsOf(jan);
  check("totals: January profit before ads = 47.4 + 27.1 + 35.2 − 11.2 = RM 98.50", near(tj.profitBeforeAds, 98.5), String(tj.profitBeforeAds));
  const tf = totalsOf(d.rows.filter((r) => r.month === "2026-02"));
  check("totals: an order with no money data is counted separately, not in the profit", tf.noMoney === 1 && near(tf.profitBeforeAds, 31.8), JSON.stringify(tf));
  const m = monthlyRows(d);
  const mj = m.find((x) => x.month === "2026-01")!, mf = m.find((x) => x.month === "2026-02")!;
  check("monthly: January net = 98.50 − real ad spend RM 30 = RM 68.50", near(mj.net, 68.5) && near(mj.adSpend, 30), JSON.stringify(mj));
  check("monthly: February net = 31.80 − RM 20 = RM 11.80, with its estimate share shown", near(mf.net, 11.8) && mf.estimatedShare > 0.99, JSON.stringify(mf));
  check("monthly: newest month first, total adds the months", m[0].month === "2026-02" && near(sumMonths(m).net, 80.3), String(sumMonths(m).net));

  // fulfilment: a real invoice replaces the per-piece rate for its month
  await pg`insert into profit_fulfilment_months (month, amount) values ('2026-01-01', 100)`;
  clearProfit();
  const d2 = await loadProfit();
  check("fulfilment: a RM 100 invoice over January's 10 pieces is RM 10 a piece", near(d2.rows.find((r) => r.orderId === "P1")!.fulfilment, 30) && near(d2.rows.find((r) => r.orderId === "E1")!.fulfilment, 1.2));
  await pg`delete from profit_fulfilment_months`;
  await pg`insert into settings (key, value) values ('profit_fulfilment', '{"perUnit": 2}'::jsonb) on conflict (key) do update set value = excluded.value`;
  clearProfit();
  check("fulfilment: the per-piece rate can be changed", near((await loadProfit()).rows.find((r) => r.orderId === "P1")!.fulfilment, 6));
  await pg`delete from settings where key = 'profit_fulfilment'`; clearProfit();

  // claims
  const c = await loadClaims();
  check("claims: the RM 3 shipping fee adjustment is listed to claim", c.items.some((i) => i.orderId === "P2" && i.kind === "Platform Deduction" && near(i.amount, 3) && i.status === "open"), JSON.stringify(c.items));
  check("claims: the RM 5 reimbursement is counted as received, not as a claim", near(c.reimbursed, 5) && c.reimbursedCount === 1 && !c.items.some((i) => near(i.amount, 5)));
  await pg`insert into claim_back_items (key, order_id, kind, amount, status, note) values (${"P2|deduction|S-PROC:t3"}, 'P2', 'Platform Deduction', 3, 'claimed', 'ticket 123')`;
  const c2 = await loadClaims();
  check("claims: the status and note you saved are shown", c2.items.find((i) => i.orderId === "P2")?.status === "claimed" && c2.items.find((i) => i.orderId === "P2")?.note === "ticket 123");

  // adding a new stock-in order
  const add = await saveNewOrder({ orderNo: "31", purchaseDate: "2026-03-01", arrivalDate: "2026-03-20", file: "o31.xlsx", freightRm: 150, priced: priceOrder([{ sku: "X", paid: 10, free: 0, unitRmb: 16.5, rmbPerRm: null }], 1.65, 150) });
  check("new order: saved with its cost (10 × (10 + 15) = RM 250)", add.saved === 1 && near(Number((await pg`select total_cost_rm::float8 as t from stock_layers where order_no = '31'`)[0].t), 250));
  const dup = await saveNewOrder({ orderNo: "31", purchaseDate: null, arrivalDate: "2026-03-20", file: "x.xlsx", freightRm: 0, priced: priceOrder([{ sku: "X", paid: 1, free: 0, unitRmb: 1, rmbPerRm: null }], 1, 0) });
  check("new order: the same number twice is refused", dup.saved === 0 && /already exists/.test(dup.notes[0]));
  check("new order: only orders added in the app can be removed", (await removeAppOrder("A")) === false && (await removeAppOrder("31")) === true && (await pg`select 1 from stock_layers where order_no = '31'`).length === 0);

  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
