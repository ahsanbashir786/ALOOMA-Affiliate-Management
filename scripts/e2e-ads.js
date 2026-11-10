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
  await o.waitForFunction(() => { const n = document.querySelector("[data-testid=ads-ds-campaign_daily] p.tnum"); return n && Number(n.textContent.replace(/,/g, "")) > 0; }, null, { timeout: 60000 });
  await o.waitForFunction(() => document.querySelector("[data-testid=ads-hero]")?.getAttribute("data-state") === "ok", null, { timeout: 60000 });
  const num = async (k) => Number((await o.getByTestId(`ads-ds-${k}`).locator("p.tnum").innerText()).replace(/,/g, ""));
  ok((await num("advertisers")) === 1 && (await num("stores")) === 1 && (await num("campaigns")) === 2, "sync: accounts, shops and campaigns arrive");
  ok((await num("videos")) === 3 && (await num("boosts")) === 1, "sync: videos and creative boosts arrive");
  ok((await num("campaign_daily")) >= 80 && (await num("creative_daily")) >= 80 && (await num("product_daily")) >= 80, `sync: daily results arrive (${await num("campaign_daily")} campaign-days)`);
  ok(/Everything Is Up To Date/.test(await o.getByTestId("ads-hero").innerText()), "sync: the hero says everything is up to date");
  await o.getByTestId("ads-ds-campaigns").locator("summary").click();
  ok(/campaign_id/.test(await o.getByTestId("ads-ds-campaigns").locator("pre").innerText()), "sync: 'What TikTok sent' shows the first record");
  ok(!(await o.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "sync: no sideways scroll on desktop");
  await o.getByTestId("sync-tab-affiliate").click(); await o.waitForSelector("[data-testid=sync-hero], [data-testid=sync-offline]"); ok(true, "sync: the Affiliate tab still works");

  // ── a viewer cannot use the connection
  const v = await mk(); await login(v, "viewer@test.local");
  await v.goto(BASE + "/settings"); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, "viewer: Settings is Permission Denied");
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
  await o.goto(BASE + "/sync?tab=ads"); await o.waitForSelector("[data-testid=ads-offline]"); ok(true, "sync: without a connection the tab offers Open Connection");

  // ── mobile
  const mo = await mk({ width: 390, height: 844 }); await login(mo, "owner@test.local");
  for (const path of ["/settings", "/settings?tab=connection&src=ads", "/sync?tab=ads"]) { await mo.goto(BASE + path); await mo.waitForSelector("h1"); await mo.waitForTimeout(500); ok(!(await mo.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `mobile: ${path} has no sideways scrolling`); }
  ok(errs.length === 0, "no browser errors"); if (errs.length) console.log(errs);
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
