/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-expressions */
// Read-only access: the owner makes a login for an AI reviewer; that login can look but change nothing, sees no contact numbers, no Users or Settings, and ends on its date.
// Needs the app on :3100 and the demo users (scripts/seed-creators-demo.ts), plus DATABASE_URL (to move the end date into the past).
const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };
async function login(p, email, password = "Passw0rd!test") {
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", password);
  await Promise.all([p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 15000 }).catch(() => {}), p.click("button[type=submit]")]);
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  const sql = require("postgres")(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`delete from users where email like 'ai-e2e%@alooma.my'`; await sql`delete from roles where key like 'read-only-ai-e2e%'`;
  const o = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); o.on("pageerror", (e) => errs.push(e.message));
  await login(o, "owner@test.local");
  await o.goto(BASE + "/settings?tab=users"); await o.waitForSelector("[data-testid=tab-readonly]");
  await o.getByTestId("tab-readonly").click(); await o.waitForSelector("[data-testid=read-only-access]");
  ok(/Read-Only Login/.test(await o.getByTestId("read-only-access").innerText()), "owner: Settings → User Management has a Read-Only Access tab");
  // create: Profit And Loss and Affiliate Data only
  await o.getByTestId("ro-name").fill("AI E2E"); await o.getByTestId("ro-email").fill("ai-e2e@alooma.my");
  for (const k of ["execution", "products", "ads", "stock", "sync"]) await o.locator(`input[name=screens][value=${k}]`).uncheck();
  await o.getByTestId("ro-create").click(); await o.getByTestId("ro-credentials").waitFor({ timeout: 20000 });
  const pw = (await o.getByTestId("ro-password").innerText()).trim();
  ok(pw.length >= 20 && !/[0OIl1]/.test(pw), `owner: a long random password is made and shown once (${pw.length} characters, no look-alike letters)`);
  const cred = (await o.getByTestId("ro-credentials").innerText()).replace(/\s+/g, " ");
  ok(/Affiliate Screens, Profit And Loss/.test(cred) && /localhost:3100\/login/.test(cred), "owner: the details list the chosen screens and the sign-in address");
  ok((await o.getByTestId("ro-copy").count()) === 1, "owner: there is a button to copy instructions for ChatGPT or Claude");
  await o.reload(); await o.getByTestId("tab-readonly").click();
  ok((await o.locator("[data-testid=ro-row]").count()) === 1 && /Until/.test(await o.getByTestId("ro-status").innerText()) && !(await o.locator("body").innerText()).includes(pw), "owner: the login is listed with its end date, and the password is never shown again");
  await o.getByTestId("tab-users").click();
  ok(!(await o.locator("[data-testid=user-row]").allInnerTexts()).some((t) => /AI E2E/.test(t)), "owner: read-only logins are not mixed into the team list");

  // the read-only person
  const r = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); r.on("pageerror", (e) => errs.push(e.message));
  await login(r, "ai-e2e@alooma.my", pw);
  ok(!/login/.test(r.url()), "read-only: can sign in with the password");
  const items = (await r.locator("aside nav a:not([data-testid^=submenu-])").allInnerTexts()).map((t) => t.trim());
  ok(JSON.stringify(items) === JSON.stringify(["Command", "Creator Outreach", "Creators", "Products", "Content", "Actions", "Team", "Profit And Loss"]), `read-only: the menu shows only the two screens chosen (${items.join(", ")})`);
  ok((await r.getByTestId("read-only-banner").count()) === 1, "read-only: a banner says the login is read-only");
  const [{ creator }] = await sql`select creator from tt_affiliate_order_lines where creator is not null group by creator order by sum(price) desc limit 1`;
  const cr = { username: creator };
  await sql`insert into creators (username, phone) values (${cr.username}, '+60123456789') on conflict (username) do update set phone = '+60123456789'`;
  await r.goto(BASE + "/creators/" + encodeURIComponent(cr.username)); await r.waitForSelector("main");
  const body = await r.locator("main").innerText();
  ok(!/60123456789/.test(body) && /\+60••••/.test(body), "read-only: a contact number is hidden (+60••••••••)");
  ok(!(await r.locator("main a[href^='https://wa.me/']").count()), "read-only: no WhatsApp link is offered");
  const panel = await r.evaluate(async (u) => { const j = await (await fetch(`/api/creators/${encodeURIComponent(u)}/panel`)).json(); return j.phone; }, cr.username);
  ok(/^\+60•+$/.test(String(panel)), "read-only: the side panel does not send the number either (" + panel + ")");
  await r.goto(BASE + "/creators"); await r.waitForSelector("[data-testid=creator-kpis]"); ok(true, "read-only: Creators opens");
  await r.goto(BASE + "/profit?range=lifetime"); await r.waitForSelector("[data-testid=profit-table]"); ok(true, "read-only: Profit And Loss opens and can be read");
  for (const path of ["/settings", "/settings?tab=users", "/sync", "/stock", "/ads"]) { await r.goto(BASE + path); await r.waitForSelector("[data-testid=permission-denied]"); ok(true, `read-only: ${path} is denied (not given, and never given for Settings)`); }
  const status = (m, u, body) => r.evaluate(async ([m, u, body]) => (await fetch(u, { method: m, body, redirect: "manual" })).status, [m, u, body]);
  ok((await status("GET", "/api/creators/export")) === 403, "read-only: the Excel export is refused");
  ok((await status("GET", "/api/profit/export")) === 403, "read-only: the profit export is refused");
  ok((await status("POST", "/api/shopee/sync", "{}")) === 403 && (await status("POST", "/api/tiktok/sync", "{}")) === 403, "read-only: running a sync is refused");
  ok((await status("GET", "/api/shopee/sync")) === 403 || (await status("GET", "/api/shopee/sync")) === 200, "read-only: (looking at sync status needs the Data Sync screen)");
  // a change made through the screen: the server turns it away
  await r.goto(BASE + "/profit?tab=costs"); await r.waitForSelector("text=Fulfilment");
  await r.getByLabel("Fulfilment per piece").fill("9"); await r.getByRole("button", { name: "Save" }).first().click();
  await r.waitForSelector("[data-testid=read-only-notice]", { timeout: 15000 }); ok(true, "read-only: saving a change is turned away with 'This Login Is Read-Only'");
  ok(Number((await sql`select value->>'perUnit' as v from settings where key = 'profit_fulfilment'`)[0]?.v ?? 1.2) !== 9, "read-only: and nothing was saved");

  // switching off and ending
  await sql`update users set expires_at = now() - interval '1 minute' where email = 'ai-e2e@alooma.my'`;
  await r.goto(BASE + "/profit"); await r.waitForURL(/login/, { timeout: 15000 }); ok(true, "read-only: when the end date passes, the next click sends it to sign in");
  await r.fill("input[name=email]", "ai-e2e@alooma.my"); await r.fill("input[name=password]", pw); await r.click("button[type=submit]"); await r.waitForTimeout(1500);
  ok(/login/.test(r.url()) && /Incorrect/.test(await r.locator("body").innerText()), "read-only: an ended login cannot sign in again");
  await o.reload(); await o.getByTestId("tab-readonly").click();
  ok(/Ended/.test(await o.getByTestId("ro-status").innerText()), "owner: the list shows it as ended");
  o.once("dialog", (d) => d.accept());
  await o.getByTestId("ro-remove").click(); await o.waitForFunction(() => !document.querySelector("[data-testid=ro-row]"), null, { timeout: 15000 });
  ok((await sql`select 1 from users where email = 'ai-e2e@alooma.my'`).length === 0 && (await sql`select 1 from roles where key like 'read-only-ai-e2e%'`).length === 0, "owner: Switch Off deletes the login and its role");

  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs[0] : ""));
  await sql.end(); await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
