import "server-only";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { rows } from "@/lib/sql";
import { kd } from "@/lib/creators/sql";
import { productName } from "@/lib/products/catalog";
import { addDaysISO, daysBetweenISO, todayKL } from "@/lib/time";
import { loadQueue } from "./command";
import { loadContent, type VideoRow } from "./content-load";
import type { Item } from "./actions";

const OWNER_KEY = "affiliate_default_owner";
export type Handler = { id: string; name: string } | null;

/** The one person who handles all affiliate work for now. Anything without its own owner is hers. */
export async function getHandler(): Promise<Handler> {
  const [s] = await db.select().from(settings).where(eq(settings.key, OWNER_KEY));
  const id = (s?.value as { id?: string } | undefined)?.id;
  if (!id) return null;
  const [u] = await rows<{ id: string; name: string }>(sql`select u.id::text, u.name from users u join roles r on r.id = u.role_id where u.id = ${id}::uuid and u.active and not r.read_only`);
  return u ?? null;
}
export async function saveHandler(id: string | null) {
  const value = { id };
  await db.insert(settings).values({ key: OWNER_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
export const staffList = () => rows<{ id: string; name: string }>(sql`select u.id::text, u.name from users u join roles r on r.id = u.role_id where u.active and not r.read_only order by u.name`);

export type TaskItem = { id: string; productKey: string; productName: string; title: string; priority: number; impact: number; dueOn: string | null; overdueDays: number; creators: number; contacted: number; status: string };
export type WorkItem =
  | { kind: "creator"; key: string; value: number; item: Item }
  | { kind: "task"; key: string; value: number; task: TaskItem }
  | { kind: "video"; key: string; value: number; video: VideoRow; why: string };

export type Efficiency = { doneToday: number; last7: number; avg14: number; left: number; daysToClear: number | null; byDay: { day: string; n: number }[] };

/** What was done, by day: creators contacted plus product actions marked done. Both are counted, nothing is double counted. */
async function efficiency(handler: Handler, left: number): Promise<Efficiency> {
  const today = todayKL(), from = addDaysISO(today, -13);
  const uid = handler?.id ?? null;
  const r = await rows<{ day: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, sum(n)::int as n from (
      select ${kd("at")} as d, count(*) as n from staff_events where kind = 'contacted' and reverted_at is null and not synthetic and ${kd("at")} >= ${from}::date and (${uid}::uuid is null or user_id = ${uid}::uuid) group by 1
      union all
      select ${kd("tc.contacted_at")} as d, count(*) as n from ep_task_creators tc where tc.contacted_at is not null and ${kd("tc.contacted_at")} >= ${from}::date and (${uid}::uuid is null or tc.contacted_by = ${uid}::uuid)
        and not exists (select 1 from staff_events se where se.kind = 'contacted' and se.reverted_at is null and not se.synthetic and se.username = tc.username and ${kd("se.at")} = ${kd("tc.contacted_at")} and se.user_id is not distinct from tc.contacted_by) group by 1
      union all
      select ${kd("created_at")} as d, count(*) as n from ep_events where kind = 'status' and text like 'Done%' and ${kd("created_at")} >= ${from}::date and (${uid}::uuid is null or user_id = ${uid}::uuid) group by 1
    ) x group by 1`);
  const by = new Map(r.map((x) => [x.day, x.n]));
  const byDay = Array.from({ length: 14 }, (_, i) => { const day = addDaysISO(from, i); return { day, n: by.get(day) ?? 0 }; });
  const total = byDay.reduce((n, x) => n + x.n, 0);
  const avg14 = total / 14;
  return { doneToday: by.get(today) ?? 0, last7: byDay.slice(7).reduce((n, x) => n + x.n, 0), avg14, left, daysToClear: avg14 > 0 ? Math.ceil(left / avg14) : null, byDay };
}

/** The one queue: creator next steps, product actions and fading videos, biggest sales first. */
export async function loadWork() {
  const [q, content, handler, tasks] = await Promise.all([
    loadQueue(), loadContent(), getHandler(),
    rows<{ id: string; product_key: string; title: string; priority: number; impact: number; due_on: string | null; status: string; n: number; c: number }>(sql`
      select t.id::text, t.product_key, t.title, t.priority::int, t.impact_rm::float8 as impact, to_char(t.due_on, 'YYYY-MM-DD') as due_on, t.status,
        coalesce((select count(*) from ep_task_creators x where x.task_id = t.id), 0)::int as n, coalesce((select count(contacted_at) from ep_task_creators x where x.task_id = t.id), 0)::int as c
      from ep_tasks t where t.status in ('not_started', 'pending')`),
  ]);
  if (!q) return null;
  const today = todayKL();
  const items: WorkItem[] = [];
  for (const i of q.queue.todo) items.push({ kind: "creator", key: `c:${i.username}`, value: i.expected, item: i });
  for (const t of tasks) {
    const overdueDays = t.due_on && t.due_on < today ? daysBetweenISO(t.due_on, today) : 0;
    items.push({ kind: "task", key: `t:${t.id}`, value: t.impact, task: { id: t.id, productKey: t.product_key, productName: productName(t.product_key), title: t.title, priority: t.priority, impact: t.impact, dueOn: t.due_on, overdueDays, creators: t.n, contacted: t.c, status: t.status } });
  }
  if (content) {
    for (const v of [...content.lists.fading, ...content.lists.stopped]) {
      const fading = v.cls === "fading";
      const lost = fading ? Math.max(0, v.p14 - v.s14) : v.ageDays ? Math.min(v.total, v.total / (v.ageDays / 14)) : 0;
      items.push({ kind: "video", key: `v:${v.id}`, value: lost, video: v, why: fading ? `Sales fell from ${Math.round(v.p14)} to ${Math.round(v.s14)} in 14 days` : "Stopped selling in the last 28 days" });
    }
  }
  items.sort((a, b) => Number(b.kind === "task" && b.task.overdueDays > 0) - Number(a.kind === "task" && a.task.overdueDays > 0) || b.value - a.value);
  const eff = await efficiency(handler, items.length);
  return { items, handler, eff, ref: q.ref, guard: q.guard, queue: q.queue };
}
