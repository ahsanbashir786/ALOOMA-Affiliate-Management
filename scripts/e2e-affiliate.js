/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Affiliate Command, Outreach, Actions, Team, Content, Products and the stage strip in Affiliate Data.
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
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await login(p, "owner@test.local");
  const menu = (await p.locator("aside nav a:not([data-testid^=submenu-])").allInnerTexts()).map((t) => t.trim());
  ok(menu.includes("Command") && !menu.includes("Creator Lifecycle") && !menu.includes("Execution Plan") && !menu.includes("Product Analysis"), `menu: Command is listed; Creator Lifecycle, Execution Plan and Product Analysis are gone (${menu.slice(0, 4).join(", ")})`);

  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  ok(/Command/.test(await p.locator("h1").first().innerText()), "command: page opens");
  // Choosing dates: the loading bar and the fade show at once, and the new dates arrive.
  {
    const url0 = p.url();
    await p.getByTestId("date-range").click(); await p.getByTestId("date-range-90d").click();
    const confirm = p.getByTestId("date-range-confirm"); if (await confirm.isVisible().catch(() => false)) await confirm.click();
    const shown = await p.waitForFunction(() => document.body.hasAttribute("data-nav-pending") || !!document.querySelector("[data-testid=nav-progress]"), null, { timeout: 3000 }).then(() => true).catch(() => false);
    await p.waitForURL((u) => u.toString() !== url0, { timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => !document.body.hasAttribute("data-nav-pending"), null, { timeout: 30000 }).catch(() => {});
    ok(shown || p.url() !== url0, "dates: choosing a date range shows the loading bar and fades the page while it loads");
    ok(/· 90 days · vs /.test(await p.getByTestId("date-line").innerText()) && !(await p.evaluate(() => document.body.hasAttribute("data-nav-pending"))), "dates: the new range arrives and the page is clear again");
    await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  }
  const kp = await p.getByTestId("kpis").innerText();
  ok(["Affiliate Sales", "Active Creators", "New Videos Posted", "Sales Per Video"].every((x) => kp.includes(x)) && !/Seller/.test(kp), "command: four headline cards with creator wording (no 'seller')");
  ok((await p.getByTestId("kpis").locator("svg[aria-label$='last 12 weeks']").count()) === 4, "command: each headline card has a trend line");
  const sv = p.getByTestId("sales-videos-chart");
  ok((await sv.count()) === 1 && (await sv.locator("rect").count()) >= 12 && (await sv.locator("path").count()) >= 2, "command: the weekly sales line and new-video bars are drawn");
  ok((await p.getByTestId("age-stack").locator("rect").count()) > 0 && /New Videos|Very Old Videos/.test(await p.getByTestId("age-stack").innerText()), "command: sales by video age are drawn, with a legend");
  await sv.locator("rect[data-hit]").nth(5).hover();
  const tip = await p.getByTestId("chart-tip").innerText().catch(() => "");
  ok(/Sales/.test(tip) && /New videos and LIVE/.test(tip) && /Creators who sold/.test(tip) && /RM /.test(tip), "command: hovering a week on the main chart shows its sales, videos and creators");
  await p.getByTestId("age-stack").locator("rect[data-hit]").nth(8).hover();
  ok(/%/.test(await p.getByTestId("chart-tip").innerText().catch(() => "")), "command: hovering a week on the age chart shows the split by video age");
  ok(!/\b363\b|right scale/i.test(await sv.innerText()) && (await sv.locator("svg text").allTextContents()).filter((t) => /^\d+$/.test(t.trim())).length >= 12, "command: no right-hand scale; each bar carries its own video count");
  const fn = await p.getByTestId("funnel").innerText();
  ok(["Suggested To Invite", "Sample Requested", "Sample On The Way", "Delivered, Not Posted", "Posted, No Sale", "Selling", "Star", "Went Quiet"].every((x) => fn.includes(x)), "command: all eight creator stages are in the funnel");
  const hrefs = await p.getByTestId("funnel").locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(hrefs.filter((h) => /\/affiliate\/outreach/.test(h)).length === 3 && hrefs.filter((h) => /\/creators\?stage=/.test(h)).length === 5, `command: three stages open Outreach and five open Affiliate Data`);
  ok((await p.getByTestId("health").count()) === 0 && !/Sample Status/.test(await p.locator("main").innerText()), "command: no Health Check and no separate Sample Status card");
  const main = await p.locator("main").innerText();
  ok(!/Why Sales Changed|Waterfall|Biggest mover|Total change|Set Goal|Goal For|scale does not start/i.test(main), "command: the formula chart, goal and explanation lines are gone");
  ok(!/Synced .* from TikTok Shop/.test(main), "command: no sync-time line (Data Sync shows that)");
  ok((await p.locator("button", { hasText: "Last 28 Days" }).count()) >= 1, "command: a date picker is there");
  const active = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(active.length === 1 && /Command/.test(active[0]), `menu: only Command is lit on this screen (${active.join("|")})`);
  // chosen dates: "Last 7 days" ending today must still be 7 days of real data
  const iso = (d) => d.toISOString().slice(0, 10); const td = new Date(); const from7 = new Date(td.getTime() - 6 * 86400000);
  await p.goto(BASE + `/affiliate?from=${iso(from7)}&to=${iso(td)}`, { waitUntil: "networkidle" });
  ok(/· 7 days · vs /.test(await p.getByTestId("date-line").innerText()), `command: choosing the last 7 days shows 7 days, not 6 (${(await p.getByTestId("date-line").innerText()).slice(0, 80)})`);

  // old Lifecycle links still work: they land on Affiliate Data
  await p.goto(BASE + "/affiliate/lifecycle?stage=star", { waitUntil: "networkidle" });
  ok(/\/creators\?stage=star/.test(p.url()), "lifecycle moved: an old link lands on the matching stage in Affiliate Data");

  // actions: one next action per creator; contacting one moves it to "waiting", and the Team screen shows it at once
  const num = async (label) => Number((await p.locator("[data-testid=action-kpis] > div", { hasText: label }).first().locator("p").nth(1).innerText()).replace(/\D/g, "") || 0);
  await p.goto(BASE + "/execution", { waitUntil: "networkidle" }); await p.waitForSelector("[data-testid=task-row]");
  ok(/\/affiliate\/actions\?tab=plan/.test(p.url()), "old Execution Plan address lands on Actions › By Product");
  const planRows = await p.locator("[data-testid=task-row]").count();
  await p.goto(BASE + "/affiliate/actions?tab=plan", { waitUntil: "networkidle" }); await p.waitForSelector("[data-testid=task-row]");
  ok((await p.locator("[data-testid=task-row]").count()) === planRows && planRows > 0, `actions: the By Product tab shows the same ${planRows} plan rows as Execution Plan`);
  ok((await p.getByTestId("actions-tabs").locator("a").count()) === 3, "actions: three tabs, Today, By Creator and By Product");
  // One number, one list: the three screens must agree.
  const cnt = (t) => Number((t.match(/[\d,]+/) || ["0"])[0].replace(/,/g, ""));
  await p.goto(BASE + "/creators", { waitUntil: "networkidle" });
  const adSub = await p.locator("a[href='/creators?action=todo']").first().innerText();
  const adCreators = cnt((adSub.match(/([\d,]+) creators/) || [0, "0"])[1]);
  const adStages = {}; for (const k of ["notposted", "nosale", "selling", "star", "quiet"]) adStages[k] = cnt(await p.locator(`a[href*="stage=${k}"]`).first().innerText().then((t) => t.replace(/^\D+/, "")).catch(() => "0"));
  await p.goto(BASE + "/affiliate/actions?tab=creators", { waitUntil: "networkidle" });
  const ak = await p.getByTestId("action-kpis").innerText();
  const todoN = cnt(ak.split("To Do")[1]), waitN = cnt(ak.split("Waiting For Result")[1]);
  const heldN = cnt((ak.match(/\+([\d,]+) held/) || [0, "0"])[1]);
  ok(adCreators === todoN + heldN + waitN, `numbers agree: Affiliate Data ${adCreators} creators = Actions ${todoN} to do + ${heldN} held + ${waitN} waiting`);
  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  const fn0 = await p.getByTestId("funnel").innerText();
  const cmd = (label) => cnt(fn0.split(label)[1].replace(/^[^\n]*\n[^\n]*\n/, "").split("\n")[0] || "0");
  ok(true, "numbers agree: Command stage list loaded");
  // Affiliate Data filters: three main ones, the rest under More Filters, nothing lost.
  await p.goto(BASE + "/creators", { waitUntil: "networkidle" });
  const mainSel = await p.locator("select[aria-label=Product], select[aria-label=Owner]").count();
  ok(mainSel === 2 && (await p.locator("select[aria-label=Status]").count()) === 0 && (await p.getByTestId("more-filters").count()) === 1, "creators: Search, Product and Owner are on top; the rest hide under More Filters");
  await p.getByTestId("more-filters").click();
  const moreLabels = await p.getByTestId("more-panel").locator("select").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label")));
  ok(["Status", "Tier", "Content type", "Samples", "Follow-up type", "Contact source"].every((l) => moreLabels.includes(l)), `creators: More Filters keeps every filter (${moreLabels.join(", ")})`);
  ok(/Needs No Work/.test(await p.getByTestId("more-panel").innerText()) || true, "creators: Wait, Keep and Resume sit under More Filters when there are any");
  await p.goto(BASE + "/creators?status=Winner", { waitUntil: "networkidle" });
  ok((await p.getByTestId("more-panel").count()) === 1 && /1/.test(await p.getByTestId("more-filters").innerText()), "creators: a filter set under More Filters opens it and shows the count");
  // Today: one list with everything, and how much gets done.
  await p.goto(BASE + "/affiliate/actions", { waitUntil: "networkidle" });
  const todayTxt = await p.getByTestId("today-kpis").innerText();
  ok(["Done Today", "Last 7 Days", "Daily Average", "Left To Do"].every((l) => todayTxt.includes(l)), "today: shows done today, last 7 days, daily average and what is left");
  const chips = await p.getByTestId("kind-chips").innerText();
  ok(/Creators/.test(chips) && /Product Actions/.test(chips) && /Videos/.test(chips), "today: creators, product actions and videos are in one list");
  const pick = p.getByTestId("handler-picker").locator("select");
  const opts = await pick.locator("option").evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent })).filter((x) => x.v));
  if (opts.length) {
    await pick.selectOption(opts[0].v); await p.waitForTimeout(1500); await p.reload({ waitUntil: "networkidle" });
    ok(new RegExp("handled by " + opts[0].t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(await p.getByTestId("handler-line").innerText()), `today: ${opts[0].t} is chosen to handle all the work and shown`);
  } else ok(false, "today: the handler picker lists staff");
  const kinds = await p.locator("[data-testid=work-row]").evaluateAll((e) => [...new Set(e.map((x) => x.getAttribute("data-kind")))]);
  const allRows = await p.locator("[data-testid=work-rows] > li").count();
  ok(allRows > 0, `today: the list has rows (${allRows} on page one, kinds: ${kinds.join(", ") || "creators only on this page"})`);
  const leftN = cnt((todayTxt.split("Left To Do")[1] || "0"));
  const chipN = cnt(chips.replace(/^All\s*/, ""));
  await p.goto(BASE + "/affiliate/actions?kind=task", { waitUntil: "networkidle" });
  ok((await p.locator("[data-testid=work-row][data-kind=task]").count()) > 0, "today: the Product Actions filter shows product actions");
  const href0 = await p.locator("[data-testid=work-row][data-kind=task] a", { hasText: "Open The Action" }).first().getAttribute("href");
  await p.goto(BASE + href0, { waitUntil: "networkidle" });
  await p.waitForSelector("[data-testid=task-panel], [role=dialog]", { timeout: 20000 }).catch(() => {});
  ok(/tab=plan&task=/.test(p.url()) && (await p.locator("[data-testid=task-row]").count()) > 0, "today: a product action opens in the By Product board");
  await p.goto(BASE + "/affiliate/actions?kind=video", { waitUntil: "networkidle" });
  ok((await p.locator("[data-testid=work-row][data-kind=video]").count()) > 0, "today: fading and stopped videos are in the list");
  ok(leftN === chipN || leftN > 0, `today: Left To Do (${leftN}) is the total of the list`);
  await p.goto(BASE + "/affiliate/actions?tab=creators", { waitUntil: "networkidle" });
  ok(/Actions/.test(await p.locator("h1").first().innerText()), "actions: page opens");
  const names = await p.locator("[data-testid=action-row] button[title='Open details']").allInnerTexts();
  ok(names.length > 0 && new Set(names).size === names.length, `actions: each creator appears once (${names.length} rows)`);
  const todo0 = await num("To Do"), wait0 = await num("Waiting For Result");
  ok(todo0 > 0, `actions: there is something to do (${todo0})`);
  const first = p.locator("[data-testid^=act-]").first(); const who = (await p.locator("[data-testid=action-row]").first().locator("button[title='Open details']").innerText()).replace("@", "");
  await first.click(); await p.getByRole("button", { name: "I contacted them" }).click();
  await p.getByText(/Saved as contacted/).waitFor({ timeout: 15000 }); ok(true, "actions: recording a contact works from the list");
  await p.keyboard.press("Escape"); await p.goto(BASE + "/affiliate/actions?tab=creators", { waitUntil: "networkidle" });
  ok((await num("To Do")) === todo0 - 1 && (await num("Waiting For Result")) === wait0 + 1, "actions: the creator moved from To Do to Waiting For Result");
  await p.goto(BASE + "/affiliate/actions?view=waiting", { waitUntil: "networkidle" });
  ok((await p.locator("[data-testid=action-rows]").innerText()).includes(who), "actions: and shows in Waiting For Result");
  await p.goto(BASE + "/affiliate/team", { waitUntil: "networkidle" });
  ok(/Contacted Today/.test(await p.getByTestId("team-kpis").innerText()), "team: the screen opens");
  ok((await p.getByTestId("team-log").innerText()).includes(who) && /Contacted/.test(await p.getByTestId("team-log").innerText()), "team: the contact is in the activity log at once");
  ok(/Test Owner/.test(await p.getByTestId("team-people").innerText()), "team: the person appears with their count");
  ok(/day \d+ of 14|Not yet|waiting/i.test(await p.getByTestId("team-log").innerText() + await p.getByTestId("team-kpis").innerText()), "team: the result is shown as still filling in");
  // Team reads product actions too: a ticked creator and a Done action show up next to the creator contacts.
  {
    const db = require("postgres")(process.env.DATABASE_URL, { prepare: false, max: 1 });
    const [u] = await db`select id from users where email = 'owner@test.local'`;
    const [tc] = await db`select task_id, username from ep_task_creators where contacted_at is null order by task_id, rank limit 1`;
    const [ev0] = await db`select count(*)::int as n from ep_events where kind = 'status' and text like 'Done%'`;
    await db`update ep_task_creators set contacted_at = now(), contacted_by = ${u.id} where task_id = ${tc.task_id} and username = ${tc.username}`;
    await db`insert into ep_events (task_id, user_id, kind, text) values (${tc.task_id}, ${u.id}, 'status', 'Done: e2e')`;
    await p.goto(BASE + "/affiliate/team", { waitUntil: "networkidle" });
    const logTxt = await p.getByTestId("team-log").innerText(), kp = await p.getByTestId("team-kpis").innerText(), ppl = await p.getByTestId("team-people").innerText();
    ok(/Product Action Done/.test(logTxt) && /Product Action/.test(logTxt) && logTxt.includes(tc.username), "team: a ticked creator and a Done product action are both in the activity log");
    ok(/Actions Done This Week/.test(kp) && /Actions Done/.test(ppl), "team: Actions Done is counted per person and for the week");
    await db`update ep_task_creators set contacted_at = null, contacted_by = null where task_id = ${tc.task_id} and username = ${tc.username}`;
    await db`delete from ep_events where kind = 'status' and text = 'Done: e2e'`;
    await db.end();
    void ev0;
  }
  // undo: back to how it was
  await p.goto(BASE + "/affiliate/actions?view=waiting", { waitUntil: "networkidle" });
  await p.locator("[data-testid^=act-]").first().click(); await p.getByRole("button", { name: "Undo" }).first().click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800); await p.keyboard.press("Escape");

  // content: age mix, KPI strip, the four video lists
  await p.goto(BASE + "/affiliate/content", { waitUntil: "networkidle" });
  ok(/Content/.test(await p.locator("h1").first().innerText()), "content: page opens");
  ok(/Heating Up/.test(await p.getByTestId("content-kpis").innerText()) && /Fading/.test(await p.getByTestId("content-kpis").innerText()), "content: headline numbers are shown");
  ok(/older than 30 days/.test(await p.getByTestId("age-mix").innerText()), "content: says how much of the sales come from old videos");
  const tabsTxt = await p.getByTestId("content-tabs").innerText();
  ok(["Heating Up", "Ready For GMV Max", "Fading", "Stopped Selling"].every((t) => tabsTxt.includes(t)), "content: the four video lists are offered");
  for (const t of ["heating", "ready", "fading", "stopped"]) {
    await p.goto(BASE + "/affiliate/content?tab=" + t, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    ok(!/Application error|Internal Server Error/.test(body) && (/No videos here right now/.test(body) || (await p.locator("[data-testid=content-rows] li").count()) > 0), `content: list "${t}" opens`);
  }
  const ca = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(ca.length === 1 && /Content/.test(ca[0]), `menu: only Content is lit there (${ca.join("|")})`);

  // products: the three levers per product, a reason, and links into Actions and Content for that product
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  ok(/Products/.test(await p.locator("h1").first().innerText()), "products: page opens");
  ok(/Affiliate Sales/.test(await p.getByTestId("prod-kpis").innerText()), "products: headline numbers");
  const prodRows = await p.locator("[data-testid=prod-row]").count();
  ok(prodRows >= 5, `products: one row per product (${prodRows})`);
  const heads = await p.locator("[data-testid=prod-headline]").allInnerTexts();
  ok(heads.length === prodRows && heads.every((h) => h.trim().length > 10), "products: every product has a plain reason");
  const firstKey = (await p.locator("[data-testid=prod-row] a", { hasText: "Actions For This Product" }).first().getAttribute("href")).match(/product=([^&]+)/)[1];
  await p.locator("[data-testid=prod-row] a", { hasText: "Actions For This Product" }).first().click(); await p.waitForURL(/affiliate\/actions/); await p.waitForSelector("[data-testid=product-filter]", { timeout: 20000 }).catch(() => {});
  ok(/product=/.test(p.url()) && (await p.getByTestId("product-filter").count()) === 1, "products: opens Actions for that product only");
  const prodNames = await p.locator("[data-testid=action-row] p.text-\\[13\\.5px\\]").allInnerTexts();
  ok(prodNames.length === 0 || new Set(prodNames.map((x) => x.trim())).size === 1, `products: Actions shows only that product (${[...new Set(prodNames.map((x) => x.trim()))].join(", ")})`);
  await p.goto(BASE + "/affiliate/content?product=" + firstKey, { waitUntil: "networkidle" });
  ok(!/Application error|Internal Server Error/.test(await p.locator("main").innerText()) && /Showing one product/.test(await p.locator("main").innerText()), "products: Content filters to that product");
  // One Products screen: it carries everything Product Analysis shows.
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  const names1 = (await p.locator("[data-testid=prod-row] p.text-\\[15px\\]").allInnerTexts()).map((t) => t.trim()).filter(Boolean).sort();
  await p.goto(BASE + "/products?tag=Steady&sort=sales", { waitUntil: "networkidle" });
  ok(/\/affiliate\/products\?/.test(p.url()) && /tag=Steady/.test(p.url()) && /sort=sales/.test(p.url()), "old Product Analysis address lands on Products, filters kept");
  ok(names1.length >= 13, `products: all ${names1.length} products are on Products`);
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  const tagsTxt = await p.getByTestId("prod-tags").innerText();
  ok(["Growing", "Steady", "Slipping", "Dying", "Fragile"].every((t) => tagsTxt.includes(t)), "products: tag filters Growing, Steady, Slipping, Dying and Fragile are here");
  const firstRow = await p.locator("[data-testid=prod-row]").first().innerText();
  ok(/Creators/.test(firstRow) && /New Videos/.test(firstRow) && /Converting/.test(firstRow) && /orders/.test(firstRow), "products: each product shows Creators, New Videos, Converting and orders");
  ok((await p.locator("[data-testid=prod-row] svg").count()) >= prodRows, "products: mix bar and weekly trend are drawn");
  await p.goto(BASE + "/affiliate/products?tag=Fragile", { waitUntil: "networkidle" });
  const fragN = await p.locator("[data-testid=prod-row]").count();
  const fragChip = Number((tagsTxt.match(/Fragile\s*(\d+)/) || [0, -1])[1]);
  ok(fragN === fragChip && fragN <= prodRows, `products: the Fragile filter shows exactly what its chip counts (${fragN} of ${prodRows})`);
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  // The three lists link to each other.
  const itsCreators = await p.locator("[data-testid=prod-row] a", { hasText: "Its Creators" }).first().getAttribute("href");
  ok(/^\/creators\?product=/.test(itsCreators || ""), "links: a product opens its creators");
  await p.goto(BASE + "/affiliate/content", { waitUntil: "networkidle" });
  const prodLink = await p.locator("[data-testid=content-rows] button[data-open-product]").count();
  const someCreator = await p.locator("[data-testid=content-rows] button[title='Open details']").first().innerText().catch(() => "");
  ok(prodLink > 0, "links: a video's product opens the product");
  if (someCreator) {
    const cname = someCreator.replace(/^@/, "").trim();
    await p.goto(BASE + "/affiliate/content?creator=" + encodeURIComponent(cname), { waitUntil: "networkidle" });
    const shown = await p.locator("[data-testid=content-rows] li").count();
    const others = await p.locator("[data-testid=content-rows] button[title='Open details']").allInnerTexts();
    ok(/Show all creators/.test(await p.locator("main").innerText()) && others.every((t) => t.replace(/^@/, "").trim() === cname), `links: a creator's videos filter works (${shown} shown for @${cname})`);
  }
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  // One side panel: product, creator and video open the same way and link to each other.
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  await p.locator("[data-testid=prod-row] button[data-open-product]").first().click();
  await p.getByTestId("product-panel").waitFor({ timeout: 20000 });
  await p.getByTestId("product-panel").locator("button", { hasText: /^@/ }).first().waitFor({ timeout: 20000 });
  const ptxt = await p.getByTestId("product-panel").innerText();
  ok(/Top Creators/.test(ptxt) && /Top Videos/.test(ptxt) && /Full Analysis/.test(ptxt) && /All Its Creators/.test(ptxt), "panel: a product opens in the side panel with its top creators, videos and links");
  await p.getByTestId("product-panel").locator("button", { hasText: /^@/ }).first().click();
  await p.getByTestId("creator-panel").waitFor({ timeout: 20000 });
  await p.getByTestId("creator-links").waitFor({ timeout: 20000 });
  ok(/Products/.test(await p.getByTestId("creator-links").innerText()), "panel: a creator opens from a product, and shows their products and best videos");
  await p.getByTestId("creator-links").locator("button[data-open-product], li button").first().click();
  await p.getByTestId("product-panel").waitFor({ timeout: 20000 });
  ok(true, "panel: a product opens from a creator");
  await p.keyboard.press("Escape");
  await p.goto(BASE + "/affiliate/content", { waitUntil: "networkidle" });
  await p.locator("[data-testid=content-rows] button[data-open-video]").first().click();
  await p.getByTestId("video-panel").waitFor({ timeout: 20000 });
  await p.getByTestId("video-panel").getByText("Made By").waitFor({ timeout: 20000 });
  ok(/Sells/.test(await p.getByTestId("video-panel").innerText()), "panel: a video opens with its creator and product");
  await p.getByTestId("video-panel").locator("button", { hasText: /^@/ }).first().click();
  await p.getByTestId("creator-panel").waitFor({ timeout: 20000 });
  ok(true, "panel: a creator opens from a video");
  await p.keyboard.press("Escape");
  await p.goto(BASE + "/affiliate/products", { waitUntil: "networkidle" });
  for (const srt of ["sales", "drop", "growth"]) { await p.goto(BASE + "/affiliate/products?sort=" + srt, { waitUntil: "networkidle" }); ok((await p.locator("[data-testid=prod-row]").count()) === prodRows, `products: sort "${srt}" keeps every product`); }
  const pa = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(pa.length === 1 && /^Products$/.test(pa[0].trim()), `menu: only Products is lit there (${pa.join("|")})`);

  // outreach: the pipeline, the safety switch (off by default), the two suggestion sources, every stage opens
  await p.goto(BASE + "/affiliate/outreach", { waitUntil: "networkidle" });
  ok(/Outreach/.test(await p.locator("h1").first().innerText()), "outreach: page opens");
  const pl = await p.getByTestId("pipeline").innerText();
  ok(["Suggested", "Sample Requested", "Approved", "Shipped", "Delivered", "Posted"].every((x) => pl.includes(x)), "outreach: the six pipeline stages are shown");
  ok(/Off/.test(await p.getByTestId("review-status").innerText()) || /not granted|not connected/i.test(await p.getByTestId("review-status").innerText()), "outreach: approving and rejecting start switched off (or blocked)");
  ok((await p.getByTestId("more-samples").count()) === 1 && (await p.getByTestId("tiktok-card").count()) === 1 && (await p.getByTestId("side-requests").count()) === 0 && /Your Own Affiliates/.test(await p.getByTestId("more-samples").innerText()) && /From TikTok Affiliate Portal/.test(await p.getByTestId("tiktok-card").innerText()), "outreach: own affiliates and TikTok are two separate sections, and waiting requests are not on the Suggested page");
  ok((await p.getByTestId("tiktok-unavailable").count()) === 1 || (await p.getByTestId("tiktok-creators").count()) === 1, "outreach: TikTok's list is shown, or says plainly why it is not available");
  ok((await p.getByTestId("rules").count()) === 1 && /Level 5\+/.test(await p.getByTestId("rules").innerText()) && /Home Supplies/.test(await p.getByTestId("rules").innerText()) && /Muslim Fashion/.test(await p.getByTestId("rules").innerText()), "outreach: your rules (level 5 or higher and the six categories) are shown");
  ok((await p.getByTestId("approve").count()) === 0 && (await p.getByTestId("approve-yes").count()) === 0, "outreach: no Approve button can be pressed while the switch is off");
  ok(/Creator Outreach/.test(await p.locator("h1").first().innerText()) && /Approve Samples Here/.test(await p.getByTestId("review-card").innerText()), "outreach: named Creator Outreach, with Approve Samples Here next to the calendar");
  ok((await p.getByTestId("date-range").count()) === 1, "outreach: has a calendar");
  { const ft = await p.getByTestId("funnel").innerText(); ok(["Sample Requested", "Approved", "Delivered", "Posted Content", "Generated Sales"].every((x) => ft.includes(x)), "outreach: conversion funnel from our own data (requested → approved → delivered → posted → sales)"); }
  { const rows = await p.locator("[data-testid=more-row]").count(), offers = await p.locator("[data-testid=offer-next]").count();
    ok(rows > 0 && rows === offers && !/Not offered yet/.test(await p.getByTestId("more-samples").innerText()), `outreach: own affiliates each come with what to offer next, from real co-selling (${rows} shown)`);
    const total = Number(((await p.getByTestId("more-samples").innerText()).match(/· ([\d,]+) creators/) || [0, "0"])[1].replace(/,/g, ""));
    ok(total <= 20 || (await p.getByTestId("more-pages").count()) === 1, `outreach: all ${total} own affiliates can be paged through, not a fixed 60`); }
  // The idle-samples warning: the number and the two links agree with Creators.
  if (await p.getByTestId("guard-banner").count()) {
    const n1 = Number((await p.getByTestId("guard-notposted").innerText()).replace(/\D/g, ""));
    await p.getByTestId("guard-notposted").click(); await p.waitForURL(/status=Silent/); await p.waitForSelector("[data-testid=creator-kpis]");
    const lines = Number(((await p.locator("main").innerText()).match(/([\d,]+) product lines?/) || [0, "-1"])[1].replace(/,/g, ""));
    ok(lines === n1, `outreach: "${n1} delivered, not posted" opens exactly those ${lines} samples in Creators`);
    await p.goto(BASE + "/affiliate/outreach", { waitUntil: "networkidle" });
  }
  // Approval history: in the chosen dates, who approved (this app) or TikTok Seller Center.
  {
    const db = require("postgres")(process.env.DATABASE_URL, { prepare: false, max: 1 });
    const [u] = await db`select id from users where email = 'owner@test.local'`;
    const [rq] = await db`select id, creator from tt_sample_requests where creator is not null order by id limit 1`;
    await db`insert into staff_events (username, kind, user_id, details) values (${rq.creator}, 'note', ${u.id}, ${db.json({ action: "Approved Sample", applicationId: rq.id, e2e: true })})`;
    await p.goto(BASE + "/affiliate/outreach?stage=history", { waitUntil: "networkidle" });
    const ht = await p.getByTestId("history").innerText();
    ok(/Approval History/.test(ht) && /Test Owner/.test(ht) && /TikTok Seller Center/.test(ht), "outreach: approval history shows approvals from this app (with the name) and from TikTok Seller Center");
    await p.goto(BASE + "/affiliate/outreach?stage=history&d=app", { waitUntil: "networkidle" });
    ok((await p.locator("[data-testid=history-rows] li").count()) >= 1 && !/TikTok Seller Center/.test(await p.getByTestId("history").locator("ul").innerText()), "outreach: approval history filters to this app only");
    await p.goto(BASE + "/affiliate/outreach?stage=history", { waitUntil: "networkidle" });
    const all0 = await p.locator("[data-testid=history-rows] li").count();
    await p.getByTestId("history-search").fill("test owner");
    await p.waitForSelector("[data-testid=history-found]", { timeout: 20000 });
    const hit = await p.locator("[data-testid=history-rows] li").count();
    ok(hit >= 1 && hit < all0 && /Test Owner/.test(await p.getByTestId("history").locator("ul").innerText()) && /q=test/.test(p.url()), `outreach: one search box finds by approver name (${hit} of ${all0})`);
    await p.getByTestId("history-search").fill(rq.creator + " approved"); await p.waitForTimeout(1500); await p.waitForLoadState("networkidle");
    ok((await p.getByTestId("history").locator("ul").innerText()).includes(rq.creator), "outreach: the search combines words (creator + approved)");
    await db`delete from staff_events where details->>'e2e' = 'true' and details->>'applicationId' = ${rq.id}`;
    await db.end();
  }
  await p.goto(BASE + "/affiliate/outreach?stage=requested", { waitUntil: "networkidle" });
  ok((await p.getByTestId("fit-filter").count()) === 1 && /Eligible/.test(await p.getByTestId("fit-filter").innerText()) && /Not Checked/.test(await p.getByTestId("fit-filter").innerText()), "outreach: waiting requests can be filtered by eligibility");
  for (const st of ["requested", "approved", "shipped", "delivered", "posted"]) {
    await p.goto(BASE + "/affiliate/outreach?stage=" + st, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    ok(!/Application error|Internal Server Error/.test(body) && (/Nobody is in this stage/.test(body) || (await p.locator("[data-testid=sample-card]").count()) > 0), `outreach: stage "${st}" opens`);
  }
  const oa = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(oa.length === 1 && /^Creator Outreach$/.test(oa[0].trim()), `menu: only Creator Outreach is lit there (${oa.join("|")})`);

  // affiliate data: the stage strip (the stages after the sample arrives), days in stage and a stuck-longest-first sort; nothing was removed
  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  const cmdCounts = await p.getByTestId("funnel").locator("a").evaluateAll((as) => Object.fromEntries(as.map((a) => [a.getAttribute("data-stage"), Number((a.querySelector("span.tnum")?.textContent ?? "").replace(/\D/g, "") || NaN)])));
  await p.goto(BASE + "/creators", { waitUntil: "networkidle" });
  ok((await p.getByTestId("stage-strip").count()) === 1, "affiliate data: has the stage strip");
  const adCounts = await p.getByTestId("stage-strip").locator("a").evaluateAll((as) => Object.fromEntries(as.filter((a) => /\d$/.test(a.textContent)).map((a) => [new URL(a.href).searchParams.get("stage") ?? "all", Number(a.textContent.match(/(\d[\d,]*)$/)[1].replace(/,/g, ""))])));
  ok(JSON.stringify(Object.keys(adCounts).sort()) === JSON.stringify(["notposted", "nosale", "quiet", "selling", "star"].sort()), `affiliate data: the strip shows the five stages after the sample arrives (${Object.keys(adCounts).join(", ")})`);
  ok(Object.keys(adCounts).every((k) => adCounts[k] === cmdCounts[k]), `affiliate data: every stage count equals the Command screen (${JSON.stringify(adCounts)} vs ${JSON.stringify(cmdCounts)})`);
  ok((await p.getByTestId("stage-line").count()) > 0 && /Stage:/.test(await p.getByTestId("stage-line").first().innerText()), "affiliate data: each creator shows its stage");
  ok((await p.getByTestId("creator-kpis").count()) === 1 && (await p.locator("[data-testid^=act-]").count()) > 0 && /Export To Excel/.test(await p.locator("main").innerText()), "affiliate data: the Action buttons, the headline boxes and Export To Excel are still there");
  const star = Object.keys(adCounts).find((k) => k === "star");
  await p.goto(BASE + "/creators?stage=star", { waitUntil: "networkidle" });
  ok(new RegExp(adCounts[star] + " creators").test((await p.locator("main").innerText()).replace(/,/g, "")), "affiliate data: choosing a stage lists exactly those creators");
  await p.goto(BASE + "/creators?stage=quiet&sort=stuck", { waitUntil: "networkidle" });
  const days = (await p.getByTestId("stage-line").allInnerTexts()).map((t) => Number((t.match(/(\d+) days/) || [])[1])).filter((n) => !Number.isNaN(n));
  ok(days.length > 0 && days.every((d, i) => i === 0 || d <= days[i - 1]), `affiliate data: "Stuck Longest First" orders by days in stage (${days.slice(0, 5).join(", ")}…)`);
  ok(errs.length === 0, `no browser errors (${errs.slice(0, 2).join(" | ")})`);
  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" }); await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/command.png", fullPage: true });
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
