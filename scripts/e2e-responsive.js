/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Every screen at phone, tablet and desktop width: nothing may push the page sideways, and on a phone tables must turn into cards.
// Needs the app on :3100 and the demo users (scripts/seed-creators-demo.ts). Screenshots of the phone views go to SHOTS (default /tmp/claude-0/shots/resp).
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:3100";
const SHOTS = process.env.SHOTS || "/tmp/claude-0/shots/resp";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
const ROUTES = [
  ["execution", "/execution"], ["creators", "/creators"], ["products", "/products"], ["ads", "/ads"],
  ["profit-orders", "/profit?range=lifetime"], ["profit-monthly", "/profit?tab=monthly"], ["profit-claims", "/profit?tab=claims"], ["profit-costs", "/profit?tab=costs"],
  ["stock", "/stock"], ["stock-orders", "/stock?tab=orders"], ["stock-bundles", "/stock?tab=bundles"], ["stock-import", "/stock?tab=import"],
  ["sync", "/sync"], ["sync-ads", "/sync?tab=ads"],
  ["settings-shop", "/settings?tab=connection&src=shop"], ["settings-ads", "/settings?tab=connection&src=ads"], ["settings-shopee", "/settings?tab=connection&src=shopee"],
  ["settings-users", "/settings?tab=users"], ["settings-storage", "/settings?tab=storage"], ["settings-alerts", "/settings?tab=alerts"],
];
const SIZES = [["phone", 390, 844], ["tablet", 820, 1100], ["desktop", 1440, 900]];
async function login(p, email) {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
}
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch(); const errs = [];
  for (const [sname, w, h] of SIZES) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: sname === "phone" ? 2 : 1 })).newPage();
    p.on("pageerror", (e) => errs.push(`${sname}: ${e.message}`));
    await login(p, "owner@test.local");
    for (const [name, url] of ROUTES) {
      await p.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {}); await p.waitForTimeout(350);
      const m = await p.evaluate(() => {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll("main *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > de.clientWidth + 1 && !el.closest("[data-scroll],table,.overflow-x-auto,[class*=overflow-]"); }).slice(0, 3).map((el) => el.tagName + "." + String(el.className).slice(0, 60));
        const tables = [...document.querySelectorAll("main table")].filter((t) => t.offsetParent !== null).map((t) => ({ display: getComputedStyle(t).display, labelled: t.querySelectorAll("td[data-label]").length }));
        return { over: de.scrollWidth - de.clientWidth, wide, tables };
      });
      ok(m.over <= 1, `${sname} ${name}: no sideways scrolling${m.over > 1 ? ` (${m.over}px over; ${m.wide.join(" | ")})` : ""}`);
      if (sname === "phone" && m.tables.length) ok(m.tables.every((t) => t.display === "block"), `phone ${name}: tables turn into cards (${m.tables.length})`);
      if (sname === "phone") await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
    }
  }
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
