process.env.SWR_OFF = "1";
// Shopee orders and payments: reading Shopee's answers, the sync (windows, paging, retries), and the profit it produces.
// Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-shopee-sync.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { createHmac } from "node:crypto";
import { sql as pg } from "../src/db";
import { shopeeConnectWithCode, shopeeDisconnect, type ShopeeConfig } from "../src/lib/shopee/client";
import { mapShopeeEscrow, mapShopeeOrder } from "../src/lib/shopee/map";
import { runShopeeSync, shopeeSyncStatus } from "../src/lib/shopee/sync";
import { clearProfit, forChannel, loadProfit, totalsOf } from "../src/lib/profit/data";
import { channelLines } from "../src/lib/profit/monthly";
import { clearCosting } from "../src/lib/stock/costing";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };
const near = (a: number, b: number, e = 0.005) => Math.abs(a - b) <= e;

const KEY = "sync-test-key";
const cfg: ShopeeConfig = { partnerId: 1253192, partnerKey: KEY, env: "sandbox", base: "https://shopee.test" };
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");
const NOW = Math.floor(Date.UTC(2026, 10, 17, 4, 0, 0) / 1000); // 17 Nov 2026
const DAY = 86400;

type O = { sn: string; status: string; create: number; update: number; paid?: number; items: { sku: string; qty: number }[]; fbs?: boolean };
function fake(orders: O[], o: { noEscrow?: Set<string>; rateLimitOnce?: boolean; authFail?: boolean } = {}) {
  const calls: { path: string; q: URLSearchParams; body: Record<string, unknown> | null }[] = [];
  let limited = false;
  const f = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    const ts = u.searchParams.get("timestamp") ?? "", pid = u.searchParams.get("partner_id");
    if (u.pathname === "/api/v2/auth/token/get") return ok({ error: "", access_token: "A1", refresh_token: "R1", expire_in: 14400, shop_id_list: [777] });
    calls.push({ path: u.pathname, q: u.searchParams, body });
    const at = u.searchParams.get("access_token") ?? "", sid = u.searchParams.get("shop_id") ?? "";
    if (u.searchParams.get("sign") !== hmac(`${pid}${u.pathname}${ts}${at}${sid}`)) return ok({ error: "error_sign", message: "Wrong sign." });
    if (o.authFail) return ok({ error: "error_auth", message: "Invalid access_token." });
    if (o.rateLimitOnce && !limited && u.pathname === "/api/v2/order/get_order_list") { limited = true; return ok({ error: "error_too_many_request", message: "Too many requests." }); }
    if (u.pathname === "/api/v2/order/get_order_list") {
      const from = Number(u.searchParams.get("time_from")), to = Number(u.searchParams.get("time_to")), size = Number(u.searchParams.get("page_size")), off = Number(u.searchParams.get("cursor") || 0);
      if (to - from > 15 * DAY) return ok({ error: "error_param", message: "The time range is longer than 15 days." });
      const hit = orders.filter((x) => x.update >= from && x.update <= to).sort((a, b) => a.update - b.update);
      const page = hit.slice(off, off + size);
      return ok({ error: "", response: { more: off + size < hit.length, next_cursor: String(off + size), order_list: page.map((x) => ({ order_sn: x.sn, order_status: x.status })) } });
    }
    if (u.pathname === "/api/v2/order/get_order_detail") {
      const sns = String(u.searchParams.get("order_sn_list")).split(",");
      if (sns.length > 50) return ok({ error: "error_param", message: "Too many order numbers." });
      return ok({ error: "", response: { order_list: sns.map((sn) => orders.find((x) => x.sn === sn)).filter(Boolean).map((x) => ({ order_sn: x!.sn, order_status: x!.status, create_time: x!.create, update_time: x!.update, pay_time: x!.paid ?? x!.create + 60, total_amount: 100, currency: "MYR", fulfillment_flag: x!.fbs ? "fulfilled_by_shopee" : "fulfilled_by_cb_seller", item_list: x!.items.map((i, k) => ({ item_id: 1, item_name: "Protector", item_sku: "LISTING-SKU", model_id: k, model_sku: i.sku, model_quantity_purchased: i.qty, model_discounted_price: 50 })) })) } });
    }
    if (u.pathname === "/api/v2/payment/get_escrow_detail_batch") {
      const sns = (body?.order_sn_list as string[]) ?? [];
      if (sns.length > 50) return ok({ error: "error_param", message: "Too many order numbers." });
      return ok({ error: "", response: sns.map((sn) => (o.noEscrow?.has(sn) ? { escrow_detail: { order_sn: sn, order_income: {} } } : { escrow_detail: { order_sn: sn, buyer_user_name: "someone", order_income: { escrow_amount: 79.5, original_price: 100, seller_discount: 10, commission_fee: 6, service_fee: 3, seller_transaction_fee: 1.5, actual_shipping_fee: 8, buyer_paid_shipping_fee: 3, shopee_shipping_rebate: 2 } } })) });
    }
    return ok({ error: "error_not_found", message: "no such api" });
  };
  return { f, calls };
}

