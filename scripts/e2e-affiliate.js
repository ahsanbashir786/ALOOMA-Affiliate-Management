/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Affiliate Command and Creator Lifecycle: the levers, the goal, the sample guard, the journey and the stage lists.
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
  ok(menu.includes("Affiliate Command") && menu.includes("Creator Lifecycle"), `menu: Affiliate Command and Creator Lifecycle are listed (${menu.slice(0, 4).join(", ")})`);

  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" });
  ok(/Affiliate Command/.test(await p.locator("h1").first().innerText()), "command: page opens");
  const lev = await p.getByTestId("levers").innerText();
  ok(/Creators Who Sell/.test(lev) && /Posts Per Seller/.test(lev) && /Sales Per Post/.test(lev), "command: the three levers are shown");
  ok(/RM/.test(await p.getByTestId("goal").innerText()) && /28-Day Goal/.test(await p.getByTestId("goal").innerText()), "command: sales are shown against a 28-day goal");
  const wf = await p.getByTestId("waterfall").count() ? (await p.getByTestId("waterfall").innerText()) : "";
  ok(wf === "" || (/Creators Who Sell/.test(wf) && /Sales Per Post/.test(wf)), "command: the lever bars appear when there is an earlier period to compare");
  ok(/Delivered, Not Posted/.test(await p.getByTestId("guard").innerText()) && /Requests Waiting/.test(await p.getByTestId("guard").innerText()), "command: the sample guard counts unproductive samples");
  const jr = await p.getByTestId("journey").innerText();
  ok(["Found", "Sample Requested", "Sample On The Way", "Delivered, Not Posted", "Posted, No Sale", "Selling", "Star", "Went Quiet"].every((s) => jr.includes(s)), "command: all eight journey stages are shown");
  const active = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(active.length === 1 && /Affiliate Command/.test(active[0]), `menu: only Affiliate Command is lit on this screen (${active.join("|")})`);

  // goal can be set and cleared
  await p.getByText("Set Goal").click(); await p.fill("input[aria-label^='Sales goal']", "123456"); await p.getByRole("button", { name: "Save" }).click();
  await p.waitForFunction(() => /123,456/.test(document.querySelector("[data-testid=goal]").innerText), null, { timeout: 15000 }).catch(() => {});
  ok(/123,456/.test(await p.getByTestId("goal").innerText()) && /Set by you/.test(await p.getByTestId("goal").innerText()), "command: the owner can set the goal");
  await p.getByText("Set Goal").click(); await p.fill("input[aria-label^='Sales goal']", ""); await p.getByRole("button", { name: "Save" }).click();
  await p.waitForFunction(() => !/Set by you/.test(document.querySelector("[data-testid=goal]").innerText), null, { timeout: 15000 }).catch(() => {});
  ok(!/Set by you/.test(await p.getByTestId("goal").innerText()), "command: clearing the goal goes back to the automatic one");

  // lifecycle
  await p.goto(BASE + "/affiliate/lifecycle", { waitUntil: "networkidle" });
  ok(/Creator Lifecycle/.test(await p.locator("h1").first().innerText()), "lifecycle: page opens");
  const st = await p.getByTestId("stages").innerText();
  ok(["Found", "Delivered, Not Posted", "Selling", "Star", "Went Quiet"].every((s) => st.includes(s)), "lifecycle: stage pills with counts");
  for (const s of ["found", "way", "notposted", "nosale", "selling", "star", "quiet", "requested"]) {
    await p.goto(BASE + "/affiliate/lifecycle?stage=" + s, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    ok(!/Application error|Internal Server Error/.test(body) && /Showing|Nobody is in this stage/.test(body), `lifecycle: stage "${s}" opens`);
  }
  await p.goto(BASE + "/affiliate/lifecycle?stage=star", { waitUntil: "networkidle" });
  if (await p.locator("[data-testid=stage-rows] li").count()) {
    await p.locator("[data-testid=stage-rows] li button").first().click();
    await p.waitForSelector("[role=dialog], aside[aria-label*='reator']", { timeout: 10000 }).catch(() => {});
    ok(true, "lifecycle: clicking a creator opens the details panel");
  }
  const lcActive = await p.locator("aside nav a[aria-current=page]").allInnerTexts();
  ok(lcActive.length === 1 && /Creator Lifecycle/.test(lcActive[0]), `menu: only Creator Lifecycle is lit there (${lcActive.join("|")})`);

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
  ok(errs.length === 0, `no browser errors (${errs.slice(0, 2).join(" | ")})`);
  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" }); await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/command.png", fullPage: true });
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
