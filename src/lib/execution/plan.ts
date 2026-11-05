import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rows } from "@/lib/analytics/sql";
import { analyseProducts } from "@/lib/products/analysis";
import { PRODUCTS, productName } from "@/lib/products/catalog";
import { addDaysISO, todayKL } from "@/lib/time";
import { buildDrafts, type Draft } from "./rules";

export type Status = "not_started" | "pending" | "done" | "skipped" | "auto_closed";
export const OPEN: Status[] = ["not_started", "pending"];

export type TaskView = {
  id: string; productKey: string; productName: string; category: string; kind: string; priority: 1 | 2 | 3;
  title: string; summary: string; steps: string[]; stepsDone: number[];
  creators: { name: string; note: string; owner: string | null }[];
  evidence: Record<string, number | string>; impactRm: number; status: Status; dueOn: string | null; closedReason: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null; assignees: string[];
  events: { id: number; user: string | null; kind: string; text: string | null; at: string }[];
};
export type ProductBrief = { key: string; name: string; tag: string; sales: number; change: number; changePct: number | null; fragile: boolean | null };
export type Staff = { id: string; name: string; role: string };
export type PlanData = { tasks: TaskView[]; products: ProductBrief[]; staff: Staff[]; leads: Record<string, string[]>; today: string; generatedAt: string | null };

const COOLDOWN_DONE = 14;
const COOLDOWN_SKIPPED = 30;

/** Writes the plan from today's product analysis: new problems become tasks, known ones are refreshed, solved ones close themselves. */
export async function syncPlan(force = false): Promise<{ created: number; updated: number; closed: number; skipped: boolean }> {
  const a = await analyseProducts();
  const drafts: Draft[] = a.products.filter((p) => p.key !== "unmapped").flatMap((p) => buildDrafts(p));
  const stamp = createHash("sha1").update(JSON.stringify(drafts.map((d) => [d.fingerprint, d.title, d.summary, d.priority, d.creators, Math.round(d.impactRm)])) + todayKL()).digest("hex");
  const [last] = await rows<{ value: unknown }>(sql`select value from settings where key = 'ep_stamp'`);
  if (!force && last && last.value === stamp) return { created: 0, updated: 0, closed: 0, skipped: true };

  const today = todayKL();
  let created = 0, updated = 0, closed = 0;
  await db.transaction(async (tx) => {
    const q = async (s: ReturnType<typeof sql>) => (await tx.execute(s)) as unknown as Record<string, unknown>[];
    const open = await q(sql`select id::text, fingerprint from ep_tasks where status in ('not_started', 'pending')`);
    const openBy = new Map(open.map((r) => [r.fingerprint as string, r.id as string]));
    const recent = await q(sql`
      select fingerprint, status, max(coalesce(completed_at, updated_at)) as at from ep_tasks
      where status in ('done', 'skipped') and updated_at > now() - interval '45 days' group by 1, 2`);
    const cool = new Map<string, number>();
    for (const r of recent) {
      const days = (Date.now() - new Date(r.at as string).getTime()) / 86_400_000;
      const limit = r.status === "skipped" ? COOLDOWN_SKIPPED : COOLDOWN_DONE;
      if (days < limit) cool.set(r.fingerprint as string, 1);
    }
    const leads = new Map<string, string[]>();
    for (const r of await q(sql`select product_key, user_id::text as uid from ep_product_leads`)) (leads.get(r.product_key as string) ?? leads.set(r.product_key as string, []).get(r.product_key as string)!).push(r.uid as string);
    const owners = new Map((await q(sql`select username, user_id::text as uid from creator_owners where user_id is not null`)).map((r) => [r.username as string, r.uid as string]));

    for (const d of drafts) {
      const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
      const id = openBy.get(d.fingerprint);
      if (id) {
        await q(sql`update ep_tasks set title = ${d.title}, summary = ${d.summary}, steps = ${json(d.steps)}, creators = ${json(d.creators)}, evidence = ${json(d.evidence)},
          impact_rm = ${d.impactRm}, priority = ${d.priority}, updated_at = now() where id = ${id}::uuid`);
        updated++;
        continue;
      }
      if (cool.has(d.fingerprint)) continue;
      const [row] = await q(sql`insert into ep_tasks (fingerprint, product_key, category, kind, priority, title, summary, steps, creators, evidence, impact_rm, due_on)
        values (${d.fingerprint}, ${d.productKey}, ${d.category}, ${d.kind}, ${d.priority}, ${d.title}, ${d.summary}, ${json(d.steps)}, ${json(d.creators)}, ${json(d.evidence)}, ${d.impactRm},
          ${addDaysISO(today, d.dueDays)}::date)
        on conflict do nothing returning id::text`);
      if (!row) continue;
      created++;
      const tid = row.id as string;
      // Who handles it: the product's leads; otherwise the person who owns most of the creators named in it.
      let who = leads.get(d.productKey) ?? [];
      if (!who.length && d.creators.length) {
        const count = new Map<string, number>();
        for (const c of d.creators) { const o = owners.get(c.name); if (o) count.set(o, (count.get(o) ?? 0) + 1); }
        const best = [...count.entries()].sort((x, y) => y[1] - x[1])[0];
        if (best) who = [best[0]];
      }
      for (const u of who) await q(sql`insert into ep_task_assignees (task_id, user_id) values (${tid}::uuid, ${u}::uuid) on conflict do nothing`);
      await q(sql`insert into ep_events (task_id, kind, text) values (${tid}::uuid, 'created', ${who.length ? "Created by the system and assigned automatically." : "Created by the system."})`);
    }
    const live = new Set(drafts.map((d) => d.fingerprint));
    for (const [fp, id] of openBy) {
      if (live.has(fp)) continue;
      await q(sql`update ep_tasks set status = 'auto_closed', closed_reason = 'The problem is gone: the numbers improved.', updated_at = now() where id = ${id}::uuid`);
      await q(sql`insert into ep_events (task_id, kind, text) values (${id}::uuid, 'auto_closed', 'Closed by the system: the numbers improved, so this is no longer needed.')`);
      closed++;
    }
    await q(sql`insert into settings (key, value) values ('ep_stamp', ${JSON.stringify(stamp)}::jsonb) on conflict (key) do update set value = excluded.value`);
  });
  return { created, updated, closed, skipped: false };
}

