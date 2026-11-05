/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check for Products. Run: node scripts/e2e-products.js (app on :3100, demo data seeded)
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [label, vp] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const p = await (await b.newContext({ viewport: vp })).newPage();
    p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); });
    await p.goto("http://localhost:3100/login"); await p.fill("input[name=email]", "manager@test.local"); await p.fill("input[name=password]", "Passw0rd!test");
    await Promise.all([p.waitForURL(/\/(command|today|$)/), p.click("button[type=submit]")]);
    await p.goto("http://localhost:3100/products"); await p.waitForTimeout(1500);
    const cards = await p.$$eval('a[href^="/products/"]', (a) => [...new Set(a.map((x) => x.getAttribute("href")))]);
    ok(cards.length === 13, `${label}: 13 product cards`);
    ok(await p.getByText("Mattress Protector · Non-Waterproof").first().isVisible(), `${label}: first product in owner's order`);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${label}: list has no sideways scroll`);
    if (label === "desktop") {
      await p.getByRole("link", { name: /^Slipping \d/ }).first().click(); await p.waitForTimeout(1200);
      ok(/tag=Slipping/.test(p.url()), "filter: Slipping lands in the URL");
    }
    await p.goto("http://localhost:3100/products/mp_wp"); await p.waitForTimeout(1500);
    for (const t of ["Why Is It", "Where The Change Came From", "Content Freshness", "Are New Videos Converting?", "Samples", "Quality", "Top Content"])
      ok(await p.getByText(t).first().isVisible(), `${label}: detail section ${t}`);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${label}: detail has no sideways scroll`);
    if (label === "desktop") {
      errs.length = 0;
      const r = await p.goto("http://localhost:3100/products/nope"); ok(r.status() === 404, "unknown product is a 404"); errs.length = 0;
    }
  }
  ok(errs.length === 0, "no browser errors"); if (errs.length) console.log(errs);
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
