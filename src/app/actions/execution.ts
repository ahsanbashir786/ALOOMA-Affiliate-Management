"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, requireUser, type SessionUser } from "@/lib/auth";
import { syncPlan } from "@/lib/execution/plan";

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
