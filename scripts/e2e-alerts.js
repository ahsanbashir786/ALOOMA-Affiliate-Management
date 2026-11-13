/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Settings → System Alerts. Needs the app on :3100 and the demo users (scripts/seed-creators-demo.ts).
// Run scripts/test-alerts.ts first is not needed; any earlier alerts and errors are cleared by the test itself.
const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
async function login(p, email) {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
}
const bell = async (p) => (await p.getByTestId("alert-bell-count").count()) ? Number((await p.getByTestId("alert-bell-count").innerText()).replace("+", "")) : 0;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await login(p, "owner@test.local");

  await p.goto(BASE + "/settings?tab=alerts"); await p.waitForSelector("[data-testid=alerts-panel]");
  const tiles = (await p.getByTestId("health-tiles").innerText()).replace(/\s+/g, " ");
  ok(/Connections/.test(tiles) && /Data Sync/.test(tiles) && /Server/.test(tiles) && /App Errors/.test(tiles), "alerts: four health tiles (Connections, Data Sync, Server, App Errors)");
  ok((await p.getByTestId("alert-bell").count()) === 1, "bell: shows in the top bar for the owner");

  // Clear earlier test errors, then make a browser error and a server error
  for (const c of await p.locator("[data-testid=alert-card]").all()) { if (await c.getByTestId("alert-clear").count()) await c.getByTestId("alert-clear").click(); }
  const r = await p.request.post(BASE + "/api/alerts/client-error", { data: { message: "Boom 4321 in the stock screen", stack: "Error: Boom\n at x", page: "/stock" } });
  ok(r.status() === 200, "client error: a signed-in person's browser error is accepted");
  await p.reload(); await p.getByTestId("alerts-check").click(); await p.waitForTimeout(1500); await p.reload();
  const cards = (await p.locator("[data-testid=alert-card]").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  ok(cards.some((t) => /Browser error on \/stock/.test(t) && /Boom/.test(t) && /What to do/.test(t) && /Critical|Warning/.test(t)), "alerts: the browser error appears with what to do (" + cards.map((c) => c.slice(0, 50)).join(" | ") + ")");
  const n0 = await bell(p);
  ok(n0 >= 1, `bell: shows how many alerts are waiting (${n0})`);
  ok(/problem/.test((await p.getByTestId("health-errors").innerText())), "alerts: the App Errors tile shows the problem");

  // Seen
  await p.locator("[data-testid=alert-card]").first().getByTestId("alert-seen").click(); await p.waitForTimeout(800); await p.reload();
  ok((await bell(p)) === n0 - 1, "seen: the bell count goes down by one, the alert stays listed");
  ok((await p.locator("[data-testid=alert-card]", { hasText: "Seen" }).count()) >= 1, "seen: the alert is still in the list, marked Seen");

  // Clear every error
  for (let i = 0; i < 6; i++) { const c = p.locator("[data-testid=alert-card]", { has: p.getByTestId("alert-clear") }).first(); if (!(await c.count())) break; await c.getByTestId("alert-clear").click(); await p.waitForTimeout(700); await p.reload(); }
  ok((await p.locator("[data-testid=alert-card]", { hasText: "error on" }).count()) === 0, "clear: cleared errors disappear");
  ok(/Recently resolved/.test(await p.getByTestId("alerts-resolved").innerText().catch(() => "")), "clear: they move to Recently resolved");

  // Report
  const rep = await p.request.get(BASE + "/api/alerts/report"); const txt = await rep.text();
  ok(rep.status() === 200 && /ALOOMA SYSTEM REPORT/.test(txt) && /CONNECTIONS/.test(txt) && /SERVER/.test(txt) && /LATEST APP ERRORS/.test(txt), "report: the diagnostic report has connections, server and errors");
  ok(!/password|secret/i.test(txt), "report: no secrets in it");
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await p.getByTestId("alerts-report").click(); await p.waitForTimeout(800);
  ok(/Copied|Could not copy/.test(await p.getByTestId("alerts-report").innerText()), "report: the copy button reports what happened");

  // Who can see it
  const v = await (await b.newContext()).newPage(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/settings?tab=alerts"); await v.waitForLoadState("networkidle");
  ok(/permission/i.test(await v.locator("main").innerText()), "viewer: cannot open System Alerts");
  ok((await v.getByTestId("alert-bell").count()) === 0, "viewer: has no bell");
  ok((await v.request.get(BASE + "/api/alerts/report")).status() === 403, "viewer: cannot download the report");
  const anon = await (await b.newContext()).newPage();
  ok((await anon.request.post(BASE + "/api/alerts/client-error", { data: { message: "x" } })).status() === 401, "signed out: a browser error report is refused");
  ok((await p.request.post(BASE + "/api/alerts/client-error", { data: { nope: 1 } })).status() === 400, "client error: a report without a message is refused");

  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
