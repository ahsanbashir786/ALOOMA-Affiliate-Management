// Execution Plan: the rules, and how tasks are written, refreshed, closed and protected from duplicates.
// Run: DATABASE_URL=postgres://postgres@localhost:5433/affiliate_test npx tsx --conditions=react-server scripts/test-execution.ts   (needs the creators demo data)
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { syncPlan, loadPlan } from "@/lib/execution/plan";
import { analyseProducts } from "@/lib/products/analysis";
import { buildDrafts, CREATOR_RANK } from "@/lib/execution/rules";
import { loadHistory } from "@/lib/execution/history";
import { todayKL } from "@/lib/time";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];

(async () => {
  await q(sql`delete from ep_tasks`); await q(sql`delete from settings where key = 'ep_stamp'`);
  const a = await analyseProducts();
  const history = await loadHistory(a);
  const ctx = { history, today: todayKL(), periodStart: a.period.start, prevStart: a.period.prevStart };
  const drafts = a.products.filter((p) => p.key !== "unmapped").flatMap((p) => buildDrafts(p, ctx));
  check("rules: the demo data produces actions", drafts.length > 10, String(drafts.length));
  check("rules: every action has a reason, a checklist and a due time", drafts.every((d) => d.summary.length > 20 && d.steps.length >= 3 && d.dueDays >= 3 && [1, 2, 3].includes(d.priority)));
  check("rules: one fingerprint per product and kind", new Set(drafts.map((d) => d.fingerprint)).size === drafts.length);
  check("rules: products with no sales get no actions", a.products.filter((p) => p.diagnosis.tag === "No Sales").every((p) => buildDrafts(p, ctx).length === 0));
  check("rules: a creator is never listed twice in one action", drafts.every((d) => new Set(d.creators.map((c) => c.name)).size === d.creators.length));
  // One main action per creator per product.
  const byProduct = new Map<string, Map<string, string[]>>();
  for (const d of drafts) if (CREATOR_RANK[d.kind] !== undefined) for (const c of d.creators) {
    const m2 = byProduct.get(d.productKey) ?? byProduct.set(d.productKey, new Map()).get(d.productKey)!;
    (m2.get(c.name) ?? m2.set(c.name, []).get(c.name)!).push(d.kind);
  }
  const repeats = [...byProduct.values()].reduce((n, m2) => n + [...m2.values()].filter((k) => k.length > 1).length, 0);
  check("one action: no creator is in two actions of the same product", repeats === 0, `${repeats} repeats`);
  const alsoLines = drafts.flatMap((d) => d.creators).filter((c) => (c.data.also?.length ?? 0) > 0).length;
  check("one action: the other asks are kept as notes on the creator's line", alsoLines > 0, String(alsoLines));
  const rank = (k: string) => CREATOR_RANK[k];
  const wrongOrder = drafts.some((d) => d.creators.some((c) => (c.data.also ?? []).some((k) => rank(k) < rank(d.kind))));
  check("one action: a creator sits in the most important action that applies", !wrongOrder);
  const refs = drafts.filter((d) => ["fix_conversion", "low_views"].includes(d.kind));
  check("one action: product-level actions do not list creators to contact", refs.every((d) => d.kind !== "low_views" || d.creators.length === 0));
  // LIVE actions: always High, always first in their product, and they claim their creators first.
  const base0 = a.products.find((p) => p.diagnosis.tag !== "No Sales" && p.metrics.sales.now > 500)!;
  const noLive = structuredClone(base0);
  noLive.metrics.buckets.now.live = 0; noLive.metrics.buckets.prev.live = 0; noLive.metrics.sales.now = Math.max(noLive.metrics.sales.now, 5000);
  const liveDrafts = buildDrafts(noLive, ctx);
  const liveOne = liveDrafts.find((d) => d.kind === "live_push");
  check("LIVE: a product with little LIVE gets a LIVE action", !!liveOne && liveOne.creators.length > 0);
  check("LIVE: the LIVE action is High priority and first in its product", !!liveOne && liveOne.priority === 1 && liveDrafts[0].kind === "live_push");
  check("LIVE: its creators are not repeated in other actions of the product", !!liveOne && liveDrafts.filter((d) => d.kind !== "live_push" && CREATOR_RANK[d.kind] !== undefined).every((d) => d.creators.every((c) => !liveOne.creators.some((l) => l.name === c.name))));
  const kinds = new Set(drafts.map((d) => d.kind));
  console.log("kinds:", Object.fromEntries([...kinds].map((k) => [k, drafts.filter((d) => d.kind === k).reduce((n, d) => n + d.creators.length, 0)])));
  check("rules: several kinds of action across content, creators and samples", ["new_videos", "reactivate", "chase_unposted"].every((k) => kinds.has(k)) && new Set(drafts.map((d) => d.category)).size >= 3, [...kinds].join(","));
  const react = drafts.filter((d) => d.kind === "reactivate");
  check("rules: win-back names only creators who really dropped", react.every((d) => d.creators.length > 0 && d.impactRm > 0));
  check("rules: sorted most important first", drafts.length === 0 || buildDrafts(a.products.find((p) => p.key === drafts[0].productKey)!, ctx)[0].priority <= 2);

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

  // Full lists, personal video details, and ticks that survive a refresh.
  const biggest = drafts.reduce((m, d) => (d.creators.length > m.creators.length ? d : m), drafts[0]);
  const [stored] = await q(sql`select count(*)::int as n from ep_task_creators tc join ep_tasks t on t.id = tc.task_id where t.fingerprint = ${biggest.fingerprint}`);
  check("lists: an action keeps every creator, not just a few", (stored.n as number) === biggest.creators.length && biggest.creators.length > 100, `${stored.n} of ${biggest.creators.length}`);
  const old = drafts.filter((d) => d.kind === "refresh_old");
  check("videos: every creator in a refresh action comes with the old video to remake", old.every((d) => d.creators.every((c) => (c.data.videos?.length ?? 0) > 0 && !!c.data.videos![0].url)), "missing video");
  const lapsed = drafts.filter((d) => d.kind === "lapsed_stars" || d.kind === "lapsed_regular" || d.kind === "one_hit");
  check("history: past sellers who went quiet are found from older sales", lapsed.length > 0 && lapsed.every((d) => d.creators.every((c) => (c.data.lifetime ?? 0) > 0 && (c.data.daysSince ?? 0) >= 28)));
  check("history: proven sellers of other products are offered this one", drafts.some((d) => d.kind === "cross_sell" && d.creators.length >= 5));
  const [pick] = await q(sql`select tc.task_id::text as tid, tc.username from ep_task_creators tc join ep_tasks t on t.id = tc.task_id where t.fingerprint = ${biggest.fingerprint} order by tc.rank limit 1`);
  await q(sql`update ep_task_creators set contacted_at = now() where task_id = ${pick.tid as string}::uuid and username = ${pick.username as string}`);
  await syncPlan(true);
  const [kept] = await q(sql`select count(*)::int as n from ep_task_creators where task_id = ${pick.tid as string}::uuid and username = ${pick.username as string} and contacted_at is not null`);
  check("ticks: a contacted creator stays ticked after the plan is refreshed", (kept.n as number) === 1);

  const plan = await loadPlan();
  check("load: the list gets counts, not thousands of creators", plan.tasks.every((x) => x.creators.length <= 5 && x.creatorCount >= x.creators.length) && plan.tasks.some((x) => x.contactedCount === 1));
  check("load: tasks come with product names, creators and history", plan.tasks.length > 0 && plan.tasks.every((x) => x.productName && Array.isArray(x.creators) && x.events.length >= 1));
  check("load: all 13 products listed, even with no actions", plan.products.length === 13);

  // Leave a clean plan behind (the browser test starts from it).
  await q(sql`delete from ep_tasks`); await q(sql`delete from settings where key = 'ep_stamp'`); await syncPlan(true);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
