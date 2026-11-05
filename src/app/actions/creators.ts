"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseCreatorParams } from "@/lib/creators/params";
import { getAffiliateDirectory } from "@/lib/workflow/directory";

type R = { ok?: true; error?: string };
export type OwnerBefore = { u: string; id: string | null };
type Bulk = R & { count?: number; previous?: OwnerBefore[] };

const MAX_BULK = 20000;
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
const chunks = <T,>(a: T[], n = 1000) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const Name = z.string().trim().min(1).max(80);
const Id = z.string().uuid().nullable();

async function activeStaff(id: string | null): Promise<string | null> {
  if (id === null) return null;
  const [ok] = await q(sql`select 1 as x from users where id = ${id} and active`);
  return ok ? null : "That team member is not active.";
}

/** Sets (or clears, with null) the owner of many creators at once and returns what each one had before, so it can be undone. */
async function applyOwners(names: string[], userId: string | null, by: string): Promise<OwnerBefore[]> {
  const previous: OwnerBefore[] = [];
  for (const part of chunks(names)) {
    const list = sql.join(part.map((u) => sql`${u}`), sql`, `);
    const had = new Map((await q(sql`select username, user_id::text as id from creator_owners where username in (${list})`)).map((r) => [r.username as string, r.id as string | null]));
    for (const u of part) previous.push({ u, id: had.get(u) ?? null });
    if (userId === null) await q(sql`delete from creator_owners where username in (${list})`);
    else {
      const vals = sql.join(part.map((u) => sql`(${u}, ${userId}::uuid, ${by}::uuid)`), sql`, `);
      await q(sql`insert into creator_owners (username, user_id, assigned_by) values ${vals}
        on conflict (username) do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by, assigned_at = now()`);
    }
  }
  revalidatePath("/creators", "layout");
  return previous;
}

/** Who looks after this creator. Managers and owners only; the latest assignment wins; null clears it. */
export async function assignOwner(username: string, userId: string | null): Promise<R> {
  const user = await requireUser("manager");
  const p = z.object({ u: Name, id: Id }).safeParse({ u: username, id: userId });
  if (!p.success) return { error: "Choose a team member." };
  const bad = await activeStaff(p.data.id);
  if (bad) return { error: bad };
  await applyOwners([p.data.u], p.data.id, user.id);
  return { ok: true };
}

/** The selected creators go to one team member. The caller must confirm exactly how many. */
export async function assignOwners(usernames: string[], userId: string | null, confirmCount: number): Promise<Bulk> {
  const user = await requireUser("manager");
  const p = z.object({ names: z.array(Name).min(1).max(MAX_BULK), id: Id }).safeParse({ names: usernames, id: userId });
  if (!p.success) return { error: "Choose creators and a team member." };
  const names = [...new Set(p.data.names)];
  if (confirmCount !== names.length) return { error: `Please confirm the ${names.length} selected creators first.` };
  const bad = await activeStaff(p.data.id);
  if (bad) return { error: bad };
  const previous = await applyOwners(names, p.data.id, user.id);
  return { ok: true, count: names.length, previous };
}

/** Every creator the current filters match (not just the visible page) goes to one team member. */
export async function assignOwnersByFilter(params: Record<string, string>, userId: string | null, confirmCount: number): Promise<Bulk> {
  const user = await requireUser("manager");
  const id = Id.safeParse(userId);
  if (!id.success) return { error: "Choose a team member." };
  const bad = await activeStaff(id.data);
  if (bad) return { error: bad };
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const dir = await getAffiliateDirectory({ ...parseCreatorParams(clean), page: 1, size: 1_000_000 });
  const names = dir.rows.map((r) => r.username);
  if (names.length > MAX_BULK) return { error: `That is more than ${MAX_BULK.toLocaleString("en-MY")} creators. Narrow the filters first.` };
  if (names.length !== confirmCount) return { error: "The list changed since you selected it. Reload and try again." };
  const previous = await applyOwners(names, id.data, user.id);
  return { ok: true, count: names.length, previous };
}

/** Puts the owners back as they were (the answer of an assign call). */
export async function restoreOwners(previous: OwnerBefore[]): Promise<R> {
  const user = await requireUser("manager");
  const p = z.array(z.object({ u: Name, id: Id })).max(MAX_BULK).safeParse(previous);
  if (!p.success) return { error: "Nothing to undo." };
  const none = p.data.filter((x) => x.id === null).map((x) => x.u);
  if (none.length) await applyOwners(none, null, user.id);
  const by = new Map<string, string[]>();
  for (const x of p.data) if (x.id) (by.get(x.id) ?? by.set(x.id, []).get(x.id)!).push(x.u);
  for (const [id, names] of by) await applyOwners(names, id, user.id);
  return { ok: true };
}
