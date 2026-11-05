"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, requireUser, type SessionUser } from "@/lib/auth";
import { listTaskCreators, syncPlan, type CreatorItem } from "@/lib/execution/plan";

type R = { ok?: true; error?: string };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
const Id = z.string().uuid();
const STATUS = z.enum(["not_started", "pending", "done", "skipped"]);

/** Managers and owners may change any task; other team members only the tasks assigned to them. */
async function mayEdit(user: SessionUser, taskId: string): Promise<boolean> {
  if (can(user, "manager")) return true;
  const [r] = await q(sql`select 1 as x from ep_task_assignees where task_id = ${taskId}::uuid and user_id = ${user.id}::uuid`);
  return !!r;
}
const log = (taskId: string, userId: string, kind: string, text: string | null) =>
  q(sql`insert into ep_events (task_id, user_id, kind, text) values (${taskId}::uuid, ${userId}::uuid, ${kind}, ${text})`);
const touch = (taskId: string) => q(sql`update ep_tasks set updated_at = now() where id = ${taskId}::uuid`);
const refresh = () => revalidatePath("/execution");

const LABEL = { not_started: "Not Started", pending: "Pending", done: "Done", skipped: "Not Needed" } as const;

export async function setTaskStatus(taskId: string, status: string, note?: string): Promise<R> {
  const user = await requireUser();
  const p = z.object({ id: Id, s: STATUS, n: z.string().trim().max(500).optional() }).safeParse({ id: taskId, s: status, n: note });
  if (!p.success) return { error: "That status is not valid." };
  if (!(await mayEdit(user, p.data.id))) return { error: "Only the assigned person or a manager can change this task." };
  const [cur] = await q(sql`select status, fingerprint from ep_tasks where id = ${p.data.id}::uuid`);
  if (!cur) return { error: "This task no longer exists." };
  if (cur.status === "auto_closed") return { error: "The system closed this task because the numbers improved." };
  const open = p.data.s === "not_started" || p.data.s === "pending";
  if (open && (cur.status === "done" || cur.status === "skipped")) {
    const [dup] = await q(sql`select 1 as x from ep_tasks where fingerprint = ${cur.fingerprint as string} and status in ('not_started', 'pending') and id <> ${p.data.id}::uuid`);
    if (dup) return { error: "A newer task for the same problem is already open." };
  }
  await q(sql`update ep_tasks set status = ${p.data.s}, updated_at = now(),
    completed_at = ${p.data.s === "done" ? sql`now()` : sql`null`}, closed_reason = ${p.data.s === "skipped" ? (p.data.n ?? "Marked not needed.") : null} where id = ${p.data.id}::uuid`);
  await log(p.data.id, user.id, "status", `${LABEL[p.data.s]}${p.data.n ? `: ${p.data.n}` : ""}`);
  refresh();
  return { ok: true };
}

export async function setTaskDue(taskId: string, due: string | null): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ id: Id, d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).safeParse({ id: taskId, d: due });
  if (!p.success) return { error: "Choose a valid date." };
  await q(sql`update ep_tasks set due_on = ${p.data.d}::date, updated_at = now() where id = ${p.data.id}::uuid`);
  await log(p.data.id, user.id, "due", p.data.d ? `Due date set to ${p.data.d}` : "Due date cleared");
  refresh();
  return { ok: true };
}

