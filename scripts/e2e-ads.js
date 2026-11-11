/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Settings → Connection → Ad Management and Data Sync → Ads Management, against a pretend TikTok.
// Needs: node scripts/fake-ads-api.js running, and the app on :3100 started with the TIKTOK_ADS_* variables shown in that file,
// the demo data and users (scripts/seed-creators-demo.ts), and no Ads connection or ads_* rows saved yet (clear them first).
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
  const mk = async (vp = { width: 1440, height: 1100 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
  const o = await mk(); await login(o, "owner@test.local");

  // ── Settings tabs
  await o.goto(BASE + "/settings"); await o.waitForSelector("[data-testid=settings-tab-connection]");
  const tabs = (await o.locator("nav[aria-label='Settings sections'] a").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(tabs) === JSON.stringify(["Connection", "User Management", "Storage", "System Alerts"]), `settings: the four sections (${tabs.join(", ")})`);
  const sub = (await o.locator("nav[aria-label='Connection type'] a").allInnerTexts()).map((t) => t.trim());
  ok(sub.length === 2 && /Affiliate/.test(sub[0]) && /Ad Management/.test(sub[1]), `settings: Connection has two tabs (${sub.join(" | ")})`);
  await o.getByTestId("settings-tab-storage").click(); await o.waitForSelector("[data-testid=settings-soon]"); ok(true, "settings: Storage is a coming-later page");
  await o.getByTestId("settings-tab-alerts").click(); await o.waitForSelector("[data-testid=settings-soon]"); ok(true, "settings: System Alerts is a coming-later page");
  await o.getByTestId("settings-tab-users").click(); await o.waitForSelector("[data-testid=user-row]"); ok(/tab=users/.test(o.url()), "settings: User Management shows the people");

  // ── Ads connection card
  await o.goto(BASE + "/settings?tab=connection&src=ads"); await o.waitForSelector("[data-testid=tiktok-ads-card]");
  ok(/Not connected/.test(await o.getByTestId("tiktok-ads-status").innerText()), "ads: starts not connected");
  ok(/localhost:3100\/api\/tiktok-ads\/callback/.test(await (async () => { await o.locator("summary", { hasText: "Redirect address" }).click(); return o.getByTestId("tiktok-ads-redirect").innerText(); })()), "ads: shows the exact redirect address to save in the TikTok app");
  await Promise.all([o.waitForURL(/tiktok-ads=|ads=connected/), o.getByTestId("tiktok-ads-connect").click()]);
  await o.waitForSelector("[data-testid=tiktok-ads-msg]");
  ok(/Connected to TikTok Ads/.test(await o.getByTestId("tiktok-ads-msg").innerText()), "ads: Connect goes to TikTok and comes back connected");
  ok(/Connected/.test(await o.getByTestId("tiktok-ads-status").innerText()) && !/Not connected/.test(await o.getByTestId("tiktok-ads-status").innerText()), "ads: status turns Connected");
  await o.getByTestId("tiktok-ads-check").click(); await o.waitForSelector("[data-testid=tiktok-ads-checks]");
  const ct = await o.getByTestId("tiktok-ads-checks").innerText();
  ok(/Everything answered/.test(ct) && /Ad accounts/.test(ct) && /GMV Max shops/.test(ct) && /GMV Max campaigns/.test(ct) && /Campaign results/.test(ct) && /GMV Max videos/.test(ct) && /Creative boosts/.test(ct), "ads: Check Connection answers for accounts, shops, campaigns, results, videos and boosts");
  await o.reload(); await o.waitForSelector("[data-testid=tiktok-ads-card]");
  ok(await o.getByTestId("tiktok-ads-accounts").count() === 1, "ads: the ad account is listed once connected");

  // ── Data Sync tabs
  await o.goto(BASE + "/sync"); await o.waitForSelector("[data-testid=sync-tab-ads]");
  const st = (await o.locator("nav[aria-label='Data source'] a").allInnerTexts()).map((t) => t.trim());
  ok(st.length === 2 && /Affiliate/.test(st[0]) && /Ads Management/.test(st[1]), `sync: two tabs (${st.join(" | ")})`);
  await o.getByTestId("sync-tab-ads").click(); await o.waitForSelector("[data-testid=ads-board]");
  ok(await o.getByTestId("ads-ds-campaign_daily").isVisible(), "sync: the Ads Management tab shows its dataset cards");
  await o.getByTestId("ads-sync-now").click();
  await o.waitForFunction(() => { const n = document.querySelector("[data-testid=ads-ds-campaign_daily] p.tnum"); return n && parseInt(n.textContent.replace(/,/g, ""), 10) > 0; }, null, { timeout: 60000 });
  await o.waitForFunction(() => document.querySelector("[data-testid=ads-hero]")?.getAttribute("data-state") === "ok", null, { timeout: 60000 });
  const num = async (k) => parseInt((await o.getByTestId(`ads-ds-${k}`).locator("p.tnum").innerText()).replace(/,/g, ""), 10);
  ok((await num("advertisers")) === 1 && (await num("stores")) === 1 && (await num("campaigns")) === 2, "sync: accounts, shops and campaigns arrive");
  ok((await num("videos")) === 3 && (await num("boosts")) === 1, "sync: videos and creative boosts arrive");
  ok((await num("campaign_daily")) >= 80 && (await num("creative_daily")) >= 80 && (await num("product_daily")) >= 80, `sync: daily results arrive (${await num("campaign_daily")} campaign-days)`);
  ok(/Everything Is Up To Date/.test(await o.getByTestId("ads-hero").innerText()), "sync: the hero says everything is up to date");
  ok(/different videos/.test(await o.getByTestId("ads-distinct-creative_daily").innerText()) && /Not a count of videos/.test(await o.getByTestId("ads-ds-creative_daily").innerText()), "sync: each card says what it holds and how many real things are behind its rows");
  await o.getByTestId("ads-ds-campaigns").locator("summary").click();
  ok(/campaign_id/.test(await o.getByTestId("ads-ds-campaigns").locator("pre").innerText()), "sync: 'What TikTok sent' shows the first record");
  ok(!(await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "sync: no sideways scroll on desktop");
  await o.getByTestId("sync-tab-affiliate").click(); await o.waitForSelector("[data-testid=sync-hero], [data-testid=sync-offline]"); ok(true, "sync: the Affiliate tab still works");

  // ── GMV Max screens
  await o.goto(BASE + "/ads"); await o.waitForSelector("[data-testid=ads-today]");
  const tabsA = (await o.locator("nav[aria-label='GMV Max sections'] a").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(tabsA) === JSON.stringify(["Ads Today", "Boost Picks", "Batch Planner", "Boost Log", "Campaign Health", "Product Performance", "Creator Scoreboard"]), `gmv max: the seven sections (${tabsA.join(", ")})`);
  const mainT = await o.locator("main").innerText();
  ok(/Ad Spend/.test(mainT) && /ROI/.test(mainT) && /Last 7 days/.test(mainT) && /Needs Your Attention/.test(mainT) && /Golden Videos Waiting/.test(mainT), "ads today: totals, chart for the chosen dates, alerts and golden videos");
  ok(!(await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "ads today: no sideways scroll on desktop");
  await o.goto(BASE + "/ads?tab=picks&roi=1&orders=1"); await o.waitForSelector("[data-testid=ads-picks]");
  ok(/TikTok API Status/i.test(await o.locator("main").innerText()) && /Stopped While Selling/.test(await o.getByTestId("ads-group-stopped").innerText()) && /Never Started/.test(await o.getByTestId("ads-group-never").innerText()) && /Wasting Money/.test(await o.getByTestId("ads-group-wasting").innerText()), "boost picks: every video is in a group, with counts");
  for (const g of ["winning", "underfed", "stopped", "never", "other", "best"]) { await o.getByTestId(`ads-group-${g}`).click(); if (await o.getByTestId("ads-row").count()) break; }
  ok((await o.getByTestId("ads-row").count()) > 0, "boost picks: videos are listed");
  await o.goto(BASE + "/ads?tab=picks&roi=1&orders=1&idle=1"); await o.waitForSelector("[data-testid=ads-picks]");
  let boostable = false;
  for (const g of ["best", "stopped", "underfed", "promise", "never"]) { await o.getByTestId(`ads-group-${g}`).click(); if (await o.locator("[data-testid=ads-row] input[type=checkbox]:not([disabled])").count()) { boostable = true; break; } }
  ok(boostable, "boost picks: at least one video can be ticked");
  await o.locator("[data-testid=ads-row] input[type=checkbox]:not([disabled])").first().check();
  ok(/1 video selected/.test(await o.getByTestId("ads-selection").innerText()), "boost picks: ticking a video starts a batch");
  await Promise.all([o.waitForURL(/tab=planner/), o.getByTestId("ads-open-planner").click()]); await o.waitForSelector("[data-testid=ads-planner]");
  ok((await o.getByTestId("ads-plan-row").count()) === 1 && (await o.getByTestId("ads-plan-seller").isVisible()) && (await o.getByTestId("ads-plan-api").isVisible()), "batch planner: the ticked video, and the two ways to boost it (Seller Center batch, or each through the app)");
  ok(!/RM 3\.50|rounded up|suggest/i.test(await o.getByTestId("ads-planner").innerText()), "batch planner: no budget formula of ours is shown (the minimum and the split are TikTok's)");
  await o.getByTestId("ads-plan-total-input").fill("12");
  await Promise.all([o.waitForURL(/tab=log/), o.getByTestId("ads-mark-boosted").click()]); await o.waitForSelector("[data-testid=ads-log-batch]");
  ok(/Saved/.test(await o.getByTestId("ads-log-saved").innerText()) && /RM 12\.00 A Day/.test(await o.getByTestId("ads-log-batch").first().innerText()) && /Before/.test(await o.getByTestId("ads-log-batch").first().innerText()), "boost log: Mark As Boosted saves the batch with before and after");
  await o.getByTestId("ads-log-delete").first().click(); await o.getByTestId("ads-log-delete-yes").click();
  await o.waitForFunction(() => !document.querySelector("[data-testid=ads-log-batch]"), null, { timeout: 15000 }); ok(true, "boost log: a batch can be removed");
  await o.goto(BASE + "/ads?tab=planner"); await o.waitForSelector("[data-testid=ads-planner-empty]"); ok(true, "batch planner: empty until videos are ticked");
  await o.goto(BASE + "/ads?tab=campaigns&range=90d"); await o.waitForSelector("[data-testid=ads-campaigns]");
  ok((await o.getByTestId("ads-campaign-row").count()) > 0 && (await o.getByTestId("ads-health").count()) > 0, "campaign health: campaigns with a health label");
  await o.goto(BASE + "/ads?tab=products&range=90d"); await o.waitForSelector("[data-testid=ads-products]");
  ok((await o.getByTestId("ads-product-row").count()) > 0 && /What To Do/i.test(await o.locator("main").innerText()), "product performance: products with what to do");
  await o.goto(BASE + "/ads?tab=creators"); await o.waitForSelector("[data-testid=ads-creators], [data-testid=ads-empty-state]"); ok(true, "creator scoreboard opens");
  await o.goto(BASE + "/ads?tab=picks&roi=1&orders=1"); await o.waitForSelector("[data-testid=ads-picks]");
  for (const g of ["best", "winning", "underfed", "stopped", "other", "never"]) { await o.getByTestId(`ads-group-${g}`).click(); if (await o.getByTestId("ads-row").count()) break; }
  await Promise.all([o.waitForURL(/\/ads\/video\//), o.getByTestId("ads-row").first().locator("a").first().click()]); await o.waitForSelector("[data-testid=ads-video]");
  const vt = await o.locator("main").innerText();
  ok(/All-Time Ad Spend/.test(vt) && /Last 60 Days/.test(vt) && /Boost History/.test(vt) && (await o.getByTestId("ads-video-verdict").count()) === 1, "video detail: all-time results, 60 days, verdict and boost history");
  ok(/What TikTok.s API Sent/.test(vt) && ((await o.getByTestId("ads-sent-row").count()) > 0 ? /Delivery Status/i.test(vt) && /Exploration Status/i.test(vt) : /No result rows were saved/.test(vt)), "video detail: shows the raw fields TikTok sent (delivery, exploration, boost, authorization), or says none were saved");
  for (const t of ["picks", "campaigns", "products", "creators", "log"]) { await o.goto(BASE + "/ads?tab=" + t); await o.waitForSelector("h1"); await o.waitForTimeout(300); ok(!(await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `gmv max: ${t} has no sideways scroll on desktop`); }

  // ── date range picker (one for the whole GMV Max section)
  await o.goto(BASE + "/ads"); await o.waitForSelector("[data-testid=ads-range]");
  ok(/Last 7 days/.test(await o.getByTestId("ads-range-label").innerText()), "range: Ads Today opens with Last 7 days");
  await o.getByTestId("ads-range").click(); await o.waitForSelector("[data-testid=ads-range-dialog]");
  const presets = (await o.locator("[data-testid=ads-range-dialog] ul li").allInnerTexts()).map((t) => t.trim());
  ok(presets[0] === "Lifetime" && presets.includes("Yesterday") && presets.includes("Last 30 days") && presets.includes("Last week") && presets.includes("This month"), `range: quick choices on the left (${presets.join(", ")})`);
  ok((await o.locator("[data-testid=ads-range-dialog] [data-day]").count()) >= 50 && /UTC\+08:00/.test(await o.getByTestId("ads-range-dialog").innerText()) && /Confirm/.test(await o.getByTestId("ads-range-dialog").innerText()), "range: a two-month calendar, UTC+08:00, Cancel and Confirm");
  await o.getByTestId("ads-range-30d").click(); await Promise.all([o.waitForURL(/range=30d/), o.getByTestId("ads-range-confirm").click()]);
  await o.waitForSelector("[data-testid=ads-today]"); ok(/Last 30 days/.test(await o.getByTestId("ads-range-label").innerText()), "range: choosing Last 30 days and Confirm changes the page");
  await o.getByTestId("ads-tab-campaigns").click(); await o.waitForSelector("[data-testid=ads-campaigns]");
  ok(/range=30d/.test(o.url()) && /Last 30 days/.test(await o.getByTestId("ads-range-label").innerText()), "range: the choice follows you to the next tab");
  await o.getByTestId("ads-range").click();
  const days = o.locator("[data-testid=ads-range-dialog] [data-day]:not([disabled])");
  const d1 = await days.nth(2).getAttribute("data-day"), d2 = await days.nth(9).getAttribute("data-day");
  await days.nth(2).click(); await days.nth(9).click();
  ok(/–/.test(await o.getByTestId("ads-range-draft").innerText()), "range: click a first day and a last day in the calendar");
  await Promise.all([o.waitForURL(/range=custom/), o.getByTestId("ads-range-confirm").click()]); await o.waitForSelector("[data-testid=ads-campaigns], [data-testid=ads-empty-state]");
  ok(o.url().includes(`from=${d1}`) && o.url().includes(`to=${d2}`), `range: a custom range is in the address (${d1} to ${d2})`);
  await o.getByTestId("ads-tab-picks").click(); await o.waitForSelector("[data-testid=ads-picks]");
  ok(/range=custom/.test(o.url()), "range: a custom range also reaches Boost Picks");
  await o.getByTestId("ads-range").click(); await o.getByTestId("ads-range-lifetime").click(); await Promise.all([o.waitForURL(/range=lifetime/), o.getByTestId("ads-range-confirm").click()]); await o.waitForSelector("[data-testid=ads-picks]");
  ok(/Lifetime/.test(await o.getByTestId("ads-range-label").innerText()), "range: Lifetime");
  await o.getByTestId("ads-tab-planner").click(); await o.waitForSelector("[data-testid=ads-planner-empty]"); ok((await o.getByTestId("ads-range").count()) === 0, "range: the Batch Planner has no date picker (it plans, it does not report)");

  // ── select all
  await o.goto(BASE + "/ads?tab=picks&roi=1&orders=1&idle=1"); await o.waitForSelector("[data-testid=ads-picks]");
  for (const g of ["best", "stopped", "underfed", "promise", "never"]) { await o.getByTestId(`ads-group-${g}`).click(); if (await o.locator("[data-testid=ads-row] input[type=checkbox]:not([disabled])").count() > 1) break; }
  const nBoostable = await o.locator("[data-testid=ads-row] input[type=checkbox]:not([disabled])").count();
  ok(await o.getByTestId("ads-select-all").isVisible() && nBoostable > 1, `select all: a checkbox in the first column header (${nBoostable} videos can be ticked)`);
  await o.getByTestId("ads-select-all").check();
  ok(new RegExp(`${Math.min(nBoostable, 50)} videos? selected`).test(await o.getByTestId("ads-selection").innerText()) && await o.getByTestId("ads-select-all").isChecked(), "select all: ticks every video that can be boosted");
  await o.locator("[data-testid=ads-row] input[type=checkbox]:not([disabled])").first().uncheck();
  ok(await o.getByTestId("ads-select-all").evaluate((e) => e.indeterminate), "select all: shows a dash when only some are ticked");
  await o.getByTestId("ads-select-all").check(); await o.getByTestId("ads-select-all").uncheck();
  ok(/Tick videos/.test(await o.getByTestId("ads-selection").innerText()), "select all: ticking it again clears them");

  // ── boost one video in TikTok from the app (against the pretend TikTok)
  await o.goto(BASE + "/settings?tab=connection&src=ads"); await o.waitForSelector("[data-testid=boost-write-card]");
  ok(/Off/.test(await o.getByTestId("boost-write-switch").innerText()) && (await o.getByTestId("boost-write-max").inputValue()) === "30" && (await o.getByTestId("boost-write-cap").inputValue()) === "50", "boost from app: Settings shows it Off by default, with the limits RM 30 and RM 50");
  await o.goto(BASE + "/ads/video/V22"); await o.waitForSelector("[data-testid=ads-boost-panel]");
  ok(/switched off/.test(await o.getByTestId("ads-boost-off").innerText()) && (await o.getByTestId("ads-boost-go").count()) === 0, "boost from app: while Off, the video page cannot boost");
  await o.goto(BASE + "/settings?tab=connection&src=ads"); await o.waitForSelector("[data-testid=boost-write-card]");
  await o.getByTestId("boost-write-switch").click(); await o.waitForFunction(() => /On/.test(document.querySelector("[data-testid=boost-write-switch]")?.textContent ?? ""), null, { timeout: 15000 });
  ok(true, "boost from app: the owner switches it On");
  await o.goto(BASE + "/ads/video/V22"); await o.waitForSelector("[data-testid=ads-boost-go]");
  ok((await o.getByTestId("ads-boost-campaign").locator("option").count()) >= 1 && /Pillow GMV Max/.test(await o.getByTestId("ads-boost-campaign").innerText()), "boost from app: the campaign this video ran in is offered");
  ok(await o.getByTestId("ads-boost-go").isDisabled(), "boost from app: the button stays disabled until you confirm you understand it spends money");
  await o.getByTestId("ads-boost-budget").fill("40"); await o.getByTestId("ads-boost-sure").check();
  ok(/at most RM 30\.00/.test(await o.getByTestId("ads-boost-problem").innerText()) && (await o.getByTestId("ads-boost-go").isDisabled()), "boost from app: above your limit is stopped on the page");
  await o.getByTestId("ads-boost-budget").fill("5");
  await o.getByTestId("ads-boost-go").click(); await o.getByTestId("ads-boost-confirm-yes").click(); await o.waitForSelector("[data-testid=ads-boost-result]");
  ok(/TikTok said/.test(await o.getByTestId("ads-boost-result").innerText()) && /at least 10/.test(await o.getByTestId("ads-boost-result").innerText()), "boost from app: when TikTok refuses (budget under its minimum), its own message is shown");
  await o.getByTestId("ads-boost-budget").fill("12"); await o.getByTestId("ads-boost-sure").check(); await o.getByTestId("ads-boost-days").selectOption("3");
  await o.getByTestId("ads-boost-go").click(); await o.waitForSelector("[data-testid=ads-boost-confirm]");
  ok(/RM 12\.00 a day/.test(await o.getByTestId("ads-boost-confirm").innerText()) && /3 days/.test(await o.getByTestId("ads-boost-confirm").innerText()) && /up to RM 36\.00/.test(await o.getByTestId("ads-boost-confirm").innerText()), "boost from app: a confirm box says the video, the amount, the days and the most it can spend");
  await o.getByTestId("ads-boost-confirm-yes").click(); await o.waitForFunction(() => /TikTok created the boost/.test(document.querySelector("[data-testid=ads-boost-result]")?.textContent ?? ""), null, { timeout: 20000 });
  ok(true, "boost from app: TikTok creates the boost");
  await o.waitForSelector("[data-testid=ads-boost-blocker]"); ok(/already running/.test(await o.getByTestId("ads-boost-blocker").innerText()), "boost from app: the video then shows a boost is running, so it cannot be boosted twice");
  const sent = await (await fetch("http://127.0.0.1:3999/open_api/v1.3/__sent", { headers: { "access-token": "AT123" } })).json();
  ok(sent.data.created.length >= 1 && sent.data.created.at(-1).session.bid_type === "CREATIVE_NO_BID" && sent.data.created.at(-1).session.item_id === "V22" && sent.data.created.at(-1).session.budget === 12 && sent.data.created.at(-1).session.schedule_type === "SCHEDULE_START_END", "boost from app: TikTok received exactly one creative boost for V22 with RM 12 and an end time");
  await o.getByTestId("ads-boost-stop").first().click(); await o.getByTestId("ads-boost-stop-yes").click();
  await o.waitForFunction(() => !document.querySelector("[data-testid=ads-boost-blocker]"), null, { timeout: 20000 }); ok(true, "boost from app: Stop ends the boost in TikTok and the video can be boosted again");
  const sent2 = await (await fetch("http://127.0.0.1:3999/open_api/v1.3/__sent", { headers: { "access-token": "AT123" } })).json();
  ok(sent2.data.deleted.length >= 1, "boost from app: TikTok received the stop");
  await o.goto(BASE + "/settings?tab=connection&src=ads"); await o.waitForSelector("[data-testid=boost-write-log]");
  const logT = await o.getByTestId("boost-write-log").innerText();
  ok(/Create boost/.test(logT) && /Stop boost/.test(logT) && /Refused/.test(logT) && /OK/.test(logT), "boost from app: the log in Settings shows the create, the refusal and the stop");
  await o.goto(BASE + "/ads?tab=log"); await o.waitForSelector("[data-testid=ads-log-batch]"); ok(/Created in the app|Test Owner|Aisyah|Owner/.test(await o.locator("main").innerText()), "boost from app: it also appears in the Boost Log");
  // Boost All from the planner (the owner has switched it on above; the limits are RM 30 and RM 50)
  await o.goto(BASE + "/ads/video/V1"); await o.waitForSelector("[data-testid=ads-boost-stop]");
  await o.getByTestId("ads-boost-stop").first().click(); await o.getByTestId("ads-boost-stop-yes").click();
  await o.waitForFunction(() => !document.querySelector("[data-testid=ads-boost-stop]"), null, { timeout: 20000 }); ok(true, "boost from app: a boost that was started in TikTok itself can be stopped here too");
  await o.goto(BASE + "/ads?tab=planner&v=" + encodeURIComponent("V22|P1,V1|P1")); await o.waitForSelector("[data-testid=ads-planner]");
  ok((await o.getByTestId("ads-plan-api-row").count()) === 2, "planner: every video is listed for Boost All");
  ok(/already running/.test(await o.getByTestId("ads-plan-api").innerText()) || (await o.getByTestId("ads-plan-api-amount").count()) >= 1, "planner: a video that cannot be boosted says why, in its row");
  await o.getByTestId("ads-plan-api-amount").first().fill("40");
  ok(/at most RM 30\.00/.test(await o.getByTestId("ads-plan-api-problem").innerText()) && (await o.getByTestId("ads-plan-api-go").isDisabled()), "planner: an amount above your limit is stopped before anything is sent");
  await o.getByTestId("ads-plan-api-amount").first().fill("12"); await o.getByTestId("ads-plan-api-amount").last().fill("12"); await o.getByTestId("ads-plan-api-sure").check();
  await o.getByTestId("ads-plan-api-go").click(); await o.waitForSelector("[data-testid=ads-plan-api-confirm]");
  ok(/2 separate creative boosts/.test(await o.getByTestId("ads-plan-api-confirm").innerText()) && /RM 24\.00 a day/.test(await o.getByTestId("ads-plan-api-confirm").innerText()), "planner: a confirm box says how many boosts and how much");
  await o.getByTestId("ads-plan-api-yes").click(); await o.waitForSelector("[data-testid=ads-plan-api-done]", { timeout: 30000 });
  ok(/1 of 2 boosts were created/.test(await o.getByTestId("ads-plan-api-done").innerText()), "planner: Boost All goes one after the other and says how many worked (V22 was just boosted, so only V1 went through)");
  ok((await o.getByTestId("ads-plan-api-result").count()) === 2 && /just boosted/.test(await o.getByTestId("ads-plan-api").innerText()), "planner: each video shows its own answer, a refusal with its reason");
  const sent3 = await (await fetch("http://127.0.0.1:3999/open_api/v1.3/__sent", { headers: { "access-token": "AT123" } })).json();
  ok(sent3.data.created.filter((c) => c.session.item_id === "V1").length === 1 && sent3.data.created.at(-1).session.budget === 12, "planner: TikTok received exactly one boost, for V1, with RM 12");

  // ── a viewer cannot use the connection
  const v = await mk(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/settings"); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, "viewer: Settings is Permission Denied");
  await v.goto(BASE + "/ads"); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, "viewer: GMV Max is Permission Denied");
  ok((await v.evaluate(async () => (await fetch("/api/tiktok-ads/test", { method: "POST" })).status)) === 403, "viewer: the Ads check is refused by the server");
  ok((await v.evaluate(async () => (await fetch("/api/tiktok-ads/sync", { method: "POST", body: "{}" })).status)) === 403, "viewer: an Ads sync is refused by the server");
  // a manager (Data Sync, not Settings) sees the tab but cannot connect
  const m = await mk(); await login(m, "manager@test.local");
  await m.goto(BASE + "/sync?tab=ads"); await m.waitForSelector("[data-testid=ads-board]");
  ok(!(await m.getByTestId("ads-hero").locator("select").count()), "manager: no schedule box without the Settings permission");
  ok(await m.getByTestId("ads-sync-now").isEnabled(), "manager: can press Sync Now");

  // ── disconnect
  await o.goto(BASE + "/settings?tab=connection&src=ads"); await o.waitForSelector("[data-testid=tiktok-ads-card]");
  await o.getByRole("button", { name: "Disconnect" }).click(); await o.getByRole("button", { name: "Yes, disconnect" }).click();
  await o.waitForFunction(() => /Not connected/.test(document.querySelector("[data-testid=tiktok-ads-status]")?.textContent ?? ""), null, { timeout: 15000 });
  ok(true, "ads: Disconnect forgets the login");
  await o.goto(BASE + "/ads"); await o.waitForSelector("[data-testid=ads-not-connected]"); ok(true, "gmv max: without a connection it says to connect first");
  await o.goto(BASE + "/sync?tab=ads"); await o.waitForSelector("[data-testid=ads-offline]"); ok(true, "sync: without a connection the tab offers Open Connection");

  // ── mobile
  const mo = await mk({ width: 390, height: 844 }); await login(mo, "owner@test.local");
  for (const path of ["/settings", "/settings?tab=connection&src=ads", "/sync?tab=ads", "/ads", "/ads?tab=picks", "/ads?tab=campaigns", "/ads?tab=products", "/ads?tab=log"]) { await mo.goto(BASE + path); await mo.waitForSelector("h1"); await mo.waitForTimeout(500); ok(!(await mo.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `mobile: ${path} has no sideways scrolling`); }
  ok(errs.length === 0, "no browser errors"); if (errs.length) console.log(errs);
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
