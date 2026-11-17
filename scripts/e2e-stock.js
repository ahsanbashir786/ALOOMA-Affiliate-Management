/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Stock And Costing: imports the real files through the screen, then reads the tabs.
// Needs empty stock tables (run it before scripts/test-profit.ts, which leaves a few pretend orders), the app on :3100, the demo users (scripts/seed-creators-demo.ts) and STOCK_FILES = a folder with the owner's files.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = "http://localhost:3100";
const DIR = process.env.STOCK_FILES;
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
const file = (re) => path.join(DIR, fs.readdirSync(DIR).find((n) => re.test(n)));
(async () => {
  if (!DIR) { console.error("Set STOCK_FILES"); process.exit(1); }
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", "owner@test.local"); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);

  await p.goto(BASE + "/stock?tab=import");
  const up = async (kind, files) => {
    const card = p.getByTestId(`import-${kind}`);
    await card.locator("input[type=file]").setInputFiles(files);
    await card.getByRole("button", { name: /Import/ }).click();
    await p.getByTestId(`import-result-${kind}`).waitFor({ timeout: 30000 });
    return (await p.getByTestId(`import-result-${kind}`).innerText()).replace(/\s+/g, " ");
  };
  let t = await up("skus", file(/List_of_SKU_Single_Items_Latest\.xlsx$/)); ok(/SKU list saved/.test(t), "import: SKU list (" + t + ")");
  t = await up("bundles", fs.readdirSync(DIR).filter((n) => /SKU_SETS_BOM\.xlsx$/.test(n)).map((n) => path.join(DIR, n))); ok(/Bundles saved/.test(t), "import: bundle lists (" + t + ")");
  ok((await p.getByTestId("import-costing").count()) + (await p.getByTestId("import-dates").count()) + (await p.getByTestId("import-opening").count()) === 0, "import: the old costing, dates and opening stock cards are gone");
  t = await up("inventory", file(/Total_Inventory_Data\.xlsx$/)); ok(/35 orders/.test(t) && /242,307|242\.307/.test(t), "import: the inventory file (" + t + ")");
  // a wrong file is refused with a clear message and nothing breaks
  const card = p.getByTestId("import-inventory");
  await card.locator("input[type=file]").setInputFiles(file(/List_of_SKU_Single_Items_Latest\.xlsx$/)); await card.getByRole("button", { name: /Import/ }).click();
  await p.waitForFunction(() => /No stock found/.test(document.querySelector("[data-testid=import-result-inventory]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  ok(/No stock found/.test(await p.getByTestId("import-result-inventory").innerText()), "import: the wrong file is refused, not saved");

  await p.goto(BASE + "/stock"); await p.waitForSelector("[data-testid=stock-table]");
  ok(/35/.test(await p.getByTestId("stock-tiles").innerText()), "stock: tiles show 35 orders");
  ok((await p.locator("[data-testid=stock-table] tbody tr").count()) > 100, "stock: a row per SKU");
  await p.fill("input[name=q]", "NMP-K-WH-ST"); await p.getByRole("button", { name: "Filter" }).click(); await p.waitForURL(/q=NMP-K/);
  ok((await p.locator("[data-testid=stock-table] tbody tr").count()) === 1, "stock: search narrows to one SKU");
  await p.getByRole("link", { name: "NMP-K-WH-ST" }).click(); await p.waitForSelector("[data-testid=sku-layers]");
  ok(/Order A|Order 1A/.test(await p.getByTestId("sku-layers").innerText()), "sku: its layers start with the oldest order");
  await p.goto(BASE + "/stock?tab=orders"); await p.waitForSelector("[data-testid=orders-table]");
  const rows = await p.locator("[data-testid=orders-table] tbody tr").count(); ok(rows === 35, `orders: 35 orders (${rows})`);
  await p.goto(BASE + "/stock?tab=bundles"); await p.waitForSelector("[data-testid=bundles-table]");
  ok(/2 × NWP-PC-WH/.test(await p.getByTestId("bundles-table").innerText()), "bundles: a Queen set shows 2 pillowcases");

  // a role without the permission gets the Permission Denied page
  const v = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  await v.goto(BASE + "/login"); await v.fill("input[name=email]", "viewer@test.local"); await v.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([v.waitForURL((u) => !/login/.test(u.pathname)), v.click("button[type=submit]")]);
  await v.goto(BASE + "/stock"); await v.waitForLoadState("networkidle");
  ok(/permission/i.test(await v.locator("main").innerText()), "viewer: cannot open Stock And Costing");

  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
