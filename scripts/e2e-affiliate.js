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
  ok(menu.includes("Affiliate Command") && !menu.includes("Creator Lifecycle"), `menu: Affiliate Command is listed and Creator Lifecycle is gone (${menu.slice(0, 4).join(", ")})`);

  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  ok(/Affiliate Command/.test(await p.locator("h1").first().innerText()), "command: page opens");
  const kp = await p.getByTestId("kpis").innerText();
  ok(["Affiliate Sales", "Active Creators", "New Videos Posted", "Sales Per Video"].every((x) => kp.includes(x)) && !/Seller/.test(kp), "command: four headline cards with creator wording (no 'seller')");
  ok((await p.getByTestId("kpis").locator("svg").count()) === 4, "command: each headline card has a trend line");
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
  const checks = await p.locator("[data-testid^=check-]").evaluateAll((as) => as.map((a) => [a.getAttribute("data-testid"), a.getAttribute("data-status")]));
  ok(checks.length === 4 && checks.every(([, st]) => ["good", "watch", "problem"].includes(st)), `command: four health checks, each Good, Watch or Problem (${checks.map((c) => c.join("=")).join(", ")})`);
  ok((await p.getByTestId("headline").innerText()).trim().length > 15, "command: one headline sentence sums the checks up");
  const btns = await p.getByTestId("health").locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(btns.every((h) => /^\/affiliate\/(actions|content)/.test(h)), "command: every health-check button goes to Actions or Content");
  ok(/Delivered, Not Posted/.test(await p.getByTestId("guard").innerText()) && /Requests Waiting/.test(await p.getByTestId("guard").innerText()) && !/creators hold samples/.test(await p.getByTestId("guard").innerText()), "command: Sample Status shows the groups, without the confusing sentence");
  const main = await p.locator("main").innerText();
  ok(!/Why Sales Changed|Waterfall|Biggest mover|Total change|Set Goal|Goal For|scale does not start/i.test(main), "command: the formula chart, goal and explanation lines are gone");
  ok(!/Synced .* from TikTok Shop/.test(main), "command: no sync-time line (Data Sync shows that)");
  ok((await p.locator("button", { hasText: "Last 28 Days" }).count()) >= 1, "command: a date picker is there");
  const active = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(active.length === 1 && /Affiliate Command/.test(active[0]), `menu: only Affiliate Command is lit on this screen (${active.join("|")})`);
  // chosen dates: "Last 7 days" ending today must still be 7 days of real data
  const iso = (d) => d.toISOString().slice(0, 10); const td = new Date(); const from7 = new Date(td.getTime() - 6 * 86400000);
  await p.goto(BASE + `/affiliate?from=${iso(from7)}&to=${iso(td)}`, { waitUntil: "networkidle" });
  ok(/· 7 days · vs /.test(await p.getByTestId("date-line").innerText()), `command: choosing the last 7 days shows 7 days, not 6 (${(await p.getByTestId("date-line").innerText()).slice(0, 80)})`);

  // old Lifecycle links still work: they land on Affiliate Data
  await p.goto(BASE + "/affiliate/lifecycle?stage=star", { waitUntil: "networkidle" });
  ok(/\/creators\?stage=star/.test(p.url()), "lifecycle moved: an old link lands on the matching stage in Affiliate Data");

  // actions: one next action per creator; contacting one moves it to "waiting", and the Team screen shows it at once
  const num = async (label) => Number((await p.locator("[data-testid=action-kpis] > div", { hasText: label }).first().locator("p").nth(1).innerText()).replace(/\D/g, "") || 0);
  await p.goto(BASE + "/affiliate/actions", { waitUntil: "networkidle" });
  ok(/Actions/.test(await p.locator("h1").first().innerText()), "actions: page opens");
  const names = await p.locator("[data-testid=action-row] button[title='Open details']").allInnerTexts();
  ok(names.length > 0 && new Set(names).size === names.length, `actions: each creator appears once (${names.length} rows)`);
  const todo0 = await num("To Do"), wait0 = await num("Waiting For Result");
  ok(todo0 > 0, `actions: there is something to do (${todo0})`);
  const first = p.locator("[data-testid^=act-]").first(); const who = (await p.locator("[data-testid=action-row]").first().locator("button[title='Open details']").innerText()).replace("@", "");
  await first.click(); await p.getByRole("button", { name: "I contacted them" }).click();
  await p.getByText(/Saved as contacted/).waitFor({ timeout: 15000 }); ok(true, "actions: recording a contact works from the list");
  await p.keyboard.press("Escape"); await p.goto(BASE + "/affiliate/actions", { waitUntil: "networkidle" });
  ok((await num("To Do")) === todo0 - 1 && (await num("Waiting For Result")) === wait0 + 1, "actions: the creator moved from To Do to Waiting For Result");
  await p.goto(BASE + "/affiliate/actions?view=waiting", { waitUntil: "networkidle" });
  ok((await p.locator("[data-testid=action-rows]").innerText()).includes(who), "actions: and shows in Waiting For Result");
  await p.goto(BASE + "/affiliate/team", { waitUntil: "networkidle" });
  ok(/Contacted Today/.test(await p.getByTestId("team-kpis").innerText()), "team: the screen opens");
  ok((await p.getByTestId("team-log").innerText()).includes(who) && /Contacted/.test(await p.getByTestId("team-log").innerText()), "team: the contact is in the activity log at once");
  ok(/Test Owner/.test(await p.getByTestId("team-people").innerText()), "team: the person appears with their count");
  ok(/day \d+ of 14|Not yet|waiting/i.test(await p.getByTestId("team-log").innerText() + await p.getByTestId("team-kpis").innerText()), "team: the result is shown as still filling in");
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
  ok((await p.getByTestId("rules").count()) === 1 && /Creator level 5 or higher/.test(await p.getByTestId("rules").innerText()) && /Home Supplies/.test(await p.getByTestId("rules").innerText()) && /Muslim Fashion/.test(await p.getByTestId("rules").innerText()), "outreach: your rules (level 5 or higher and the six categories) are shown");
  ok((await p.getByTestId("approve").count()) === 0 && (await p.getByTestId("approve-yes").count()) === 0, "outreach: no Approve button can be pressed while the switch is off");
  await p.goto(BASE + "/affiliate/outreach?stage=requested", { waitUntil: "networkidle" });
  ok((await p.getByTestId("fit-filter").count()) === 1 && /Eligible/.test(await p.getByTestId("fit-filter").innerText()) && /Not Checked/.test(await p.getByTestId("fit-filter").innerText()), "outreach: waiting requests can be filtered by eligibility");
  for (const st of ["requested", "approved", "shipped", "delivered", "posted"]) {
    await p.goto(BASE + "/affiliate/outreach?stage=" + st, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    ok(!/Application error|Internal Server Error/.test(body) && (/Nobody is in this stage/.test(body) || (await p.locator("[data-testid=sample-card]").count()) > 0), `outreach: stage "${st}" opens`);
  }
  const oa = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(oa.length === 1 && /^Outreach$/.test(oa[0].trim()), `menu: only Outreach is lit there (${oa.join("|")})`);

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
