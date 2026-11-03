"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { creators } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { generateActions } from "@/lib/analytics/recommendations";
import { refreshSamples } from "@/lib/samples/service";

export async function regenerateActions(): Promise<{ created: number; total: number }> {
  await requireUser("manager");
  // Match new sample orders to creators and re-check posting before building the queue.
  await refreshSamples();
  const res = await generateActions();
  revalidatePath("/today");
  revalidatePath("/samples", "layout");
  revalidatePath("/", "layout");
  return res;
}

export async function saveCreatorNotes(username: string, notes: string, doNotContact: boolean) {
  await requireUser("manager");
  await db
    .insert(creators)
    .values({ username, notes: notes.slice(0, 4000) || null, doNotContact })
    .onConflictDoUpdate({
      target: creators.username,
      set: { notes: notes.slice(0, 4000) || null, doNotContact, updatedAt: new Date() },
    });
  revalidatePath(`/creators/${encodeURIComponent(username)}`);
}

export async function deleteUpload(id: number) {
  await requireUser("manager");
  const { deleteUploadCascade } = await import("@/lib/ingest/service");
  await deleteUploadCascade(id);
  revalidatePath("/data");
  revalidatePath("/", "layout");
}
