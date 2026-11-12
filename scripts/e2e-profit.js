/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Profit And Loss and the new stock-in order form. Run scripts/test-profit.ts first (it leaves the pretend orders and finance records),
// then start the app on :3100 with the demo users (scripts/seed-creators-demo.ts).
const { chromium } = require("playwright");
const ExcelJS = require("exceljs");
const fs = require("fs"), os = require("os"), path = require("path");
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
async function login(p, email) {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await login(p, "owner@test.local");

  // ── Order Profit
  await p.goto(BASE + "/profit?range=all"); await p.waitForSelector("[data-testid=profit-table]");
  ok((await p.locator("[data-testid=order-row]").count()) === 6, "orders: six orders (the cancelled one is left out)");
  const tiles = (await p.getByTestId("profit-tiles").innerText()).replace(/\s+/g, " ");
  ok(/Net Profit RM 80/.test(tiles) && /Profit Before Ads RM 130/.test(tiles), "orders: tiles show profit before ads RM 130 and net profit RM 80 (" + tiles.slice(0, 160) + ")");
  ok(/no money data/.test(await p.getByTestId("profit-warnings").innerText()), "orders: the order with no money data is warned about");
  await p.selectOption("select[name=money]", "estimate"); await p.getByRole("button", { name: "Filter" }).click(); await p.waitForURL(/money=estimate/);
  ok((await p.locator("[data-testid=order-row]").count()) === 1, "orders: the money filter narrows to the estimate");
  await p.goto(BASE + "/profit?range=all&sort=low"); await p.waitForSelector("[data-testid=order-row]");
  ok(/S1/.test(await p.locator("[data-testid=order-row]").first().innerText()), "orders: lowest profit first puts the sample first");
  await p.goto(BASE + "/profit?range=lifetime"); await p.waitForSelector("[data-testid=profit-table]");
  ok(/Lifetime/.test(await p.getByTestId("ads-range-label").innerText()), "orders: the shared calendar button is at the top right and says Lifetime");
  await p.getByTestId("ads-range").click(); await p.getByTestId("ads-range-last_month").click(); await p.getByTestId("ads-range-confirm").click(); await p.waitForURL(/range=last_month/);
  ok(/Last month/.test(await p.getByTestId("ads-range-label").innerText()), "orders: choosing Last month in the calendar changes the period");

  // ── Order detail
  await p.goto(BASE + "/profit?range=all"); await p.getByRole("link", { name: "P2", exact: true }).click(); await p.waitForSelector("[data-testid=order-waterfall]");
  const w = (await p.getByTestId("order-waterfall").innerText()).replace(/\s+/g, " ");
  ok(/Settlement From TikTok RM 49\.50/.test(w) && /Profit Before Ads.*RM 27\.10/.test(w), "detail: the money waterfall ends at settlement RM 49.50 and profit RM 27.10");
  ok(/Reimbursements RM 5\.00/.test(w) && /Deductions \(Adjustments\) -RM 3\.00/.test(w), "detail: reimbursement and deduction are split out");
  ok(/A ×2/.test(await p.getByTestId("order-cost-lines").innerText()), "detail: the cost lines say which stock the pieces came from");

  // ── Monthly
  await p.goto(BASE + "/profit?tab=monthly"); await p.waitForSelector("[data-testid=monthly-table]");
  const rows = (await p.locator("[data-testid=month-row]").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  ok(rows.length === 2 && /2026-02/.test(rows[0]) && /2026-01.*RM 68\.50/.test(rows[1]), "monthly: February then January, January net RM 68.50 (" + rows.join(" | ").slice(0, 120) + ")");
  ok(/RM 80\.30/.test(await p.getByTestId("monthly-table").innerText()), "monthly: the total row adds the months (RM 80.30)");
  await p.goto(BASE + "/profit?tab=monthly&from=2026-01-01&to=2026-01-31"); await p.waitForSelector("[data-testid=monthly-table]");
  ok((await p.locator("[data-testid=month-row]").count()) === 1, "monthly: chosen dates show only that month");

  // ── Claim back
  await p.goto(BASE + "/profit?tab=claims"); await p.waitForSelector("[data-testid=claims-table]");
  await p.locator("[data-testid=claim-row] select[aria-label=Status]").selectOption("recovered");
  await p.waitForFunction(() => /Recovered/.test(document.querySelector("[data-testid=claim-row]")?.textContent ?? "") && !!document.querySelector("[data-testid=claim-row] span"), null, { timeout: 8000 });
  await p.reload(); await p.waitForSelector("[data-testid=claims-table]");
  ok((await p.locator("[data-testid=claim-row] select[aria-label=Status]").inputValue()) === "recovered", "claims: the status is remembered after reload");
  ok(/RM 3 .*items?/.test((await p.getByTestId("claim-tiles").innerText()).replace(/\s+/g, " ")), "claims: the amount moved to Recovered");
  ok(/Shipping Fee Adjustment/.test(await p.getByTestId("claim-types").innerText()), "claims: every adjustment type is listed");

  // ── Fulfilment
  await p.goto(BASE + "/profit?tab=costs"); await p.waitForSelector("[data-testid=invoice-table]");
  await p.getByLabel("Fulfilment per piece").fill("2"); await p.getByRole("button", { name: "Save" }).click(); await p.getByTestId("fulfilment-msg").waitFor();
  ok(/Saved/.test(await p.getByTestId("fulfilment-msg").innerText()), "fulfilment: the per-piece rate saves");
  await p.goto(BASE + "/profit?range=all"); await p.waitForSelector("[data-testid=profit-table]");
  ok(/Fulfilment RM 22/.test((await p.getByTestId("profit-tiles").innerText()).replace(/\s+/g, " ")), "fulfilment: 11 pieces counted at RM 2 = RM 22 flow into the orders");
  await p.goto(BASE + "/profit?tab=costs"); await p.getByLabel("Fulfilment per piece").fill("1.2"); await p.getByRole("button", { name: "Save" }).click(); await p.getByTestId("fulfilment-msg").waitFor();
  const inv = p.getByLabel("Invoice 2026-01"); await inv.fill("100"); await inv.blur(); await p.waitForTimeout(800);
  await p.reload(); await p.waitForSelector("[data-testid=invoice-table]");
  ok((await p.getByLabel("Invoice 2026-01").inputValue()) === "100", "fulfilment: a real invoice is remembered");
  const inv2 = p.getByLabel("Invoice 2026-01"); await inv2.fill(""); await inv2.blur(); await p.waitForTimeout(800);

  // ── Excel
  await p.goto(BASE + "/profit?range=all");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("export-orders").click()]);
  const f = path.join(os.tmpdir(), "profit-export.xlsx"); await dl.saveAs(f);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); const ws = wb.worksheets[0];
  ok(ws.rowCount === 7 && ws.getRow(1).getCell(21).value === "Profit Before Ads", "excel: a header and six orders");

  // ── New stock-in order
  const tmp = path.join(os.tmpdir(), "o31.xlsx");
  const nb = new ExcelJS.Workbook(); const ns = nb.addWorksheet("S"); ns.addRow(["SKU", "Paid Qty", "Free Qty", "Unit Price RMB"]); ns.addRow(["X", 10, 2, 16.5]); await nb.xlsx.writeFile(tmp);
  await p.goto(BASE + "/stock?tab=import"); await p.waitForSelector("[data-testid=new-order]");
  const card = p.getByTestId("new-order");
  await card.locator("input[name=orderNo]").fill("31"); await card.locator("input[name=rate]").fill("1.65"); await card.locator("input[name=freight]").fill("150");
  await card.locator("input[name=arrival]").fill("2026-03-20"); await card.locator("input[name=file]").setInputFiles(tmp);
  await card.getByRole("button", { name: "Add Order" }).click(); await p.getByTestId("new-order-result").waitFor({ timeout: 20000 });
  const res = (await p.getByTestId("new-order-result").innerText()).replace(/\s+/g, " ");
  ok(/Order 31 added/.test(res) && /landed cost RM 250/.test(res), "new order: added, landed cost RM 250 (" + res.slice(0, 150) + ")");
  await card.locator("input[name=orderNo]").fill("31"); await card.locator("input[name=rate]").fill("1.65"); await card.locator("input[name=freight]").fill("150"); await card.locator("input[name=arrival]").fill("2026-03-20"); await card.locator("input[name=file]").setInputFiles(tmp);
  await card.getByRole("button", { name: "Add Order" }).click(); await p.waitForFunction(() => /already exists/.test(document.querySelector("[data-testid=new-order-result]")?.textContent ?? ""), null, { timeout: 15000 });
  ok(true, "new order: the same number twice is refused");
  await p.goto(BASE + "/stock?tab=orders"); await p.waitForSelector("[data-testid=orders-table]");
  ok(/Order 31/.test(await p.getByTestId("orders-table").innerText()), "new order: it is in the Stock-In Orders list");
  await p.getByLabel("Remove order 31").click(); await p.getByRole("button", { name: "Yes" }).click();
  await p.waitForFunction(() => !/Order 31/.test(document.querySelector("[data-testid=orders-table]")?.textContent ?? ""), null, { timeout: 10000 });
  ok(true, "new order: it can be removed (asks first)");
  ok(!(await p.getByLabel("Remove order A").count()), "new order: the first 30 orders have no remove button");
  const tp = await (await b.newContext()).newPage(); const t = await tp.request.get(BASE + "/api/stock/template");
  ok(t.status() === 401, "template: needs sign-in");

  // ── Permissions
  const v = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/profit"); await v.waitForLoadState("networkidle");
  ok(/permission/i.test(await v.locator("main").innerText()), "viewer: cannot open Profit And Loss");
  const ex = await v.request.get(BASE + "/api/profit/export"); ok(ex.status() === 403, "viewer: cannot download the export");

  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
