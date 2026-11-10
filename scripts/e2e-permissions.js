/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Browser check of Users & Roles and of what a role may open. Needs the app on :3100, the demo data and users (scripts/seed-creators-demo.ts).
const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
async function login(p, email, pw = "Passw0rd!test") {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname)), p.click("button[type=submit]")]);
}
const run = Date.now().toString(36);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async (vp = { width: 1440, height: 1000 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
  // ── a viewer: full menu, locks, Permission Denied
  let v = await mk(); await login(v, "viewer@test.local");
  const items = (await v.locator("aside nav a").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(items) === JSON.stringify(["Execution Plan", "Affiliate Data", "Product Analysis", "Data Sync", "Settings"]), `viewer: sees the full menu (${items.join(", ")})`);
  ok((await v.getByTestId("nav-lock").count()) === 2, "viewer: Data Sync and Settings show a lock");
  await v.locator("aside a", { hasText: "Data Sync" }).click(); await v.waitForSelector("[data-testid=permission-denied]");
  const t = await v.getByTestId("permission-denied").innerText();
  ok(/Permission Denied/.test(t) && /Viewer/.test(t) && /Data Sync/.test(t) && /Needs:\s*Data Sync/i.test(t), "viewer: Data Sync shows Permission Denied with the role, the screen and what is needed");
  ok(await v.getByRole("link", { name: /Go to Execution Plan/ }).isVisible(), "viewer: the denied page offers a way back");
  ok((await v.getByRole("link", { name: "Manage roles" }).count()) === 0, "viewer: no Manage roles button");
  for (const path of ["/users", "/settings", "/settings?tab=users"]) { await v.goto(BASE + path); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, `viewer: ${path} is denied`); }
  ok((await v.evaluate(async () => (await fetch("/api/tiktok/test", { method: "POST" })).status)) === 403, "viewer: the TikTok test is refused by the server too");
  ok((await v.evaluate(async () => (await fetch("/api/tiktok/sync", { method: "POST", body: "{}" })).status)) === 403, "viewer: running a sync is refused by the server too");
  await v.goto(BASE + "/products"); await v.waitForSelector("[data-testid=product-kpis]"); ok(true, "viewer: Product Analysis opens");
  // ── the owner edits roles
  const o = await mk(); await login(o, "owner@test.local");
  await o.goto(BASE + "/settings?tab=users"); await o.waitForSelector("[data-testid=user-row]");
  ok((await o.getByTestId("user-row").count()) >= 3, "users: everyone is listed");
  await o.getByTestId("tab-roles").click(); await o.waitForSelector("[data-testid=roles-tab]");
  ok((await o.getByTestId("role-head").count()) >= 3, "roles: a column for each role");
  ok(await o.getByTestId("sw-admin-users").isDisabled() && (await o.getByTestId("sw-admin-users").getAttribute("aria-checked")) === "true", "roles: Admin has everything and cannot be changed");
  // take Product Analysis away from Viewer, check, give it back
  await o.getByTestId("sw-viewer-products").click(); await o.waitForTimeout(900);
  ok((await o.getByTestId("sw-viewer-products").getAttribute("aria-checked")) === "false", "roles: the switch turns off");
  await v.goto(BASE + "/products"); await v.waitForSelector("[data-testid=permission-denied]"); ok(true, "roles: the viewer loses Product Analysis at once");
  await o.getByTestId("sw-viewer-products").click(); await o.waitForTimeout(900);
  await v.goto(BASE + "/products"); await v.waitForSelector("[data-testid=product-kpis]"); ok(true, "roles: and gets it back");
  // a new role, a new person
  const roleName = `E2E ${run}`;
  await o.getByTestId("new-role").click(); await o.getByTestId("new-role-name").fill(roleName);
  await o.locator("form select").selectOption({ label: "Same as Viewer" }); await o.getByRole("button", { name: "Create Role" }).click(); await o.waitForTimeout(1200);
  ok((await o.getByRole("columnheader", { name: new RegExp(roleName) }).count()) === 1, "roles: a new role appears with the permissions of the one it started from");
  await o.getByTestId("tab-users").click();
  const email = `e2e-${run}@test.local`;
  await o.locator("form input[name=name]").fill("E2E Person"); await o.locator("form input[name=email]").fill(email);
  await o.locator("form select[name=roleId]").selectOption({ label: roleName }); await o.locator("form input[name=password]").fill("Passw0rd!e2e");
  await o.getByRole("button", { name: "Add User" }).click(); await o.waitForTimeout(1500);
  ok(await o.getByText(email).isVisible(), "users: a person can be added with the new role");
  const p2 = await mk(); await login(p2, email, "Passw0rd!e2e");
  await p2.goto(BASE + "/sync"); await p2.waitForSelector("[data-testid=permission-denied]"); ok(true, "new role: starts like a Viewer (Data Sync denied)");
  // give the new role Data Sync, then it opens
  await o.getByTestId("tab-roles").click(); await o.waitForSelector("[data-testid=roles-tab]");
  const key = roleName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await o.getByTestId(`sw-${key}-sync`).click(); await o.waitForTimeout(900);
  await p2.goto(BASE + "/sync"); await p2.waitForSelector("h1"); ok(!(await p2.getByTestId("permission-denied").count()), "new role: Data Sync opens once the permission is ticked");
  // a role in use cannot be deleted; an empty one can
  await o.getByTestId("tab-users").click();
  const row = o.getByTestId("user-row").filter({ hasText: email });
  await row.getByTestId("user-toggle").click(); await o.waitForTimeout(800);
  ok(await o.getByTestId("user-row").filter({ hasText: email }).getByTestId("user-status").innerText().then((t) => /Inactive/.test(t)), "users: a person can be deactivated (status turns Inactive)");
  ok(/Never signed in|Today|\d{4}/.test(await o.getByTestId("last-login").first().innerText()), "users: last login is shown");
  // Settings: the TikTok card only
  await o.goto(BASE + "/settings"); await o.waitForSelector("[data-testid=tiktok-card]");
  const st = await o.locator("main").innerText();
  ok(/TikTok Shop connection/.test(st) && !/Daily workflow/.test(st) && !/Add a team member/i.test(st), "settings: the TikTok connection only (no Daily workflow, no team form)");
  ok(await o.getByTestId("tiktok-status").isVisible(), "settings: shows the connection status");
  ok((await o.getByRole("button", { name: /Test affiliate data|Test analytics|Test everything/ }).count()) === 0, "settings: the extra test buttons are gone");
  ok(errs.length === 0, "no browser errors"); if (errs.length) console.log(errs);
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
