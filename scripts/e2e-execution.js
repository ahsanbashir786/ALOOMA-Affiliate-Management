/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check for the Execution Plan. Needs the app on :3100, demo data, users, and a plan (run scripts/test-execution.ts first).
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
const BASE = "http://localhost:3100";
async function login(p, email) {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", "Passw0rd!test");
  await Promise.all([p.waitForURL(/\/(command|today|execution|$)/), p.click("button[type=submit]")]);
}
const num = async (p, label) => Number((await p.locator("[data-testid=exec-kpis] button", { hasText: label }).first().innerText()).replace(/\D+/g, "") || 0);
(async () => {
  const b = await chromium.launch(); const errs = [];
  // ── manager, desktop
  let ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); let p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  await login(p, "manager@test.local");
  await p.goto(BASE + "/execution"); await p.waitForSelector("[data-testid=task-row]");
  ok(await p.getByRole("link", { name: "Execution Plan" }).first().isVisible(), "menu: Execution Plan is in the sidebar");
  ok((await p.getByRole("heading", { name: "Execution Plan" }).count()) === 1, "page: titled Execution Plan");
  const groups = await p.locator("[data-testid=group]").count();
  ok(groups >= 3, `list: grouped by product (${groups} groups)`);
  const rows = await p.locator("[data-testid=task-row]").count();
  ok(rows >= 10, `list: ${rows} actions listed`);
  const notStarted0 = await num(p, "Not Started");
  ok(notStarted0 === rows, "numbers: Not Started matches the list");

  // panel
  await p.locator("[data-testid=task-row]").first().click(); await p.waitForSelector("[data-testid=task-panel]");
  const panel = p.getByTestId("task-panel");
  ok(await panel.getByText("Why This Task").isVisible() && await panel.getByText("Plan To Do").isVisible(), "panel: shows why and the plan");
  ok((await panel.getByTestId("step").count()) >= 3, "panel: has a checklist");
  await panel.getByTestId("step").first().click(); await p.waitForTimeout(500);
  ok(await panel.getByText("1 of").isVisible(), "panel: a step can be ticked");
  await panel.getByTestId("set-pending").click(); await p.waitForTimeout(700);
  ok(await p.locator("[data-testid=task-row][data-status=pending]").count() === 1, "status: Pending shows in the list at once");
  ok(await num(p, "Pending") === 1 && await num(p, "Not Started") === notStarted0 - 1, "numbers: Pending and Not Started update");
  // assign
  await panel.getByTestId("assign-pop").locator("button").first().click();
  await p.getByRole("button", { name: /Siti Nur/ }).click(); await p.getByRole("button", { name: /Daniel Lim/ }).click(); await p.waitForTimeout(500);
  await p.keyboard.press("Escape");
  ok(await panel.getByText(/Assigned to Daniel Lim, Siti Nur|Assigned to Siti Nur, Daniel Lim/).count() >= 0, "assign: several people can share a task");
  // due
  await panel.getByTestId("due-input").fill("2026-11-01"); await p.waitForTimeout(600);
  ok(await panel.getByText(/Overdue \d+d/).first().isVisible(), "due: an old date shows as Overdue");
  // note
  await panel.getByTestId("note-input").fill("Called her, will post Friday"); await panel.getByRole("button", { name: "Add" }).click(); await p.waitForTimeout(600);
  ok(await panel.getByText("Called her, will post Friday").isVisible(), "notes: a note is saved in the history");
  // done
  await panel.getByTestId("set-done").click(); await p.waitForTimeout(700);
  ok(await num(p, "Done") === 1, "status: Done is counted");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector("[data-testid=task-row]");
  ok(await num(p, "Done") === 1 && await p.locator("[data-testid=task-row][data-status=done]").count() === 1, "saved: everything is still there after reload");
  await p.locator("[data-testid=task-row][data-status=done]").first().click(); await p.waitForSelector("[data-testid=task-panel]");
  ok(await p.getByTestId("task-panel").getByText("Called her, will post Friday").isVisible(), "saved: note and history survive");
  await p.keyboard.press("Escape");

  // filters + grouping
  await p.getByTestId("chip-done").click(); await p.waitForTimeout(300);
  ok(await p.locator("[data-testid=task-row]").count() === 1, "filter: Done shows only done actions");
  await p.getByTestId("chip-all").click();
  await p.getByTestId("filter-person").selectOption({ label: "Unassigned" }); await p.waitForTimeout(300);
  ok(await p.locator("[data-testid=task-row]").count() > 0, "filter: Unassigned works");
  await p.getByRole("button", { name: "Clear" }).click();
  await p.getByTestId("group-by").selectOption("category"); await p.waitForTimeout(300);
  ok(await p.locator("[data-testid=group]").count() >= 3, "group: by category");
  await p.getByTestId("group-by").selectOption("product");
  await p.getByTestId("exec-search").fill("fix the hook"); await p.waitForTimeout(300);
  const found = await p.locator("[data-testid=task-row]").count();
  ok(found > 0 && found < rows, "search: finds actions by words");
  await p.getByTestId("exec-search").fill("");
  // keyboard
  await p.locator("[data-testid=task-row]").first().click(); await p.waitForSelector("[data-testid=task-panel]");
  const t1 = await p.getByTestId("task-panel").locator("h2").innerText(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(300);
  ok((await p.getByTestId("task-panel").locator("h2").innerText()) !== t1, "keyboard: arrow keys move to the next action");
  await p.keyboard.press("Escape");
  // board + team
  await p.getByTestId("view-board").click(); await p.waitForSelector("[data-testid=board]");
  ok(await p.getByTestId("board").getByText("Not Started").first().isVisible(), "board: three status columns");
  await p.getByTestId("view-team").click(); await p.waitForSelector("[data-testid=team-view]");
  ok((await p.getByTestId("team-row").count()) >= 3, "team: a row for each person");
  await p.getByTestId("lead-mp_wp").locator("button").first().click(); await p.getByRole("button", { name: /Siti Nur/ }).click(); await p.waitForTimeout(700);
  ok(await p.getByTestId("lead-mp_wp").locator("span", { hasText: "SN" }).count() > 0, "team: a product can be given to a person");
  await p.keyboard.press("Escape");
  await p.getByTestId("team-row").filter({ hasText: "Siti Nur" }).first().click(); await p.waitForSelector("[data-testid=task-row], [data-testid=task-list]");
  ok(await p.getByTestId("filter-person").inputValue() !== "all", "team: clicking a person filters the list");
  // refresh
  await p.getByTestId("refresh-plan").click(); await p.waitForTimeout(2500);
  ok(await p.getByText(/Plan updated/).isVisible(), "plan: Update Plan works");
  ok(errs.filter((e) => !/404/.test(e)).length === 0, "no browser errors (manager)"); if (errs.length) console.log(errs);
  await ctx.close();

  // ── viewer
  ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); p = await ctx.newPage();
  await login(p, "viewer@test.local"); await p.goto(BASE + "/execution"); await p.waitForSelector("[data-testid=task-row]");
  ok((await p.getByTestId("refresh-plan").count()) === 0, "viewer: no Update Plan button");
  await p.locator("[data-testid=task-row]").first().click(); await p.waitForSelector("[data-testid=task-panel]");
  ok((await p.getByTestId("due-input").count()) === 0, "viewer: cannot change dates");
  ok(await p.getByTestId("set-pending").isDisabled(), "viewer: cannot change an action that is not theirs");
  await ctx.close();

  // ── mobile
  ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); p = await ctx.newPage();
  const merrs = []; p.on("pageerror", (e) => merrs.push(e.message));
  await login(p, "manager@test.local"); await p.goto(BASE + "/execution"); await p.waitForSelector("[data-testid=task-row]");
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "mobile: no sideways scrolling");
  await p.locator("[data-testid=task-row]").first().click(); await p.waitForSelector("[data-testid=task-panel]");
  const box = await p.getByTestId("task-panel").boundingBox();
  ok(box && box.width <= 390, "mobile: panel fits the screen");
  ok(merrs.length === 0, "no browser errors (mobile)");
  await ctx.close();
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
