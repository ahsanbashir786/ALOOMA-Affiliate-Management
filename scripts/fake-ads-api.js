/* eslint-disable @typescript-eslint/no-require-imports */
// A pretend TikTok Business API + approval page for browser tests. No real TikTok, no real keys.
// Start: node scripts/fake-ads-api.js   (port 3999)
// Run the app with:  TIKTOK_ADS_APP_ID=APP1 TIKTOK_ADS_APP_SECRET=s3cret TIKTOK_ADS_API_BASE=http://127.0.0.1:3999/open_api/v1.3 TIKTOK_ADS_AUTH_BASE=http://127.0.0.1:3999/portal/auth
const http = require("node:http");
const PORT = Number(process.env.FAKE_ADS_PORT || 3999);
const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const FIRST = addDays(TODAY, -45);
const reply = (res, code, data, message = "OK") => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message, request_id: "FAKE1", data })); };
const read = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });
const val = (camp, day, item) => { const n = ((Date.parse(day + "T00:00:00Z") / 86400000) % 7) + (camp === "C2" ? 3 : 1) + (item ? item.length : 0); return { cost: (n * 10).toFixed(2), net_cost: (n * 9).toFixed(2), orders: String(n), cost_per_order: "10.00", gross_revenue: (n * 40).toFixed(2), roi: (4 + n / 10).toFixed(2) }; };
const CAMPAIGNS = [
  { campaign_id: "C1", campaign_name: "Pillow GMV Max", operation_status: "ENABLE", store_id: "S1", gmv_max_promotion_type: "PRODUCT_SHOPPING", budget: "200.00", roas_bid: "4.5", create_time: "2026-08-20 10:00:00" },
  { campaign_id: "C2", campaign_name: "LIVE GMV Max", operation_status: "DISABLE", store_id: "S1", gmv_max_promotion_type: "LIVE", budget: "100", roas_bid: "3", create_time: "2026-09-01 10:00:00" },
];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname.replace(/^.*\/open_api\/v1\.3/, "");
  if (u.pathname === "/portal/auth") {
    const to = new URL(u.searchParams.get("redirect_uri"));
    to.searchParams.set("auth_code", "GOOD"); to.searchParams.set("state", u.searchParams.get("state") || "");
    res.writeHead(302, { location: to.toString() }); return res.end();
  }
  const body = await read(req);
  if (p === "/oauth2/access_token/") return body.auth_code === "GOOD" ? reply(res, 0, { access_token: "AT123", advertiser_ids: ["111"], scope: [1, 2, 3] }) : reply(res, 40002, null, "auth_code is invalid");
  if (p === "/oauth2/advertiser/get/") return reply(res, 0, { list: [{ advertiser_id: "111", advertiser_name: "ALOOMA Malaysia" }] });
  if (req.headers["access-token"] !== "AT123") return reply(res, 40105, null, "Access token is invalid or expired");
  const q = Object.fromEntries(u.searchParams.entries());
  if (p === "/advertiser/info/") return reply(res, 0, { list: [{ advertiser_id: "111", name: "ALOOMA Malaysia", currency: "MYR", timezone: "Asia/Kuala_Lumpur", status: "STATUS_ENABLE" }] });
  if (p === "/gmv_max/store/list/") return reply(res, 0, { store_list: [{ store_id: "S1", store_name: "ALOOMA MY", store_code: "MY-1", store_authorized_bc_id: "B1", is_gmv_max_available: true }] });
  if (p === "/gmv_max/campaign/get/") return reply(res, 0, { list: CAMPAIGNS, page_info: { page: 1, page_size: 50, total_number: CAMPAIGNS.length, total_page: 1 } });
  if (p === "/gmv_max/report/get/") {
    const dims = JSON.parse(q.dimensions), mets = JSON.parse(q.metrics);
    if (dims.includes("item_id") && dims.includes("campaign_id")) return reply(res, 40002, null, "Invalid dimensions: item_id can not be combined with campaign_id");
    if (mets.includes("title") || mets.includes("product_name")) return reply(res, 40002, null, "Invalid metric: title");
    const lines = [];
    for (let d = q.start_date; d <= q.end_date; d = addDays(d, 1)) {
      if (d < FIRST) continue;
      for (const camp of ["C1", "C2"]) for (const it of dims.includes("item_id") ? ["V1", "V22"] : dims.includes("item_group_id") ? ["P1"] : [""]) {
        const v = val(camp, d, it);
        const dm = { stat_time_day: d + " 00:00:00" };
        if (dims.includes("campaign_id")) dm.campaign_id = camp;
        if (dims.includes("item_id")) dm.item_id = it;
        if (dims.includes("item_group_id")) dm.item_group_id = it;
        lines.push({ dimensions: dm, metrics: Object.fromEntries(mets.map((k) => [k, v[k] ?? ""])) });
      }
    }
    const page = Number(q.page), size = Number(q.page_size);
    return reply(res, 0, { list: lines.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: lines.length, total_page: Math.max(1, Math.ceil(lines.length / size)) } });
  }
  return reply(res, 40002, null, "unknown path " + p);
});
server.listen(PORT, "127.0.0.1", () => console.log(`fake TikTok Ads API on ${PORT}`));