export async function loadPlan(): Promise<PlanData> {
  const [tasks, assignees, events, users, leads, owners, a, stamp] = await Promise.all([
    rows<{ id: string; product_key: string; category: string; kind: string; priority: number; title: string; summary: string; steps: string[]; steps_done: number[]; creators: { name: string; note: string }[]; evidence: Record<string, number | string>; impact: number; status: Status; due_on: string | null; closed_reason: string | null; created_at: string; updated_at: string; completed_at: string | null }>(sql`
      select id::text, product_key, category, kind, priority::int, title, summary, steps, steps_done, creators, evidence, impact_rm::float8 as impact, status,
        to_char(due_on, 'YYYY-MM-DD') as due_on, closed_reason, created_at::text, updated_at::text, completed_at::text
      from ep_tasks where status in ('not_started', 'pending') or updated_at > now() - interval '60 days' order by created_at desc`),
    rows<{ task_id: string; user_id: string }>(sql`select task_id::text, user_id::text from ep_task_assignees`),
    rows<{ id: number; task_id: string; user: string | null; kind: string; text: string | null; at: string }>(sql`
      select e.id::int, e.task_id::text, u.name as user, e.kind, e.text, e.created_at::text as at from ep_events e left join users u on u.id = e.user_id order by e.created_at, e.id`),
    rows<Staff>(sql`select id::text, name, role::text from users where active order by name`),
    rows<{ product_key: string; user_id: string }>(sql`select product_key, user_id::text from ep_product_leads`),
    rows<{ username: string; name: string }>(sql`select o.username, u.name from creator_owners o join users u on u.id = o.user_id`),
    analyseProducts(),
    rows<{ value: unknown }>(sql`select updated_at::text as value from ep_tasks order by updated_at desc limit 1`),
  ]);
  const who = new Map<string, string[]>();
  for (const r of assignees) (who.get(r.task_id) ?? who.set(r.task_id, []).get(r.task_id)!).push(r.user_id);
  const ev = new Map<string, TaskView["events"]>();
  for (const e of events) (ev.get(e.task_id) ?? ev.set(e.task_id, []).get(e.task_id)!).push({ id: e.id, user: e.user, kind: e.kind, text: e.text, at: e.at });
  const ownerOf = new Map(owners.map((o) => [o.username, o.name]));
  const leadMap: Record<string, string[]> = {};
  for (const l of leads) (leadMap[l.product_key] ??= []).push(l.user_id);
  const products: ProductBrief[] = PRODUCTS.map((p) => {
    const x = a.products.find((y) => y.key === p.key);
    return { key: p.key, name: p.name, tag: x?.diagnosis.tag ?? "No Sales", sales: x?.metrics.sales.now ?? 0, change: x?.diagnosis.change ?? 0, changePct: x?.diagnosis.changePct ?? null, fragile: x?.diagnosis.fragile ?? null };
  });
  return {
    tasks: tasks.map((t) => ({
      id: t.id, productKey: t.product_key, productName: productName(t.product_key), category: t.category, kind: t.kind, priority: t.priority as 1 | 2 | 3, title: t.title, summary: t.summary,
      steps: t.steps, stepsDone: t.steps_done, creators: t.creators.map((c) => ({ ...c, owner: ownerOf.get(c.name) ?? null })), evidence: t.evidence, impactRm: t.impact, status: t.status,
      dueOn: t.due_on, closedReason: t.closed_reason, createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at, assignees: who.get(t.id) ?? [], events: ev.get(t.id) ?? [],
    })),
    products, staff: users, leads: leadMap, today: todayKL(), generatedAt: (stamp[0]?.value as string | undefined) ?? null,
  };
}
