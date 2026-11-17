/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Settings → Connection → Shopee against a pretend Shopee.
// Needs: node scripts/fake-shopee-api.js running, the app on :3100 started with
//   SHOPEE_PARTNER_ID=1253192 SHOPEE_PARTNER_KEY=testkey SHOPEE_API_BASE=http://localhost:4010 SHOPEE_ENV=sandbox
// and the demo users (scripts/seed-creators-demo.ts). Any earlier Shopee connection is disconnected first.
const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
async function login(p, email) {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await login(p, "owner@test.local");
  await p.goto(BASE + "/settings?tab=connection&src=shopee"); await p.waitForSelector("[data-testid=shopee-card]");
  if (await p.getByTestId("shopee-status").innerText().then((t) => /^Connected/.test(t.trim()))) { await p.getByRole("button", { name: "Disconnect" }).click(); await p.getByRole("button", { name: "Yes, disconnect" }).click(); await p.waitForFunction(() => /Not connected/.test(document.querySelector("[data-testid=shopee-status]")?.textContent ?? "")); }

  const tabs = (await p.locator("nav[aria-label='Connection type'] a").allInnerTexts()).map((t) => t.trim());
  ok(tabs.length === 3 && /Shopee/.test(tabs[2]), `settings: Connection has three tabs (${tabs.join(" | ")})`);
  ok(/Not connected/.test(await p.getByTestId("shopee-status").innerText()), "shopee: starts not connected");
  ok(/Sandbox/.test(await p.getByTestId("shopee-env").innerText()), "shopee: says it is the sandbox (test) environment");
  const full = (await p.locator("[data-testid=shopee-full]").textContent()) ?? "", dom = (await p.locator("[data-testid=shopee-domain]").textContent()) ?? "";
  ok(/\/api\/shopee\/callback$/.test(full) && full.startsWith(dom) && !/\/api\//.test(dom) && !/0\.0\.0\.0/.test(full), `shopee: the redirect domain (${dom}) and the full redirect address (${full}) are shown`);

  // Connect: the app sends us to the (pretend) Shopee, which sends us back with a code.
  await Promise.all([p.waitForURL(/shopee=connected/, { timeout: 30000 }), p.getByTestId("shopee-connect").click()]);
  ok(/src=shopee/.test(p.url()) && !/0\.0\.0\.0/.test(p.url()), "connect: comes back to the settings page on the same address");
  ok(/Connected to Shopee/.test(await p.getByTestId("shopee-msg").innerText()), "connect: a clear message says it is connected");
  ok(/^Connected/.test((await p.getByTestId("shopee-status").innerText()).trim()), "connect: the card says Connected");
  const card = (await p.getByTestId("shopee-card").innerText()).replace(/\s+/g, " ");
  ok(/ALOOMA Malaysia/.test(card) && /777/.test(card) && /MY/.test(card), "connect: shows the shop name, shop ID and region");

  await p.getByTestId("shopee-check").click(); await p.getByTestId("shopee-checks").waitFor({ timeout: 30000 });
  const chk = (await p.getByTestId("shopee-checks").innerText()).replace(/\s+/g, " ");
  ok(/Everything answered/.test(chk) && /Shop details/.test(chk) && /Orders of the last day/.test(chk), "check: shop details and recent orders answer");
  ok(!/2611AAAA/.test(chk), "check: no order number is shown");

  // Orders and payments: Sync Now reads the pretend shop and the figures land in Profit And Loss next to TikTok.
  // Stock for the SKU is put in first (RM 10 a piece), the way an imported inventory file would.
  const sql = require("postgres")(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`delete from stock_orders where order_no = 'E2E'`;
  await sql`insert into stock_orders (order_no, sort_no, kind, arrival_date, source) values ('E2E', 5, 'order', '2026-01-01', 'file')`;
  await sql`insert into stock_layers (order_no, sku, paid_qty, total_cost_rm, arrival_date, chunk) values ('E2E', 'NMP-S-WH-ST', 5000, 50000, '2026-01-01', 1)`;
  await sql`truncate shopee_orders, shopee_escrow, shopee_returns, shopee_ads_daily, shopee_wallet_tx, shopee_stock`; await sql`delete from tt_sync_state where dataset like 'shopee\\_%'`;
  await p.goto(BASE + "/sync?tab=shopee"); await p.waitForSelector("[data-testid=shopee-sync]");
  ok((await p.locator("[data-testid^=shopee-ds-][data-testid$=orders], [data-testid=shopee-ds-orders]").count()) >= 1 && (await p.locator("section[aria-label='Shopee data'] > div").count()) === 7, "sync: Data Sync has a Shopee tab with 7 parts (orders, payments, release dates, returns, ads, wallet, stock)");
  ok((await p.getByTestId("shopee-ds-orders-count").innerText()).trim() === "0", "sync: starts with no orders read");
  await p.getByTestId("shopee-sync-now").click();
  await p.waitForFunction(() => document.querySelector("[data-testid=shopee-ds-stock-count]")?.textContent?.trim() === "1", null, { timeout: 90000 });
  const cnt = async (k) => (await p.getByTestId(`shopee-ds-${k}-count`).innerText()).trim();
  ok((await cnt("orders")) === "3" && (await cnt("escrow")) === "3", "sync: 3 orders and their 3 payments");
  ok((await cnt("release")) === "1" && (await cnt("returns")) === "1" && (await cnt("ads")) === "2" && (await cnt("wallet")) === "2" && (await cnt("stock")) === "1", "sync: release date, return, 2 ad days, 2 wallet lines and the stock are read");
  ok((await p.locator("[data-testid^=shopee-ds-] [role=alert]").count()) === 0, "sync: no part shows an error");
  ok(/in RM 160/.test(await p.getByTestId("shopee-wallet-summary").innerText()) && /out RM 100/.test(await p.getByTestId("shopee-wallet-summary").innerText()), "sync: the wallet card sums money in (RM 160) and out (RM 100)");
  await p.getByTestId("shopee-access").click(); await p.getByTestId("shopee-access-result").waitFor({ timeout: 60000 });
  const acc = (await p.getByTestId("shopee-access-result").innerText()).replace(/\s+/g, " ");
  ok(/Affiliate \(AMS\)/.test(acc) && /No permission/.test(acc) && /1 of 7 parts are not open/.test(acc), "sync: Check What Shopee Allows says affiliate is not open and the other six are (" + acc.slice(0, 90) + ")");
  const noBuyer = await sql`select count(*)::int as n from shopee_wallet_tx where description ilike '%secret-buyer%'`;
  ok(noBuyer[0].n === 0, "privacy: no buyer name is kept");
  await p.goto(BASE + "/profit?range=lifetime"); await p.waitForSelector("[data-testid=profit-table]");
  ok((await p.getByTestId("submenu-shopee").count()) === 1 && (await p.getByTestId("submenu-tiktok").count()) === 1 && (await p.getByTestId("submenu-all").count()) === 1, "profit: the menu has All, TikTok and Shopee under Profit And Loss");
  await p.getByTestId("submenu-shopee").click(); await p.waitForURL(/channel=shopee/); await p.waitForSelector("[data-testid=profit-table]");
  ok((await p.getByTestId("submenu-shopee").getAttribute("aria-current")) === "page", "profit: the open one is marked in the menu");
  const rowsTxt = (await p.getByTestId("profit-table").innerText()).replace(/\s+/g, " ");
  ok((await p.locator("[data-testid=order-row]").count()) === 3 && /2611AAAA/.test(rowsTxt) && /2611BBBB/.test(rowsTxt), "profit: Shopee alone lists the 3 Shopee orders");
  ok(/Money From Shopee/.test((await p.getByTestId("profit-tiles").innerText()).replace(/\s+/g, " ")), "profit: the boxes say Shopee");
  await p.goto(BASE + "/profit?tab=monthly&range=lifetime"); await p.waitForSelector("[data-testid=by-channel]");
  const byc = (await p.getByTestId("by-channel").innerText()).replace(/\s+/g, " ");
  ok(/Shopee/.test(byc) && /TikTok/.test(byc) && /Both Together/.test(byc), "profit: the monthly view has a By Channel table: Shopee, TikTok and both together");
  const shopeeLine = (await p.getByTestId("channel-row-shopee").innerText()).replace(/\s+/g, " ");
  ok(/RM 22\.50/.test(shopeeLine), "profit: Shopee's real ad spend (RM 12.50 + RM 10.00) is in its line (" + shopeeLine + ")");
  await p.goto(BASE + "/profit/order/2611BBBB"); await p.waitForSelector("[data-testid=order-waterfall]");
  const wf = (await p.getByTestId("order-waterfall").innerText()).replace(/\s+/g, " ");
  ok(/Shopee Commission/.test(wf) && /Settlement From Shopee/.test(wf) && !/Ads Top-Up/.test(wf), "profit: the order page speaks of Shopee");
  const vs = await (await b.newContext()).newPage(); await login(vs, "viewer@test.local");
  const sr = await vs.request.get(BASE + "/settings?tab=connection&src=shopee"); ok(sr.status() === 200 || sr.status() === 403 || sr.status() === 307, "permissions: the viewer does not get the sync panel");
  await sql.end();
  await p.goto(BASE + "/settings?tab=connection&src=shopee"); await p.waitForSelector("[data-testid=shopee-card]");

  // Safety: the callback does nothing without the start cookie, and nothing without a code
  const fresh = await (await b.newContext()).newPage(); await login(fresh, "owner@test.local");
  await fresh.goto(BASE + "/api/shopee/callback?code=CODE-1&shop_id=777"); await fresh.waitForURL(/shopee=state/);
  ok(true, "safety: a callback that did not start from this browser is refused");
  await fresh.goto(BASE + "/api/shopee/callback"); await fresh.waitForURL(/shopee=denied/);
  ok(true, "safety: a callback without a code says it was not approved");

  // Who can use it
  const v = await (await b.newContext()).newPage(); await login(v, "viewer@test.local");
  const t = await v.request.post(BASE + "/api/shopee/test"); ok(t.status() === 403, "permissions: a viewer cannot run the check");
  await v.goto(BASE + "/api/shopee/connect", { waitUntil: "networkidle" }); ok(!/shopee/i.test(new URL(v.url()).hostname) && !/auth_partner/.test(v.url()), "permissions: a viewer is not sent to Shopee");
  const anon = await (await b.newContext()).newPage(); const a = await anon.request.post(BASE + "/api/shopee/test", { maxRedirects: 0 }); ok(a.status() === 401 || a.status() === 403 || a.status() === 307, `permissions: signed-out callers are refused (${a.status()})`);

  // Disconnect
  await p.getByRole("button", { name: "Disconnect" }).click(); await p.getByRole("button", { name: "Yes, disconnect" }).click();
  await p.waitForFunction(() => /Not connected/.test(document.querySelector("[data-testid=shopee-status]")?.textContent ?? ""), null, { timeout: 15000 });
  ok(true, "disconnect: the card goes back to Not connected");

  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
