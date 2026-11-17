process.env.SWR_OFF = "1";
// Shopee orders and payments: reading Shopee's answers, the sync (windows, paging, retries), and the profit it produces.
// Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-shopee-sync.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { createHmac } from "node:crypto";
import { sql as pg } from "../src/db";
import { shopeeConnectWithCode, shopeeDisconnect, type ShopeeConfig } from "../src/lib/shopee/client";
import { mapShopeeAdsDay, mapShopeeEscrow, mapShopeeOrder, mapShopeeRelease, mapShopeeReturn, mapShopeeStock, mapShopeeWallet } from "../src/lib/shopee/map";
import { getShopeeSyncSettings, runShopeeSync, setShopeeSyncSettings, shopeeOverview, shopeeSchedulerTick, shopeeSyncStatus } from "../src/lib/shopee/sync";
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
function fake(orders: O[], o: { noEscrow?: Set<string>; rateLimitOnce?: boolean; authFail?: boolean; adsDenied?: boolean; oddBatch?: boolean } = {}) {
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
    if (u.pathname === "/api/v2/payment/get_escrow_detail") return ok({ error: "", response: { order_sn: u.searchParams.get("order_sn"), buyer_user_name: "x", order_income: { escrow_amount: 70, original_price: 90, commission_fee: 5 } } });
    if (u.pathname === "/api/v2/payment/get_escrow_detail_batch" && o.oddBatch) return ok({ error: "", response: ((body?.order_sn_list as string[]) ?? []).map((sn) => ({ order_sn: sn, escrow_info: { something: 1 } })) });
    if (u.pathname === "/api/v2/payment/get_escrow_detail_batch") {
      const sns = (body?.order_sn_list as string[]) ?? [];
      if (sns.length > 50) return ok({ error: "error_param", message: "Too many order numbers." });
      return ok({ error: "", response: sns.map((sn) => (o.noEscrow?.has(sn) ? { escrow_detail: { order_sn: sn, order_income: {} } } : { escrow_detail: { order_sn: sn, buyer_user_name: "someone", order_income: { escrow_amount: 79.5, original_price: 100, seller_discount: 10, commission_fee: 6, service_fee: 3, seller_transaction_fee: 1.5, actual_shipping_fee: 8, buyer_paid_shipping_fee: 3, shopee_shipping_rebate: 2, ads_escrow_top_up_fee_or_adjustment_amount: 1.5 } } })) });
    }
    const dmy = (t: number) => { const d = new Date((t + 8 * 3600) * 1000); return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`; };
    if (u.pathname === "/api/v2/payment/get_escrow_list") return ok({ error: "", response: { more: false, escrow_list: [{ order_sn: "SN0000", payout_amount: 79.5, escrow_release_time: NOW - DAY }] } });
    if (u.pathname === "/api/v2/returns/get_return_list") return ok({ error: "", response: { more: false, return: [{ return_sn: "R1", order_sn: "SN0000", status: "ACCEPTED", create_time: NOW - DAY, update_time: NOW - 3600, refund_amount: 50, item: [{ variation_sku: "NMP-S-WH-ST", amount: 1, refund_amount: 50 }], user: { username: "secret" } }, { return_sn: "R2", order_sn: "SN0001", status: "REQUESTED", create_time: NOW - DAY, update_time: NOW - 3600, item: [{ variation_sku: "NMP-S-WH-ST", amount: 1 }] }] } });
    if (u.pathname === "/api/v2/ads/get_all_cpc_ads_daily_performance") return o.adsDenied ? ok({ error: "error_permission", message: "No permission." }) : ok({ error: "", response: [{ date: dmy(NOW - 2 * DAY), expense: 12.5, broad_gmv: 100, impression: 10, clicks: 1 }, { date: dmy(NOW - DAY), expense: 10, broad_gmv: 50 }] });
    if (u.pathname === "/api/v2/payment/get_wallet_transaction_list") return ok({ error: "", response: { more: false, transaction_list: [{ create_time: NOW - DAY, transaction_type: "ESCROW_VERIFIED_ADD", amount: 79.5, money_flow: "MONEY_IN", current_balance: 79.5, order_sn: "SN0000", buyer_name: "secret" }, { create_time: NOW - 3600, transaction_type: "WITHDRAWAL_CREATED", amount: 50, money_flow: "MONEY_OUT", current_balance: 29.5, withdrawal_id: 7 }] } });
    if (u.pathname === "/api/v2/product/get_item_list") return ok({ error: "", response: { item: [{ item_id: 1 }, { item_id: 2 }], has_next_page: false } });
    if (u.pathname === "/api/v2/product/get_item_base_info") return ok({ error: "", response: { item_list: [{ item_id: 1, item_name: "P1", has_model: true }, { item_id: 2, item_name: "P2", item_sku: "SINGLE-SKU", has_model: false, stock_info_v2: { seller_stock: [{ stock: 5 }], shopee_stock: [{ stock: 7 }, { stock: 1 }], summary_info: { total_reserved_stock: 1 } } }] } });
    if (u.pathname === "/api/v2/product/get_model_list") return ok({ error: "", response: { model: [{ model_id: 10, model_name: "S", model_sku: "NMP-S-WH-ST", stock_info_v2: { seller_stock: [{ stock: 3 }], shopee_stock: [{ stock: 40 }] } }] } });
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

  // ── the other mappers
  const rt = mapShopeeReturn({ return_sn: "R9", order_sn: "SN1", status: "accepted", create_time: NOW, update_time: NOW, refund_amount: "20.5", item: [{ variation_sku: "V-SKU", item_sku: "L", amount: 2, refund_amount: 20.5 }, { amount: 0 }], user: { username: "secret" } })!;
  check("map: a return keeps its SKU (the variation's), quantity and refund, in capitals status, no buyer", rt.pieces === 2 && rt.items[0].sku === "V-SKU" && rt.status === "ACCEPTED" && rt.refundAmount === 20.5 && !JSON.stringify(rt).includes("secret"));
  check("map: a return with no number is skipped", mapShopeeReturn({ order_sn: "x" }) === null);
  const ad = mapShopeeAdsDay({ date: "05-11-2026", expense: "12.5", broad_gmv: 100, impression: 9 })!;
  check("map: an ad day reads Shopee's DD-MM-YYYY date and the spend", ad.day === "2026-11-05" && ad.expense === 12.5 && ad.gmv === 100 && mapShopeeAdsDay({ date: "nope" }) === null);
  const wl = mapShopeeWallet({ create_time: NOW, transaction_type: "WITHDRAWAL_CREATED", amount: 50, money_flow: "MONEY_OUT", current_balance: 10, buyer_name: "secret" })!;
  check("map: money out is stored negative, money in positive, no buyer name", wl.amount === -50 && mapShopeeWallet({ create_time: NOW, amount: 5, money_flow: "MONEY_IN" })!.amount === 5 && !JSON.stringify(wl).includes("secret"));
  check("map: a release date is read", mapShopeeRelease({ order_sn: "A", escrow_release_time: NOW, payout_amount: 3 })!.payoutAmount === 3 && mapShopeeRelease({ order_sn: "A" }) === null);
  const sk = mapShopeeStock(1, 2, " SKU ", "N", { seller_stock: [{ stock: 3 }, { stock: 2 }], shopee_stock: [{ stock: 40 }], summary_info: { total_reserved_stock: 4 } });
  check("map: stock adds up each warehouse (yours 5, Shopee's FBS 40, reserved 4)", sk.sellerStock === 5 && sk.shopeeStock === 40 && sk.reserved === 4 && sk.sku === "SKU");

  // ── the sync
  await pg`truncate shopee_orders, shopee_escrow, shopee_returns, shopee_ads_daily, shopee_wallet_tx, shopee_stock`; await pg`delete from tt_sync_state where dataset like 'shopee\\_%'`; await shopeeDisconnect();
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
  const dsum = (r: typeof r1) => Object.fromEntries(r.datasets.map((x) => [x.key, x.rows]));
  const nn = async (t: string) => Number((await pg.unsafe(`select count(*)::int as n from ${t}`))[0].n);
  check("sync: every part ran and saved once (returns 2, ad days 2, wallet 2, stock 2, one release date), repeated windows add nothing twice", r1.datasets.length === 7 && r1.datasets.every((x) => x.ok) && (await nn("shopee_returns")) === 2 && (await nn("shopee_ads_daily")) === 2 && (await nn("shopee_wallet_tx")) === 2 && (await nn("shopee_stock")) === 2 && (await pg`select count(*)::int as n from shopee_escrow where released_at is not null`)[0].n === 1, JSON.stringify(dsum(r1)));
  check("sync: the stock separates your warehouse from Shopee's (FBS)", (await pg`select seller_stock, shopee_stock, sku from shopee_stock where item_id = 1 and model_id = 10`)[0].shopee_stock === 40 && (await pg`select seller_stock, shopee_stock from shopee_stock where item_id = 2`)[0].shopee_stock === 8);
  check("sync: the release date is saved on the payment", (await pg`select released_at from shopee_escrow where order_sn = 'SN0000'`)[0].released_at != null);
  check("privacy: no buyer name is kept in returns or the wallet", (await pg`select 1 from shopee_wallet_tx where description ilike '%secret%'`).length === 0 && (await pg`select 1 from shopee_returns where reason ilike '%secret%'`).length === 0);
  check("again: only the newest days are read, the changed order is updated", r2.ok && r2.orders >= 1 && r2.orders < 20 && (await pg`select status from shopee_orders where order_sn = 'SN0902'`)[0].status === "COMPLETED", JSON.stringify(r2));
  check("again: the changed order now has its payment", (await pg`select 1 from shopee_escrow where order_sn = 'SN0902'`).length === 1);
  check("again: nothing is doubled", (await pg`select count(*)::int as n from shopee_orders`)[0].n === 134);

  // ── history of runs, live counts, settings
  const runsOk = await pg`select dataset, status, trigger from shopee_sync_runs where status = 'ok' order by id limit 7`;
  check("history: each part leaves a line (7 parts), marked manual unless it was the schedule", runsOk.length === 7 && new Set(runsOk.map((x) => x.dataset)).size === 7 && runsOk.every((x) => x.trigger === "manual"), JSON.stringify(runsOk));
  const ov = await shopeeOverview();
  check("overview: counts are the live rows (134 orders, 132 payments), with the dates read", ov.datasets[0].records === 134 && ov.datasets[1].records === 132 && !!ov.datasets[0].oldest && !ov.running && ov.runs.length >= 7, JSON.stringify(ov.datasets.map((x) => x.records)));
  check("overview: a Shopee problem shows on its own card, not as a TikTok one", ov.datasets.every((x) => x.lastError === null));
  check("settings: auto-sync starts on, every 30 minutes", JSON.stringify(await getShopeeSyncSettings()) === JSON.stringify({ enabled: true, everyMinutes: 30 }));
  await setShopeeSyncSettings(0);
  check("settings: switched off, the scheduler does nothing", (await getShopeeSyncSettings()).enabled === false && (await shopeeSchedulerTick()) === "off");
  await setShopeeSyncSettings(180);
  check("settings: every 3 hours; with a run just done the scheduler waits", (await getShopeeSyncSettings()).everyMinutes === 180 && (await shopeeSchedulerTick(Date.now())) !== "ran");
  await setShopeeSyncSettings(30);

  // ── if the batch answer cannot be read, say what it looks like and fall back to one order at a time
  await pg`truncate shopee_escrow`;
  const odd = fake(orders, { oddBatch: true });
  const ro = await runShopeeSync({ f: odd.f, cfg, nowSec: NOW, sleep: async () => {}, only: ["escrow"] });
  check("payments: an unreadable batch answer is described (field names only) and the single-order call is used instead", ro.datasets[0].ok && /could not be read/.test(ro.note ?? "") && /escrow_info/.test(ro.note ?? "") && /That works/.test(ro.note ?? "") && (await pg`select count(*)::int as n from shopee_escrow`)[0].n > 100, `${ro.note} ${JSON.stringify(ro.datasets)}`);
  check("payments: the note reaches the history line", /could not be read/.test((await pg`select error from shopee_sync_runs where dataset = 'shopee_escrow' and status = 'ok' order by id desc limit 1`)[0].error ?? ""));
  await pg`truncate shopee_escrow`; await pg`update shopee_orders set escrow_checked_at = null`;
  await runShopeeSync({ f: fk.f, cfg, nowSec: NOW, sleep: async () => {}, only: ["escrow", "release"] });

  // ── a part Shopee has not opened to this app is reported plainly and does not stop the others
  const denied = fake(orders, { adsDenied: true });
  const rd = await runShopeeSync({ f: denied.f, cfg, nowSec: NOW, sleep: async () => {}, only: ["ads", "returns"] });
  check("permission: a refused part says what to do, the other part still ran", !rd.ok && rd.datasets.find((x) => x.key === "ads")!.ok === false && /has not given this app access to Shopee Ads/.test(rd.datasets.find((x) => x.key === "ads")!.error ?? "") && rd.datasets.find((x) => x.key === "returns")!.ok, JSON.stringify(rd.datasets));
  check("permission: the failure is remembered for the screen", /Shopee Ads/.test((await shopeeSyncStatus()).datasets.find((x) => x.key === "ads")!.error ?? ""));
  await runShopeeSync({ f: fk.f, cfg, nowSec: NOW, sleep: async () => {}, only: ["ads"] });

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
  check("profit: an accepted return puts the piece back into stock, so the order's net cost is RM 0; a normal order carries the fulfilment rate", a.returnedPieces === 1 && near(a.cost, 0) && a.fulfilment > 0 && near(a.profitBeforeAds ?? 0, 79.5 + 1.5 - a.fulfilment), JSON.stringify(a));
  check("profit: the ads escrow top-up (RM 1.50) is shown on the order, added back in profit, and not counted twice in the other fees", near(a.adFee, -1.5) && near(a.otherFees, 79.5 - (a.sales + a.commission + a.affiliate - 1.5 + a.shipping + a.reimbursement + a.deduction)), `${a.adFee} ${a.otherFees}`);
  check("profit: money Shopee has released is paid (with its release date); completed but not released is 'settled, not paid yet'", a.money === "paid" && !!a.paidAt && sp.find((x) => x.orderId === "SN0903")!.money === "processing");
  const fbs = sp.find((x) => x.orderId === "SN0903")!;
  check("profit: an order Shopee packs itself has no fulfilment cost", fbs.fulfilment === 0 && near(fbs.cost, 10));
  const onlyShopee = forChannel(p, "shopee"), onlyTik = forChannel(p, "tiktok");
  const shopeeAds = [...onlyShopee.adSpendDays.values()].reduce((x, y) => x + y, 0), tiktokAds = [...onlyTik.adSpendDays.values()].reduce((x, y) => x + y, 0);
  check("channel: Shopee alone has Shopee rows and its own ad spend (RM 22.50); TikTok alone has none of it", onlyShopee.rows.every((x) => x.platform === "shopee") && near(shopeeAds, 22.5) && tiktokAds === 0 && onlyTik.rows.every((x) => x.platform === "tiktok"), `${shopeeAds} ${tiktokAds}`);
  check("channel: all together adds both channels' ad spend", near([...p.adSpendDays.values()].reduce((x, y) => x + y, 0), 22.5));
  const lines = channelLines(p, () => true, () => 0);
  check("channel: the by-channel lines add up to both together", lines.length === 2 && near(lines[1].net, totalsOf(onlyShopee.rows).profitBeforeAds) && lines[1].orders === 2);

  await shopeeDisconnect();
  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
