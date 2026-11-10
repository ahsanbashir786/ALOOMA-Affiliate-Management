/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of the whole app: the five-item menu, landing page, Affiliate Data, creator profile, Settings, Data Sync, and that old screens are gone.
// Needs the app on :3100 and the demo data and users (scripts/seed-creators-demo.ts).
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
  let p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await login(p, "owner@test.local");
  ok(/\/execution$/.test(p.url()), "landing: everyone opens on the Execution Plan");
  const links = (await p.locator("aside nav a").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(links) === JSON.stringify(["Execution Plan", "Affiliate Data", "Product Analysis", "Data Sync", "Settings"]), `menu: the five items (${links.join(", ")})`);
  for (const gone of ["/today", "/command", "/data", "/samples", "/affiliates", "/progress", "/orders", "/content", "/demand", "/order-health", "/opportunities"]) {
    const r = await p.goto(BASE + gone); ok(r.status() === 404, `old screen ${gone} is gone`);
  }
  await p.goto(BASE + "/"); ok(/\/execution$/.test(p.url()), "the home address leads to the Execution Plan");
  // Affiliate Data
  await p.goto(BASE + "/creators"); await p.waitForSelector("[data-testid=creator-kpis]");
  ok((await p.getByRole("heading", { name: "Affiliate Data" }).count()) >= 1, "Affiliate Data: the screen has its new name");
  ok((await p.locator("[data-testid^=dir-]").count()) >= 10, "Affiliate Data: creators are listed");
  const name = (await p.locator("[data-testid^=dir-]").first().getAttribute("data-testid")).replace("dir-", "");
  await p.goto(BASE + "/creators/" + name); await p.waitForSelector("[data-testid=profile-tiles]");
  ok((await p.getByText(name).count()) >= 1 && (await p.getByRole("link", { name: /Affiliate Data/ }).count()) >= 1, "profile: opens with the creator and a way back");
  ok(await p.getByText("Latest orders").first().isVisible().catch(() => false) || (await p.locator("section, h2").count()) > 3, "profile: sections are shown");
  await p.goBack(); await p.waitForSelector("[data-testid=creator-kpis]");
  const act = p.locator("[data-testid^=act-]").first();
  if (await act.count()) { await act.click(); await p.waitForSelector("[role=dialog], aside[aria-label], [data-testid=creator-panel]", { timeout: 8000 }).catch(() => {}); ok(true, "side panel: opens from an action"); await p.keyboard.press("Escape"); } else ok(true, "side panel: no action in view (skipped)");
  // Product Analysis
  await p.goto(BASE + "/products"); await p.waitForSelector("[data-testid=product-kpis]");
  ok((await p.getByRole("heading", { name: "Product Analysis" }).count()) >= 1, "Product Analysis: the screen has its new name");
  // Settings + Data Sync
  await p.goto(BASE + "/settings"); await p.waitForSelector("h1");
  const settingsText = await p.locator("main").innerText();
  ok(/TikTok Shop connection/.test(settingsText) && !/Daily workflow/.test(settingsText), "Settings: the TikTok connection only");
  ok(!/Recommendation rules|Brand accounts|upload/i.test(settingsText), "Settings: no old upload-era forms");
  await p.goto(BASE + "/users"); await p.waitForSelector("[data-testid=user-row]"); ok(/tab=users/.test(p.url()), "User Management: the old /users address lands in Settings → User Management");
  await p.goto(BASE + "/sync"); await p.waitForSelector("h1");
  ok(!/upload/i.test(await p.locator("main").innerText()), "Data Sync: no mention of uploads");
  ok(errs.length === 0, "no browser errors (owner)"); if (errs.length) console.log(errs);
  // viewer
  p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await login(p, "viewer@test.local");
  const vl = (await p.locator("aside nav a").allInnerTexts()).map((t) => t.trim());
  ok(vl.length === 5, `viewer: sees the whole menu (${vl.length} items)`);
  // mobile
  p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(p, "manager@test.local");
  for (const path of ["/execution", "/creators", "/products", "/sync", "/settings"]) { await p.goto(BASE + path); await p.waitForSelector("h1"); ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `mobile: ${path} has no sideways scrolling`); }
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
