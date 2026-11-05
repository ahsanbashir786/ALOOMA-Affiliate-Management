import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rows } from "@/lib/analytics/sql";
import { analyseProducts } from "@/lib/products/analysis";
import { PRODUCTS, productName } from "@/lib/products/catalog";
import { addDaysISO, todayKL } from "@/lib/time";
import { buildDrafts, type CreatorLine, type Draft } from "./rules";
import { loadHistory } from "./history";

export type Status = "not_started" | "pending" | "done" | "skipped" | "auto_closed";
export const OPEN: Status[] = ["not_started", "pending"];

export type TaskView = {
  id: string; productKey: string; productName: string; category: string; kind: string; priority: 1 | 2 | 3;
  title: string; summary: string; steps: string[]; stepsDone: number[];
  /** The first few creators, for the list. The full list is loaded when the task is opened. */
  creators: { name: string; note: string }[];
  creatorCount: number; contactedCount: number;
  evidence: Record<string, number | string>; impactRm: number; status: Status; dueOn: string | null; closedReason: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null; assignees: string[];
  events: { id: number; user: string | null; kind: string; text: string | null; at: string }[];
};
export type ProductBrief = { key: string; name: string; tag: string; sales: number; change: number; changePct: number | null; fragile: boolean | null };
export type Staff = { id: string; name: string; role: string };
export type PlanData = { tasks: TaskView[]; products: ProductBrief[]; staff: Staff[]; today: string; generatedAt: string | null };

const preview = (list: CreatorLine[]) => list.slice(0, 5).map((c) => ({ name: c.name, note: c.note }));

/** Writes every creator of an action. People already contacted keep their tick; people who no longer belong are removed. */
async function saveCreators(q: (s: ReturnType<typeof sql>) => Promise<Record<string, unknown>[]>, taskId: string, list: CreatorLine[]) {
  for (let i = 0; i < list.length; i += 300) {
    const part = list.slice(i, i + 300);
    const vals = sql.join(part.map((c, j) => sql`(${taskId}::uuid, ${c.name}, ${i + j}, ${c.note}, ${c.value}, ${JSON.stringify(c.data)}::jsonb)`), sql`, `);
    await q(sql`insert into ep_task_creators (task_id, username, rank, note, value, data) values ${vals}
      on conflict (task_id, username) do update set rank = excluded.rank, note = excluded.note, value = excluded.value, data = excluded.data`);
  }
  if (list.length) {
    const keep = sql.join(list.map((c) => sql`${c.name}`), sql`, `);
    await q(sql`delete from ep_task_creators where task_id = ${taskId}::uuid and contacted_at is null and username not in (${keep})`);
  } else await q(sql`delete from ep_task_creators where task_id = ${taskId}::uuid and contacted_at is null`);
}

const COOLDOWN_DONE = 14;
const COOLDOWN_SKIPPED = 30;

