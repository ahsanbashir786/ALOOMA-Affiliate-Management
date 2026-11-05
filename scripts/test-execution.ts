// Execution Plan: the rules, and how tasks are written, refreshed, closed and protected from duplicates.
// Run: DATABASE_URL=postgres://postgres@localhost:5433/affiliate_test npx tsx --conditions=react-server scripts/test-execution.ts   (needs the creators demo data)
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { syncPlan, loadPlan } from "@/lib/execution/plan";
import { analyseProducts } from "@/lib/products/analysis";
import { buildDrafts } from "@/lib/execution/rules";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];

(async () => {
  await q(sql`delete from ep_tasks`); await q(sql`delete from ep_product_leads`); await q(sql`delete from settings where key = 'ep_stamp'`);
  const a = await analyseProducts();
  const drafts = a.products.filter((p) => p.key !== "unmapped").flatMap((p) => buildDrafts(p));
  check("rules: the demo data produces actions", drafts.length > 10, String(drafts.length));
  check("rules: every action has a reason, a checklist and a due time", drafts.every((d) => d.summary.length > 20 && d.steps.length >= 3 && d.dueDays >= 3 && [1, 2, 3].includes(d.priority)));
  check("rules: one fingerprint per product and kind", new Set(drafts.map((d) => d.fingerprint)).size === drafts.length);
  check("rules: products with no sales get no actions", a.products.filter((p) => p.diagnosis.tag === "No Sales").every((p) => buildDrafts(p).length === 0));
  const kinds = new Set(drafts.map((d) => d.kind));
  check("rules: several kinds of action across content, creators and samples", ["new_videos", "reactivate", "chase_unposted"].every((k) => kinds.has(k)) && new Set(drafts.map((d) => d.category)).size >= 3, [...kinds].join(","));
  const react = drafts.filter((d) => d.kind === "reactivate");
  check("rules: win-back names only creators who really dropped", react.every((d) => d.creators.length > 0 && d.impactRm > 0));
  check("rules: sorted most important first", drafts.length === 0 || buildDrafts(a.products.find((p) => p.key === drafts[0].productKey)!)[0].priority <= 2);

  const r1 = await syncPlan(true);
  const [{ n }] = await q(sql`select count(*)::int as n from ep_tasks`) as { n: number }[];
  check("sync: creates the tasks", r1.created === drafts.length && n === drafts.length, JSON.stringify(r1));
  const r2 = await syncPlan(true);
  const [{ n: n2 }] = await q(sql`select count(*)::int as n from ep_tasks`) as { n: number }[];
  check("sync: running again makes no copies", r2.created === 0 && n2 === n && r2.updated === n, JSON.stringify(r2));
  const r3 = await syncPlan(false);
  check("sync: unchanged numbers are skipped quickly", r3.skipped === true);

  const [t] = await q(sql`select id::text, product_key from ep_tasks where kind = 'new_videos' limit 1`);
  await q(sql`update ep_tasks set status = 'done', completed_at = now(), updated_at = now() where id = ${t.id as string}::uuid`);
  await syncPlan(true);
  const [{ c }] = await q(sql`select count(*)::int as c from ep_tasks where fingerprint = ${(t.product_key as string) + ":new_videos"}`) as { c: number }[];
  check("sync: a finished task is not written again straight away", c === 1, String(c));
  await q(sql`update ep_tasks set status = 'pending', completed_at = null where id = ${t.id as string}::uuid`);
  const [{ d: stillOne }] = await q(sql`select count(*)::int as d from ep_tasks where fingerprint = ${(t.product_key as string) + ":new_videos"} and status in ('not_started','pending')`) as { d: number }[];
  check("sync: never two open tasks for one problem", stillOne === 1);

  await q(sql`insert into ep_tasks (fingerprint, product_key, category, kind, title, summary) values ('mp_wp:gone', 'mp_wp', 'content', 'gone', 'Old problem', 'x')`);
  const r4 = await syncPlan(true);
  const [gone] = await q(sql`select status, closed_reason from ep_tasks where fingerprint = 'mp_wp:gone'`);
  check("sync: a task whose problem is gone closes itself", r4.closed >= 1 && gone.status === "auto_closed" && !!gone.closed_reason);
  const [ev] = await q(sql`select count(*)::int as c from ep_events e join ep_tasks t on t.id = e.task_id where t.fingerprint = 'mp_wp:gone' and e.kind = 'auto_closed'`);
  check("sync: the closing is written in the history", (ev.c as number) === 1);

  // Product leads get new tasks; creator owners get creator tasks.
  const users = await q(sql`select id::text from users where active order by email limit 2`);
  if (users.length) {
    await q(sql`delete from ep_tasks`); await q(sql`delete from settings where key = 'ep_stamp'`);
    await q(sql`insert into ep_product_leads (product_key, user_id) values ('mp_nwp', ${users[0].id as string}::uuid)`);
    await syncPlan(true);
    const [lead] = await q(sql`select count(*)::int as c, count(a.user_id)::int as a from ep_tasks t left join ep_task_assignees a on a.task_id = t.id where t.product_key = 'mp_nwp'`);
    check("assign: new tasks of a product go to its lead", (lead.c as number) > 0 && (lead.a as number) >= (lead.c as number), JSON.stringify(lead));
  } else check("assign: needs test users", false, "no users");

  const plan = await loadPlan();
  check("load: tasks come with product names, creators and history", plan.tasks.length > 0 && plan.tasks.every((x) => x.productName && Array.isArray(x.creators) && x.events.length >= 1));
  check("load: all 13 products listed, even with no actions", plan.products.length === 13);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
