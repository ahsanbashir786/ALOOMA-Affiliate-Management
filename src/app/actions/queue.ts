"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { saveHandler, staffList } from "@/lib/affiliate/work";

/** Choose the one person who handles all affiliate work. Owners only. */
export async function setHandler(userId: string): Promise<{ ok?: true; error?: string }> {
  await requirePermission("users");
  if (userId) {
    const ok = (await staffList()).some((u) => u.id === userId);
    if (!ok) return { error: "Choose someone who can do the work (not a read-only login)." };
  }
  await saveHandler(userId || null);
  revalidatePath("/affiliate/actions");
  return { ok: true };
}
