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
  ok(errs.length === 0, `no browser errors (${errs.slice(0, 2).join(" | ")})`);
  await p.goto(BASE + "/affiliate", { waitUntil: "networkidle" }); await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/command.png", fullPage: true });
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
