/* eslint-disable @typescript-eslint/no-require-imports */
// A pretend Shopee for the browser check (scripts/e2e-shopee.js). It checks signatures like Shopee does.
//   node scripts/fake-shopee-api.js          (listens on :4010, partner key "testkey")
// Start the app with:  SHOPEE_PARTNER_ID=1253192 SHOPEE_PARTNER_KEY=testkey SHOPEE_API_BASE=http://localhost:4010 SHOPEE_ENV=sandbox
const http = require("http"), crypto = require("crypto");
const KEY = "testkey";
const hmac = (s) => crypto.createHmac("sha256", KEY).update(s).digest("hex");
let n = 1;
const json = (res, j) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost:4010");
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const q = u.searchParams, pid = q.get("partner_id"), ts = q.get("timestamp");
    if (u.pathname === "/api/v2/shop/auth_partner") {
      if (q.get("sign") !== hmac(`${pid}${u.pathname}${ts}`)) { res.writeHead(400); return res.end("bad sign"); }
      const back = new URL(q.get("redirect")); back.searchParams.set("code", "CODE-1"); back.searchParams.set("shop_id", "777");
      res.writeHead(302, { location: back.toString() }); return res.end();
    }
    if (u.pathname === "/api/v2/auth/token/get" || u.pathname === "/api/v2/auth/access_token/get") {
      if (q.get("sign") !== hmac(`${pid}${u.pathname}${ts}`)) return json(res, { error: "error_sign", message: "Wrong sign." });
      n++; return json(res, { error: "", message: "", request_id: "x", access_token: `ACCESS-${n}`, refresh_token: `REFRESH-${n}`, expire_in: 14400, shop_id_list: [777] });
    }
    const at = q.get("access_token"), sid = q.get("shop_id");
    if (q.get("sign") !== hmac(`${pid}${u.pathname}${ts}${at}${sid}`)) return json(res, { error: "error_sign", message: "Wrong sign." });
    if (u.pathname === "/api/v2/shop/get_shop_info") return json(res, { error: "", message: "", request_id: "y", response: { shop_name: "ALOOMA Malaysia", region: "MY", status: "NORMAL" } });
    // Three recent orders for the sync check: two done (one packed by Shopee), one still shipping.
    const now = Math.floor(Date.now() / 1000);
    const ORDERS = [
      { order_sn: "2611AAAA", order_status: "COMPLETED", create_time: now - 3 * 86400, update_time: now - 2 * 86400, fulfillment_flag: "fulfilled_by_cb_seller" },
      { order_sn: "2611BBBB", order_status: "COMPLETED", create_time: now - 2 * 86400, update_time: now - 86400, fulfillment_flag: "fulfilled_by_shopee" },
      { order_sn: "2611CCCC", order_status: "SHIPPED", create_time: now - 86400, update_time: now - 3600, fulfillment_flag: "fulfilled_by_cb_seller" },
    ];
    if (u.pathname === "/api/v2/order/get_order_list") {
      const from = Number(q.get("time_from")), to = Number(q.get("time_to"));
      return json(res, { error: "", message: "", request_id: "z", response: { more: false, order_list: ORDERS.filter((o) => o.update_time >= from && o.update_time <= to).map((o) => ({ order_sn: o.order_sn, order_status: o.order_status })) } });
    }
    if (u.pathname === "/api/v2/order/get_order_detail") {
      const sns = String(q.get("order_sn_list")).split(",");
      return json(res, { error: "", message: "", request_id: "d", response: { order_list: ORDERS.filter((o) => sns.includes(o.order_sn)).map((o) => ({ ...o, pay_time: o.create_time + 60, total_amount: 100, currency: "MYR", item_list: [{ item_id: 1, item_name: "Protector", item_sku: "LISTING", model_id: 2, model_sku: "NMP-S-WH-ST", model_quantity_purchased: 2, model_discounted_price: 50 }] })) } });
    }
    if (u.pathname === "/api/v2/payment/get_escrow_detail_batch") {
      return json(res, { error: "", message: "", request_id: "e", response: (body.order_sn_list || []).map((sn) => ({ escrow_detail: { order_sn: sn, buyer_user_name: "x", order_income: { escrow_amount: 160, original_price: 200, seller_discount: 10, commission_fee: 14, service_fee: 6, seller_transaction_fee: 3, actual_shipping_fee: 9, buyer_paid_shipping_fee: 4, shopee_shipping_rebate: 2 } } })) });
    }
    const dmy = (t) => { const d = new Date((t + 8 * 3600) * 1000); return String(d.getUTCDate()).padStart(2, "0") + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + d.getUTCFullYear(); };
    if (u.pathname === "/api/v2/payment/get_escrow_list") return json(res, { error: "", message: "", request_id: "f", response: { more: false, escrow_list: [{ order_sn: "2611AAAA", payout_amount: 160, escrow_release_time: now - 86400 }] } });
    if (u.pathname === "/api/v2/returns/get_return_list") return json(res, { error: "", message: "", request_id: "g", response: { more: false, return: [{ return_sn: "RET1", order_sn: "2611BBBB", status: "ACCEPTED", reason: "DEFECTIVE", create_time: now - 86400, update_time: now - 3600, refund_amount: 50, currency: "MYR", user: { username: "secret-buyer" }, item: [{ item_id: 1, name: "Protector", variation_sku: "NMP-S-WH-ST", amount: 1, refund_amount: 50 }] }] } });
    if (u.pathname === "/api/v2/ads/get_all_cpc_ads_daily_performance") return json(res, { error: "", message: "", request_id: "h", response: [{ date: dmy(now - 2 * 86400), impression: 1000, clicks: 40, expense: 12.5, broad_order: 3, broad_gmv: 150 }, { date: dmy(now - 86400), impression: 800, clicks: 30, expense: 10, broad_order: 2, broad_gmv: 100 }] });
    if (u.pathname === "/api/v2/payment/get_wallet_transaction_list") return json(res, { error: "", message: "", request_id: "i", response: { more: false, transaction_list: [{ create_time: now - 86400, transaction_type: "ESCROW_VERIFIED_ADD", amount: 160, money_flow: "MONEY_IN", current_balance: 160, order_sn: "2611AAAA", buyer_name: "secret-buyer" }, { create_time: now - 3600, transaction_type: "WITHDRAWAL_CREATED", amount: 100, money_flow: "MONEY_OUT", current_balance: 60, withdrawal_id: 99 }] } });
    if (u.pathname === "/api/v2/product/get_item_list") return json(res, { error: "", message: "", request_id: "j", response: { item: [{ item_id: 555 }], has_next_page: false, total_count: 1 } });
    if (u.pathname === "/api/v2/product/get_item_base_info") return json(res, { error: "", message: "", request_id: "k", response: { item_list: [{ item_id: 555, item_name: "Mattress Protector", has_model: true }] } });
    if (u.pathname === "/api/v2/product/get_model_list") return json(res, { error: "", message: "", request_id: "l", response: { model: [{ model_id: 1, model_name: "Single", model_sku: "NMP-S-WH-ST", stock_info_v2: { summary_info: { total_reserved_stock: 2, total_available_stock: 48 }, seller_stock: [{ location_id: "MYZ", stock: 18 }], shopee_stock: [{ location_id: "MYZ", stock: 30 }] } }] } });
    if (u.pathname.startsWith("/api/v2/ams/")) return json(res, { error: "error_permission", message: "No permission to call this API.", request_id: "m" });
    json(res, { error: "error_not_found", message: "no such api" });
  });
}).listen(4010, () => console.log("pretend Shopee on :4010"));