/** Replaces who handles a task. Several people may share one task. */
export async function setTaskAssignees(taskId: string, userIds: string[]): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ id: Id, u: z.array(Id).max(12) }).safeParse({ id: taskId, u: userIds });
  if (!p.success) return { error: "Choose team members." };
  const ids = [...new Set(p.data.u)];
  if (ids.length) {
    const ok = await q(sql`select id::text from users where active and id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    if (ok.length !== ids.length) return { error: "One of those team members is not active." };
  }
  await q(sql`delete from ep_task_assignees where task_id = ${p.data.id}::uuid`);
  for (const u of ids) await q(sql`insert into ep_task_assignees (task_id, user_id, assigned_by) values (${p.data.id}::uuid, ${u}::uuid, ${user.id}::uuid)`);
  const names = ids.length ? (await q(sql`select name from users where id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) order by name`)).map((r) => r.name as string).join(", ") : "nobody";
  await touch(p.data.id);
  await log(p.data.id, user.id, "assigned", `Assigned to ${names}`);
  refresh();
  return { ok: true };
}

export async function toggleTaskStep(taskId: string, index: number): Promise<R> {
  const user = await requireUser();
  const p = z.object({ id: Id, i: z.number().int().min(0).max(30) }).safeParse({ id: taskId, i: index });
  if (!p.success) return { error: "That step does not exist." };
  if (!(await mayEdit(user, p.data.id))) return { error: "Only the assigned person or a manager can change this task." };
  const [t] = await q(sql`select steps_done as d, jsonb_array_length(steps) as n from ep_tasks where id = ${p.data.id}::uuid`);
  if (!t || p.data.i >= (t.n as number)) return { error: "That step does not exist." };
  const done = new Set(t.d as number[]);
  if (done.has(p.data.i)) done.delete(p.data.i); else done.add(p.data.i);
  await q(sql`update ep_tasks set steps_done = ${JSON.stringify([...done].sort((a, b) => a - b))}::jsonb, updated_at = now() where id = ${p.data.id}::uuid`);
  refresh();
  return { ok: true };
}

export async function addTaskComment(taskId: string, text: string): Promise<R> {
  const user = await requireUser();
  const p = z.object({ id: Id, t: z.string().trim().min(1).max(1000) }).safeParse({ id: taskId, t: text });
  if (!p.success) return { error: "Write a short note first." };
  if (!(await mayEdit(user, p.data.id))) return { error: "Only the assigned person or a manager can comment." };
  await log(p.data.id, user.id, "comment", p.data.t);
  await touch(p.data.id);
  refresh();
  return { ok: true };
}

/** Who handles a product. New tasks for the product go to these people; open tasks with nobody on them are given to them too. */
export async function setProductLeads(productKey: string, userIds: string[]): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ k: z.string().min(1).max(40), u: z.array(Id).max(12) }).safeParse({ k: productKey, u: userIds });
  if (!p.success) return { error: "Choose team members." };
  const ids = [...new Set(p.data.u)];
  await q(sql`delete from ep_product_leads where product_key = ${p.data.k}`);
  for (const u of ids) await q(sql`insert into ep_product_leads (product_key, user_id) values (${p.data.k}, ${u}::uuid)`);
  if (ids.length) {
    const open = await q(sql`select t.id::text as id from ep_tasks t where t.product_key = ${p.data.k} and t.status in ('not_started', 'pending')
      and not exists (select 1 from ep_task_assignees a where a.task_id = t.id)`);
    for (const t of open) {
      for (const u of ids) await q(sql`insert into ep_task_assignees (task_id, user_id, assigned_by) values (${t.id as string}::uuid, ${u}::uuid, ${user.id}::uuid) on conflict do nothing`);
      await log(t.id as string, user.id, "assigned", "Assigned to the product lead");
    }
  }
  refresh();
  return { ok: true };
}

/** Writes the plan again from the latest numbers. */
export async function refreshPlan(): Promise<R & { created?: number; closed?: number }> {
  await requireUser("manager");
  const r = await syncPlan(true);
  refresh();
  return { ok: true, created: r.created, closed: r.closed };
}

/** One page of the creators an action is about. Anyone signed in may look. */
export async function getTaskCreators(taskId: string, offset: number, q: string, filter: "all" | "todo" | "done"): Promise<{ items: CreatorItem[]; total: number; contacted: number } | { error: string }> {
  await requireUser();
  const p = z.object({ id: Id, o: z.number().int().min(0).max(5000), q: z.string().trim().max(60), f: z.enum(["all", "todo", "done"]) }).safeParse({ id: taskId, o: offset, q, f: filter });
  if (!p.success) return { error: "Something is wrong with that request." };
  return listTaskCreators(p.data.id, { offset: p.data.o, limit: 50, q: p.data.q, filter: p.data.f });
}

/** Ticks creators off as contacted (or back). The tick shows who did it and when. */
export async function setCreatorsContacted(taskId: string, usernames: string[], on: boolean): Promise<R & { contacted?: number }> {
  const user = await requireUser();
  const p = z.object({ id: Id, u: z.array(z.string().min(1).max(80)).min(1).max(500) }).safeParse({ id: taskId, u: usernames });
  if (!p.success) return { error: "Choose creators first." };
  if (!(await mayEdit(user, p.data.id))) return { error: "Only the assigned person or a manager can tick creators." };
  const list = sql.join(p.data.u.map((n) => sql`${n}`), sql`, `);
  await q(on
    ? sql`update ep_task_creators set contacted_at = now(), contacted_by = ${user.id}::uuid where task_id = ${p.data.id}::uuid and username in (${list}) and contacted_at is null`
    : sql`update ep_task_creators set contacted_at = null, contacted_by = null where task_id = ${p.data.id}::uuid and username in (${list})`);
  const [c] = await q(sql`select count(contacted_at)::int as c, count(*)::int as n from ep_task_creators where task_id = ${p.data.id}::uuid`);
  await q(sql`update ep_tasks set updated_at = now() where id = ${p.data.id}::uuid`);
  if (p.data.u.length > 1 || (c.c as number) === (c.n as number)) await log(p.data.id, user.id, "contacted", on ? `Contacted ${p.data.u.length > 1 ? `${p.data.u.length} creators` : "the last creator"} (${c.c} of ${c.n})` : `Unticked ${p.data.u.length} creator${p.data.u.length === 1 ? "" : "s"}`);
  refresh();
  return { ok: true, contacted: c.c as number };
}

/** Every creator of an action as a CSV (for sharing with the team or a WhatsApp broadcast tool). */
export async function exportTaskCreators(taskId: string): Promise<{ csv: string; name: string } | { error: string }> {
  await requireUser();
  const p = Id.safeParse(taskId);
  if (!p.success) return { error: "Something is wrong with that request." };
  const [t] = await q(sql`select title, product_key from ep_tasks where id = ${p.data}::uuid`);
  if (!t) return { error: "This task no longer exists." };
  const r = await q(sql`select tc.username, tc.note, tc.value::float8 as value, cr.phone, ow.name as owner, tc.contacted_at is not null as contacted
    from ep_task_creators tc left join creators cr on cr.username = tc.username left join creator_owners co on co.username = tc.username left join users ow on ow.id = co.user_id
    where tc.task_id = ${p.data}::uuid order by tc.rank`);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = ["Creator,Note,Value (RM),WhatsApp,Owner,Contacted", ...r.map((x) => [x.username, x.note, Math.round(x.value as number), x.phone, x.owner, x.contacted ? "Yes" : "No"].map(esc).join(","))].join("\n");
  return { csv, name: `${(t.product_key as string)}-${(t.title as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv` };
}

/** Several tasks at once (managers and owners): add people, set a status, set a due date. */
export async function bulkUpdateTasks(ids: string[], patch: { status?: string; addAssignees?: string[]; due?: string | null }): Promise<R & { count?: number }> {
  const user = await requireUser("manager");
  const p = z.object({
    ids: z.array(Id).min(1).max(200),
    patch: z.object({ status: STATUS.optional(), addAssignees: z.array(Id).max(12).optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
  }).safeParse({ ids, patch });
  if (!p.success) return { error: "Choose tasks and a change." };
  const list = sql.join(p.data.ids.map((i) => sql`${i}::uuid`), sql`, `);
  const rows = await q(sql`select id::text, status from ep_tasks where id in (${list}) and status <> 'auto_closed'`);
  const targets = rows.map((r) => r.id as string);
  if (!targets.length) return { error: "Those tasks cannot be changed." };
  const tl = sql.join(targets.map((i) => sql`${i}::uuid`), sql`, `);
  if (p.data.patch.status) {
    const s = p.data.patch.status;
    await q(sql`update ep_tasks set status = ${s}, updated_at = now(), completed_at = ${s === "done" ? sql`now()` : sql`null`} where id in (${tl}) and status <> ${s}`);
    for (const t of targets) await log(t, user.id, "status", `${LABEL[s as keyof typeof LABEL]} (changed for several tasks)`);
  }
  if (p.data.patch.addAssignees?.length) {
    const ok = await q(sql`select id::text from users where active and id in (${sql.join(p.data.patch.addAssignees.map((i) => sql`${i}::uuid`), sql`, `)})`);
    for (const t of targets) for (const u of ok) await q(sql`insert into ep_task_assignees (task_id, user_id, assigned_by) values (${t}::uuid, ${u.id as string}::uuid, ${user.id}::uuid) on conflict do nothing`);
    const names = (await q(sql`select name from users where id in (${sql.join(ok.map((u) => sql`${u.id as string}::uuid`), sql`, `)}) order by name`)).map((r) => r.name as string).join(", ");
    for (const t of targets) { await q(sql`update ep_tasks set updated_at = now() where id = ${t}::uuid`); await log(t, user.id, "assigned", `Added ${names}`); }
  }
  if (p.data.patch.due !== undefined) {
    await q(sql`update ep_tasks set due_on = ${p.data.patch.due}::date, updated_at = now() where id in (${tl})`);
    for (const t of targets) await log(t, user.id, "due", p.data.patch.due ? `Due date set to ${p.data.patch.due}` : "Due date cleared");
  }
  refresh();
  return { ok: true, count: targets.length };
}
