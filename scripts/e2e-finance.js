/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of the Finance screen. Needs the app on :3100, the demo users (scripts/seed-creators-demo.ts) and finance demo rows (npx tsx scripts/seed-finance-cli.ts).
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
  const mk = async (vp = { width: 1440, height: 1100 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
  const o = await mk(); await login(o, "owner@test.local");
  ok((await o.locator("nav a", { hasText: "Finance" }).count()) > 0, "menu: Finance is in the menu");
  await o.goto(BASE + "/finance"); await o.waitForSelector("[data-testid=fin-cash]");
  const tabs = (await o.locator("nav[aria-label='Finance sections'] a").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(tabs) === JSON.stringify(["Money Released", "Profit And Loss", "Not Paid Yet"]), `finance: the three tabs (${tabs.join(", ")})`);
  const t = await o.getByTestId("fin-cash").innerText();
  ok(/Paid To You/.test(t) && /Settled By TikTok/.test(t) && /On Its Way/.test(t) && /Not Settled Yet/.test(t), "money released: four money tiles");
  ok(/RM [\d,]+\.\d\d/.test(await o.getByTestId("fin-paid").innerText()), "money released: paid to you is a real amount");
  ok(await o.getByTestId("fin-chart").isVisible() && (await o.locator("[data-testid=fin-chart] .recharts-bar-rectangle").count()) > 5, "money released: a bar for each daily statement");
  ok((await o.getByTestId("fin-statement-row").count()) > 10 && /Paid/.test(await o.getByTestId("fin-statements").innerText()) && /On Its Way/.test(await o.getByTestId("fin-statements").innerText()) && /Payment Failed/.test(await o.getByTestId("fin-statements").innerText()), "money released: the statements with Paid, On Its Way and Payment Failed");
  ok((await o.getByTestId("fin-failed").count()) === 1, "money released: a failed payment is called out");
  ok(!(await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "money released: no sideways scroll on desktop");
  // date range
  await o.getByTestId("ads-range").click(); await o.getByTestId("ads-range-7d").click(); await Promise.all([o.waitForURL(/range=7d/), o.getByTestId("ads-range-confirm").click()]); await o.waitForSelector("[data-testid=fin-cash]");
  ok((await o.getByTestId("fin-statement-row").count()) <= 8 && (await o.getByTestId("fin-statement-row").count()) >= 6, "money released: the date range changes the statements");
  // profit and loss
  await o.getByTestId("fin-tab-pnl").click(); await o.waitForSelector("[data-testid=fin-pnl]");
  ok(/range=7d/.test(o.url()), "profit and loss: the date range follows to the next tab");
  const pt = await o.getByTestId("fin-pnl").innerText();
  ok(/Revenue/.test(pt) && /TikTok Commission/.test(pt) && /Affiliate Commission/.test(pt) && /Shipping/.test(pt) && /What TikTok Pays You/.test(pt) && /Cost Of Products Sold/.test(pt) && /Not set up yet/.test(pt), "profit and loss: revenue, fees, shipping, settlement and the product cost line");
  ok(/Adds up to TikTok/.test(await o.getByTestId("fin-reconcile").innerText()), "profit and loss: it says the lines add up to TikTok's settlement");
  ok(await o.getByTestId("fin-waterfall").isVisible(), "profit and loss: the sales-to-profit waterfall");
  ok(/already took/.test(await o.getByTestId("fin-ads-switch").innerText()), "profit and loss: it explains the GMV Max fee already inside the settlement");
  const before = await o.getByTestId("fin-profit").innerText();
  await o.getByTestId("fin-ads-switch").getByText("Count It").click(); await o.waitForURL(/ads=in/); await o.waitForSelector("[data-testid=fin-pnl]");
  ok((await o.getByTestId("fin-profit").innerText()) !== before, "profit and loss: choosing Count It changes the profit");
  // not paid yet
  await o.getByTestId("fin-tab-pending").click(); await o.waitForSelector("[data-testid=fin-pending]");
  ok((await o.getByTestId("fin-unpaid-row").count()) === 12 && /Waiting for the return period/.test(await o.getByTestId("fin-pending").innerText()), "not paid yet: the unpaid orders and why");
  ok((await o.getByTestId("ads-range").count()) === 0, "not paid yet: no date picker (it is the state right now)");
  // access
  const v = await mk(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/finance"); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, "viewer: Finance is Permission Denied");
  // mobile
  const mo = await mk({ width: 390, height: 844 }); await login(mo, "owner@test.local");
  for (const tb of ["cash", "pnl", "pending"]) { await mo.goto(BASE + "/finance?tab=" + tb); await mo.waitForSelector("h1"); await mo.waitForTimeout(500); ok(!(await mo.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `mobile: finance ${tb} has no sideways scrolling`); }
  ok(errs.length === 0, "no browser errors"); if (errs.length) console.log(errs);
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
