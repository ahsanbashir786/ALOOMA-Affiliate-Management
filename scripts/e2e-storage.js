/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Settings → Storage. Needs the app on :3100 and the demo users (scripts/seed-creators-demo.ts).
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
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await login(p, "owner@test.local");
  await p.goto(BASE + "/settings?tab=storage"); await p.waitForSelector("[data-testid=storage-panel]");
  const txt = (await p.getByTestId("storage-panel").innerText()).replace(/\s+/g, " ");
  ok(/Server Disk Total/.test(txt) && /Used/.test(txt) && /Free/.test(txt) && /This Software Uses/.test(txt), "storage: total, used, free and what the software uses");
  ok(/\d+(\.\d)? (GB|TB|MB)/.test(txt), "storage: sizes are readable (GB, MB)");
  const srv = (await p.getByTestId("server-tiles").innerText()).replace(/\s+/g, " ");
  ok(/Memory \(RAM\)/.test(srv) && /vCPU/.test(srv) && /Data Transfer This Month/.test(srv) && /Server Running For/.test(srv), "storage: memory, vCPU, data transfer and running time tiles");
  const legend = (await p.getByTestId("storage-legend").innerText()).replace(/\s+/g, " ");
  ok(/Database \(your data\)/.test(legend) && /Backups/.test(legend) && /Everything else on the server/.test(legend) && /Free/.test(legend), "storage: the bar legend names the parts");
  ok((await p.locator("[data-testid=storage-tables] tbody tr").count()) >= 5, "storage: the biggest tables are listed");
  ok((await p.locator("[data-testid=storage-backups] tbody tr").count()) >= 1, "storage: the backups are listed");
  const w = await p.getByTestId("storage-bar").evaluate((el) => [...el.children].reduce((s, c) => s + c.getBoundingClientRect().width, 0) / el.getBoundingClientRect().width);
  ok(w > 0.97 && w < 1.03, `storage: the bar adds up to the whole disk (${(w * 100).toFixed(1)}%)`);
  const v = await (await b.newContext()).newPage(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/settings?tab=storage"); await v.waitForLoadState("networkidle");
  ok(/permission/i.test(await v.locator("main").innerText()), "viewer: cannot open Storage");
  await p.screenshot({ path: "/tmp/claude-0/shots/storage.png" });
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