(async () => {
  // ── reading Shopee's answers
  const d = { order_sn: "SN1", order_status: "completed", create_time: NOW - DAY, update_time: NOW, pay_time: NOW - DAY + 60, total_amount: "99.50", currency: "MYR", fulfillment_flag: "fulfilled_by_shopee",
    item_list: [{ item_name: "A", item_sku: "LIST", model_sku: "NMP-S-WH-ST", model_quantity_purchased: 2, model_discounted_price: 40 }, { item_name: "B", item_sku: "ONLY-LISTING", model_sku: "", model_quantity_purchased: 1, model_original_price: 30 }, { item_sku: "X", model_quantity_purchased: 0 }] };
  const m = mapShopeeOrder(d)!;
  check("map: the variation's SKU is used, the listing's SKU when there is none", m.items[0].sku === "NMP-S-WH-ST" && m.items[1].sku === "ONLY-LISTING");
  check("map: quantities add up, a zero line is dropped, the status is in capitals", m.pieces === 3 && m.items.length === 2 && m.status === "COMPLETED" && m.totalAmount === 99.5);
  check("map: fulfilled by Shopee is recognised", m.isFbs === true && mapShopeeOrder({ ...d, fulfillment_flag: "fulfilled_by_cb_seller" })!.isFbs === false);
  check("map: an order without a number or a date is skipped", mapShopeeOrder({ ...d, order_sn: "" }) === null && mapShopeeOrder({ ...d, create_time: 0 }) === null);
  const e = mapShopeeEscrow({ escrow_detail: { order_sn: "SN1", buyer_user_name: "secret-name", order_income: { escrow_amount: 70, commission_fee: "5.5", seller_transaction_fee: 1 } } })!;
  check("map: payment figures are read (text numbers too)", e.escrowAmount === 70 && e.commissionFee === 5.5 && e.transactionFee === 1 && e.serviceFee === null);
  check("map: the buyer's name is never kept", !JSON.stringify(e.raw).includes("secret-name"));
  check("map: no payment figures yet gives nothing", mapShopeeEscrow({ escrow_detail: { order_sn: "SN2", order_income: {} } }) === null);

  // ── the sync
  await pg`truncate shopee_orders, shopee_escrow`; await pg`delete from tt_sync_state where dataset like 'shopee\\_%'`; await shopeeDisconnect();
  const mk = (i: number, status: string, ago: number, fbs = false): O => ({ sn: `SN${String(i).padStart(4, "0")}`, status, create: NOW - ago * DAY, update: NOW - ago * DAY + 3600, items: [{ sku: "NMP-S-WH-ST", qty: 1 }], fbs });
  const orders: O[] = [];
  for (let i = 0; i < 130; i++) orders.push(mk(i, "COMPLETED", 1 + (i % 20)));          // 20 days: two windows, 130 orders: three detail chunks, two pages
  orders.push(mk(900, "UNPAID", 3), mk(901, "CANCELLED", 3), mk(902, "SHIPPED", 2), mk(903, "COMPLETED", 5, true));
  const noEscrow = new Set(["SN0902"]);
  const fk = fake(orders, { noEscrow, rateLimitOnce: true });
  await shopeeConnectWithCode("CODE", { shopId: "777" }, cfg, fk.f);
  const sleeps: number[] = [];
  const r1 = await runShopeeSync({ f: fk.f, cfg, nowSec: NOW, historyDays: 20, sleep: async (ms) => { sleeps.push(ms); } });
  check("sync: ok, every order read (134)", r1.ok && r1.orders === 134 && r1.error === null, JSON.stringify(r1));
  check("sync: 20 days were read in two windows of at most 15 days", r1.windows === 2 && fk.calls.filter((c) => c.path.endsWith("get_order_list")).every((c) => Number(c.q.get("time_to")) - Number(c.q.get("time_from")) <= 15 * DAY));
  check("sync: a rate limit was waited out and tried again", sleeps.length === 1 && sleeps[0] >= 1000);
  check("sync: details came in chunks of at most 50", fk.calls.filter((c) => c.path.endsWith("get_order_detail")).every((c) => String(c.q.get("order_sn_list")).split(",").length <= 50));
  const [{ n: nOrders }] = await pg`select count(*)::int as n from shopee_orders`;
  check("sync: the orders are saved with their items", nOrders === 134 && ((await pg`select items, is_fbs, pieces from shopee_orders where order_sn = 'SN0903'`)[0].is_fbs === true));
  const [{ n: nEsc }] = await pg`select count(*)::int as n from shopee_escrow`;
  check("sync: payments are read for paid-up orders only (not unpaid, cancelled, or ones Shopee has no figures for)", nEsc === 131 + 0 && (await pg`select 1 from shopee_escrow where order_sn in ('SN0900', 'SN0901', 'SN0902')`).length === 0, String(nEsc));
  check("sync: an order Shopee has no figures for is marked as asked", (await pg`select escrow_checked_at from shopee_orders where order_sn = 'SN0902'`)[0].escrow_checked_at != null);
  const st = await shopeeSyncStatus();
  check("status: counts and dates", st.orders.records === 134 && st.escrow.records === 131 && !!st.orders.at && st.orders.error === null && st.awaiting === 0 + 0 + 1, JSON.stringify(st));

  // ── again: only what changed
  fk.calls.length = 0;
  orders.find((x) => x.sn === "SN0902")!.status = "COMPLETED"; orders.find((x) => x.sn === "SN0902")!.update = NOW - 3600;
  noEscrow.delete("SN0902");
  const r2 = await runShopeeSync({ f: fk.f, cfg, nowSec: NOW, sleep: async () => {} });
  check("again: only the newest days are read, the changed order is updated", r2.ok && r2.orders >= 1 && r2.orders < 20 && (await pg`select status from shopee_orders where order_sn = 'SN0902'`)[0].status === "COMPLETED", JSON.stringify(r2));
  check("again: the changed order now has its payment", (await pg`select 1 from shopee_escrow where order_sn = 'SN0902'`).length === 1);
  check("again: nothing is doubled", (await pg`select count(*)::int as n from shopee_orders`)[0].n === 134);

  // ── a refused login is reported, not hidden
  const bad = fake(orders, { authFail: true });
  const r3 = await runShopeeSync({ f: bad.f, cfg, nowSec: NOW, sleep: async () => {} });
  check("error: a refused login stops the sync with Shopee's message and remembers it", !r3.ok && /error_auth|access_token/.test(r3.error ?? "") && /error_auth|access_token/.test((await shopeeSyncStatus()).orders.error ?? ""), JSON.stringify(r3));
  const r4 = await runShopeeSync({ f: fk.f, cfg, nowSec: NOW, sleep: async () => {} });
  check("error: the next good sync clears the error", r4.ok && (await shopeeSyncStatus()).orders.error === null);

  // ── profit: stock, costing and the money side by side with TikTok
  await pg`truncate stock_layers, stock_orders cascade`;
  await pg`insert into stock_orders (order_no, sort_no, kind, arrival_date, source) values ('1', 10, 'order', '2026-01-01', 'file')`;
  await pg`insert into stock_layers (order_no, sku, paid_qty, total_cost_rm, arrival_date, chunk) values ('1', 'NMP-S-WH-ST', 1000, 10000, '2026-01-01', 1)`; // RM 10 a piece
  await pg`delete from shopee_orders where order_sn not in ('SN0000', 'SN0903', 'SN0900', 'SN0901')`;
  await pg`update shopee_orders set status = 'COMPLETED' where order_sn = 'SN0000'`;
  await pg`truncate tt_orders, tt_fin_transactions, tt_fin_statements, tt_fin_unsettled, ads_campaign_daily`;
  clearCosting(); clearProfit();
  const p = await loadProfit();
  const sp = p.rows.filter((x) => x.platform === "shopee");
  check("profit: Shopee orders are in, unpaid and cancelled ones are not", sp.length === 2 && !sp.some((x) => x.orderId === "SN0900" || x.orderId === "SN0901"), JSON.stringify(sp.map((x) => x.orderId)));
  const a = sp.find((x) => x.orderId === "SN0000")!;
  check("profit: sales = original price less the seller's discount (RM 90)", near(a.sales, 90), String(a.sales));
  check("profit: commission is negative, shipping deducted = shipping RM 8 − buyer RM 3 − Shopee rebate RM 2 = −RM 3", near(a.commission, -6) && near(a.shipping, -3) && near(a.shippingActual, 8), `${a.commission} ${a.shipping}`);
  check("profit: settlement is what Shopee pays out, other fees make the columns add up", near(a.settlement, 79.5) && near(a.sales + a.commission + a.affiliate + a.adFee + a.shipping + a.reimbursement + a.deduction + a.otherFees, a.settlement), JSON.stringify(a));
  check("profit: completed means paid", a.money === "paid");
  check("profit: the piece is costed from the stock (RM 10), a normal order carries the fulfilment rate", near(a.cost, 10) && a.fulfilment > 0 && near(a.profitBeforeAds ?? 0, 79.5 - 10 - a.fulfilment));
  const fbs = sp.find((x) => x.orderId === "SN0903")!;
  check("profit: an order Shopee packs itself has no fulfilment cost", fbs.fulfilment === 0 && near(fbs.cost, 10));
  const onlyShopee = forChannel(p, "shopee"), onlyTik = forChannel(p, "tiktok");
  check("channel: Shopee alone has Shopee rows and no TikTok ad spend; TikTok alone has none of Shopee's", onlyShopee.rows.every((x) => x.platform === "shopee") && onlyShopee.adSpend.size === 0 && onlyTik.rows.every((x) => x.platform === "tiktok"));
  const lines = channelLines(p, () => true, () => 0);
  check("channel: the by-channel lines add up to both together", lines.length === 2 && near(lines[1].net, totalsOf(onlyShopee.rows).profitBeforeAds) && lines[1].orders === 2);

  await shopeeDisconnect();
  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