/** Writes the plan from today's product analysis: new problems become tasks, known ones are refreshed, solved ones close themselves. */
export async function syncPlan(force = false): Promise<{ created: number; updated: number; closed: number; skipped: boolean }> {
  const a = await analyseProducts();
  const history = await loadHistory(a);
  const today = todayKL();
  const drafts: Draft[] = a.products.filter((p) => p.key !== "unmapped").flatMap((p) => buildDrafts(p, { history, today, periodStart: a.period.start, prevStart: a.period.prevStart }));
  const stamp = createHash("sha1").update(JSON.stringify(drafts.map((d) => [d.fingerprint, d.title, d.summary, d.priority, d.creators.length, d.creators.slice(0, 40).map((c) => c.name), Math.round(d.impactRm)])) + today + "v2").digest("hex");
  const [last] = await rows<{ value: unknown }>(sql`select value from settings where key = 'ep_stamp'`);
  if (!force && last && last.value === stamp) return { created: 0, updated: 0, closed: 0, skipped: true };

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
    const owners = new Map((await q(sql`select username, user_id::text as uid from creator_owners where user_id is not null`)).map((r) => [r.username as string, r.uid as string]));

    for (const d of drafts) {
      const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
      const id = openBy.get(d.fingerprint);
      if (id) {
        await q(sql`update ep_tasks set title = ${d.title}, summary = ${d.summary}, steps = ${json(d.steps)}, creators = ${json(preview(d.creators))}, evidence = ${json(d.evidence)},
          impact_rm = ${d.impactRm}, priority = ${d.priority}, updated_at = now() where id = ${id}::uuid`);
        await saveCreators(q, id, d.creators);
        updated++;
        continue;
      }
      if (cool.has(d.fingerprint)) continue;
      const [row] = await q(sql`insert into ep_tasks (fingerprint, product_key, category, kind, priority, title, summary, steps, creators, evidence, impact_rm, due_on)
        values (${d.fingerprint}, ${d.productKey}, ${d.category}, ${d.kind}, ${d.priority}, ${d.title}, ${d.summary}, ${json(d.steps)}, ${json(preview(d.creators))}, ${json(d.evidence)}, ${d.impactRm},
          ${addDaysISO(today, d.dueDays)}::date)
        on conflict do nothing returning id::text`);
      if (!row) continue;
      created++;
      const tid = row.id as string;
      await saveCreators(q, tid, d.creators);
      // Who handles it: the person who owns most of the creators named in it (a manager can change it).
      let who: string[] = [];
      if (!who.length && d.creators.length) {
        const count = new Map<string, number>();
        for (const c of d.creators.slice(0, 200)) { const o = owners.get(c.name); if (o) count.set(o, (count.get(o) ?? 0) + 1); }
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
  const [tasks, assignees, events, users, counts, a, stamp] = await Promise.all([
    rows<{ id: string; product_key: string; category: string; kind: string; priority: number; title: string; summary: string; steps: string[]; steps_done: number[]; creators: { name: string; note: string }[]; evidence: Record<string, number | string>; impact: number; status: Status; due_on: string | null; closed_reason: string | null; created_at: string; updated_at: string; completed_at: string | null }>(sql`
      select id::text, product_key, category, kind, priority::int, title, summary, steps, steps_done, creators, evidence, impact_rm::float8 as impact, status,
        to_char(due_on, 'YYYY-MM-DD') as due_on, closed_reason, created_at::text, updated_at::text, completed_at::text
      from ep_tasks where status in ('not_started', 'pending') or updated_at > now() - interval '60 days' order by created_at desc`),
    rows<{ task_id: string; user_id: string }>(sql`select task_id::text, user_id::text from ep_task_assignees`),
    rows<{ id: number; task_id: string; user: string | null; kind: string; text: string | null; at: string }>(sql`
      select e.id::int, e.task_id::text, u.name as user, e.kind, e.text, e.created_at::text as at from ep_events e left join users u on u.id = e.user_id order by e.created_at, e.id`),
    rows<Staff>(sql`select id::text, name, role::text from users where active order by name`),
    rows<{ task_id: string; n: number; c: number }>(sql`select task_id::text, count(*)::int as n, count(contacted_at)::int as c from ep_task_creators group by 1`),
    analyseProducts(),
    rows<{ value: unknown }>(sql`select updated_at::text as value from ep_tasks order by updated_at desc limit 1`),
  ]);
  const who = new Map<string, string[]>();
  for (const r of assignees) (who.get(r.task_id) ?? who.set(r.task_id, []).get(r.task_id)!).push(r.user_id);
  const ev = new Map<string, TaskView["events"]>();
  for (const e of events) (ev.get(e.task_id) ?? ev.set(e.task_id, []).get(e.task_id)!).push({ id: e.id, user: e.user, kind: e.kind, text: e.text, at: e.at });
  const countOf = new Map(counts.map((c) => [c.task_id, c]));
  const products: ProductBrief[] = PRODUCTS.map((p) => {
    const x = a.products.find((y) => y.key === p.key);
    return { key: p.key, name: p.name, tag: x?.diagnosis.tag ?? "No Sales", sales: x?.metrics.sales.now ?? 0, change: x?.diagnosis.change ?? 0, changePct: x?.diagnosis.changePct ?? null, fragile: x?.diagnosis.fragile ?? null };
  });
  return {
    tasks: tasks.map((t) => ({
      id: t.id, productKey: t.product_key, productName: productName(t.product_key), category: t.category, kind: t.kind, priority: t.priority as 1 | 2 | 3, title: t.title, summary: t.summary,
      steps: t.steps, stepsDone: t.steps_done, creators: t.creators, creatorCount: countOf.get(t.id)?.n ?? t.creators.length, contactedCount: countOf.get(t.id)?.c ?? 0, evidence: t.evidence, impactRm: t.impact, status: t.status,
      dueOn: t.due_on, closedReason: t.closed_reason, createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at, assignees: who.get(t.id) ?? [], events: ev.get(t.id) ?? [],
    })),
    products, staff: users, today: todayKL(), generatedAt: (stamp[0]?.value as string | undefined) ?? null,
  };
}

export type CreatorItem = { name: string; note: string; value: number; data: import("./rules").LineData; contactedAt: string | null; contactedBy: string | null; owner: string | null; phone: string | null };
/** One page of the creators an action is about (searchable), loaded when the task is opened. */
export async function listTaskCreators(taskId: string, o: { offset: number; limit: number; q: string; filter: "all" | "todo" | "done" }): Promise<{ items: CreatorItem[]; total: number; contacted: number }> {
  const like = `%${o.q.replace(/[%_\\]/g, "").toLowerCase()}%`;
  const f = o.filter === "todo" ? sql`and tc.contacted_at is null` : o.filter === "done" ? sql`and tc.contacted_at is not null` : sql``;
  const where = sql`tc.task_id = ${taskId}::uuid and (${o.q === "" ? sql`true` : sql`lower(tc.username) like ${like}`}) ${f}`;
  const [items, [t], [c]] = await Promise.all([
    rows<{ username: string; note: string; value: number; data: import("./rules").LineData; contacted_at: string | null; contacted_by: string | null; owner: string | null; phone: string | null }>(sql`
      select tc.username, tc.note, tc.value::float8 as value, tc.data, tc.contacted_at::text, cu.name as contacted_by, ow.name as owner, cr.phone
      from ep_task_creators tc left join users cu on cu.id = tc.contacted_by left join creators cr on cr.username = tc.username
        left join creator_owners co on co.username = tc.username left join users ow on ow.id = co.user_id
      where ${where} order by tc.rank limit ${o.limit} offset ${o.offset}`),
    rows<{ n: number }>(sql`select count(*)::int as n from ep_task_creators tc where ${where}`),
    rows<{ c: number }>(sql`select count(contacted_at)::int as c from ep_task_creators where task_id = ${taskId}::uuid`),
  ]);
  return { items: items.map((r) => ({ name: r.username, note: r.note, value: r.value, data: r.data, contactedAt: r.contacted_at, contactedBy: r.contacted_by, owner: r.owner, phone: r.phone })), total: t.n, contacted: c.c };
}

export type CreatorAsk = { task: string; product: string; productName: string; kind: string; title: string; priority: 1 | 2 | 3; note: string; data: import("./rules").LineData; done: boolean };
export type CreatorCard = { name: string; best: 1 | 2 | 3; asks: CreatorAsk[]; contacted: number; products: number; owner: string | null; phone: string | null };

/** One page of creators with every open ask about them, across all products: contact each person once. */
export async function listCreatorAsks(o: { offset: number; limit: number; q: string; mine: string | null; show: "todo" | "all"; priority: number | null; multi: boolean }): Promise<{ items: CreatorCard[]; total: number }> {
  const like = `%${o.q.replace(/[%_\\]/g, "").toLowerCase()}%`;
  const scope = o.mine ? sql`and exists (select 1 from ep_task_assignees x where x.task_id = t.id and x.user_id = ${o.mine}::uuid)` : sql``;
  const filt = sql`where true ${o.q ? sql`and lower(g.username) like ${like}` : sql``} ${o.show === "todo" ? sql`and g.c < g.n` : sql``} ${o.priority ? sql`and g.best = ${o.priority}` : sql``} ${o.multi ? sql`and g.n > 1` : sql``}`;
  const base = sql`
    with a as (
      select tc.username, t.id::text as task_id, t.product_key, t.kind, t.title, t.priority::int as priority, tc.note, tc.value::float8 as value, tc.data, tc.contacted_at
      from ep_task_creators tc join ep_tasks t on t.id = tc.task_id where t.status in ('not_started', 'pending') and t.kind not in ('fix_conversion', 'recruit', 'low_views') ${scope}
    ), g as (
      select username, min(priority)::int as best, count(*)::int as n, count(contacted_at)::int as c, sum(value) as val, count(distinct product_key)::int as products,
        json_agg(json_build_object('task', task_id, 'product', product_key, 'kind', kind, 'title', title, 'priority', priority, 'note', note, 'data', data, 'done', contacted_at is not null) order by priority, value desc) as asks
      from a group by username
    )`;
  const [items, [t]] = await Promise.all([
    rows<{ username: string; best: number; n: number; c: number; products: number; asks: Omit<CreatorAsk, "productName">[]; phone: string | null; owner: string | null }>(sql`
      ${base} select g.username, g.best, g.n, g.c, g.products, g.asks, cr.phone, ow.name as owner
      from g left join creators cr on cr.username = g.username left join creator_owners co on co.username = g.username left join users ow on ow.id = co.user_id
      ${filt} order by g.best, g.val desc, g.username limit ${o.limit} offset ${o.offset}`),
    rows<{ n: number }>(sql`${base} select count(*)::int as n from g ${filt}`),
  ]);
  return {
    items: items.map((r) => ({ name: r.username, best: r.best as 1 | 2 | 3, contacted: r.c, products: r.products, owner: r.owner, phone: r.phone, asks: r.asks.map((a) => ({ ...a, productName: productName(a.product) })) })),
    total: t.n,
  };
}
