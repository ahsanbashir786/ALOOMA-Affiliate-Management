"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { resolveConflicts } from "@/lib/ingest/conflicts";

/** Manager+ only. See lib/ingest/conflicts.ts. */
export async function resolveImportConflicts(ids: number[], action: "accept" | "dismiss"): Promise<{ ok?: true; error?: string; count?: number }> {
  const user = await requireUser("manager");
  if (!ids.length) return { error: "Nothing selected." };
  const count = await resolveConflicts(ids, action, user.id);
  revalidatePath("/data");
  revalidatePath("/", "layout");
  return { ok: true, count };
}
