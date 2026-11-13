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
    if (u.pathname === "/api/v2/order/get_order_list") return json(res, { error: "", message: "", request_id: "z", response: { more: false, order_list: [{ order_sn: "2611AAAA" }] } });
    json(res, { error: "error_not_found", message: "no such api" });
  });
}).listen(4010, () => console.log("pretend Shopee on :4010"));
