/* eslint-disable @typescript-eslint/no-require-imports */
// How fast do the screens open? Needs the app running and the demo users.
//   node scripts/perf-pages.js [baseUrl]        (default http://localhost:3100)
// "Open directly" = from the request to the screen's title showing. "Click" = from clicking a menu item to the new title showing.
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:3100";
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.addInitScript(() => {
    window.__titleAt = null; window.__from = null; window.__prev = null;
    new MutationObserver(() => {
      const h = document.querySelector("h1"); if (!h) return;
      if (window.__from == null) { if (window.__titleAt == null) window.__titleAt = Math.round(performance.now()); }
      else if (h.textContent !== window.__prev) { window.__titleAt = Math.round(performance.now() - window.__from); window.__from = null; }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", "manager@test.local"); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
  const pages = [["Execution Plan", "/execution"], ["Affiliate Data", "/creators"], ["Product Analysis", "/products"], ["Product detail", "/products/mp_wp"], ["Data Sync", "/sync"], ["Settings", "/settings"]];
  console.log(`Open a screen directly (ms to title, median of 5) – ${BASE}`);
  for (const [name, path] of pages) {
    const ts = [];
    for (let i = 0; i < 6; i++) { await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForFunction(() => window.__titleAt != null); ts.push(await p.evaluate(() => window.__titleAt)); }
    console.log(`  ${name.padEnd(18)} ${median(ts.slice(1))}`);
  }
  console.log("Click a menu item (ms from click to the new title, median of 5):");
  const items = [["Affiliate Data", /^\s*(Creators|Affiliate Data)\s*$/], ["Product Analysis", /^\s*(Products|Product Analysis)\s*$/], ["Data Sync", /^\s*Data Sync\s*$/], ["Execution Plan", /^\s*Execution Plan\s*$/]];
  await p.goto(BASE + "/execution"); await p.waitForSelector("h1");
  const res = Object.fromEntries(items.map(([n]) => [n, []]));
  for (let round = 0; round < 6; round++) for (const [name, rx] of items) {
    await p.evaluate(() => { window.__prev = document.querySelector("h1")?.textContent ?? null; window.__titleAt = null; window.__from = performance.now(); });
    await p.locator("aside a").filter({ hasText: rx }).first().click();
    await p.waitForFunction(() => window.__titleAt != null, null, { timeout: 15000 });
    if (round > 0) res[name].push(await p.evaluate(() => window.__titleAt));
    await p.waitForTimeout(250);
  }
  for (const [name] of items) console.log(`  ${name.padEnd(18)} ${median(res[name])}`);
  await b.close();
})();
