"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";

/** Who looks after this creator. Managers and owners only; the latest assignment wins; null clears it. */
export async function assignOwner(username: string, userId: string | null): Promise<{ ok?: true; error?: string }> {
  const user = await requireUser("manager");
  const p = z.object({ u: z.string().trim().min(1).max(80), id: z.string().uuid().nullable() }).safeParse({ u: username, id: userId });
  if (!p.success) return { error: "Choose a team member." };
  if (p.data.id === null) await db.execute(sql`delete from creator_owners where username = ${p.data.u}`);
  else {
    const [ok] = (await db.execute(sql`select 1 as x from users where id = ${p.data.id} and active`)) as unknown as { x: number }[];
    if (!ok) return { error: "That team member is not active." };
    await db.execute(sql`insert into creator_owners (username, user_id, assigned_by) values (${p.data.u}, ${p.data.id}, ${user.id})
      on conflict (username) do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by, assigned_at = now()`);
  }
  revalidatePath("/creators", "layout");
  return { ok: true };
}
