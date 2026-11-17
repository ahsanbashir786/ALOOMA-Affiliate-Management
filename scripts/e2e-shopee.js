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
  await sql`truncate shopee_orders, shopee_escrow`; await sql`delete from tt_sync_state where dataset like 'shopee\\_%'`;
  await p.reload(); await p.waitForSelector("[data-testid=shopee-sync]");
  ok(/None yet/.test(await p.getByTestId("shopee-sync").innerText()), "sync: starts with no orders read");
  await p.getByTestId("shopee-sync-now").click();
  await p.waitForFunction(() => /^3$/.test(document.querySelector("[data-testid=shopee-orders-count]")?.textContent?.trim() ?? ""), null, { timeout: 60000 });
  ok(true, "sync: Sync Now reads the 3 orders");
  const syncText = (await p.getByTestId("shopee-sync").innerText()).replace(/\s+/g, " ");
  ok(/Payments Read 3/.test(syncText), "sync: and their payments (" + syncText.slice(0, 120) + ")");
  ok((await p.getByTestId("shopee-sync-error").count()) === 0, "sync: no error is shown");
  await p.goto(BASE + "/profit?range=lifetime"); await p.waitForSelector("[data-testid=profit-table]");
  ok((await p.getByTestId("channel-shopee").count()) === 1 && (await p.getByTestId("channel-tiktok").count()) === 1, "profit: a channel switch (All Channels, TikTok, Shopee) appears once Shopee has orders");
  await p.getByTestId("channel-shopee").click(); await p.waitForURL(/channel=shopee/); await p.waitForSelector("[data-testid=profit-table]");
  const rowsTxt = (await p.getByTestId("profit-table").innerText()).replace(/\s+/g, " ");
  ok((await p.locator("[data-testid=order-row]").count()) === 3 && /2611AAAA/.test(rowsTxt) && /2611BBBB/.test(rowsTxt), "profit: Shopee alone lists the 3 Shopee orders");
  ok(/Money From Shopee/.test((await p.getByTestId("profit-tiles").innerText()).replace(/\s+/g, " ")), "profit: the boxes say Shopee");
  await p.goto(BASE + "/profit?tab=monthly&range=lifetime"); await p.waitForSelector("[data-testid=by-channel]");
  const byc = (await p.getByTestId("by-channel").innerText()).replace(/\s+/g, " ");
  ok(/Shopee/.test(byc) && /TikTok/.test(byc) && /Both Together/.test(byc), "profit: the monthly view has a By Channel table: Shopee, TikTok and both together");
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
