"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { actions, creators } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/lib/period";
import { allRecommendations, analyse, generateActions } from "@/lib/analytics/recommendations";

const STATUS = z.enum(["open", "in_progress", "sent", "done", "dismissed"]);

export async function regenerateActions(): Promise<{ created: number; total: number }> {
  await requireUser("manager");
  const res = await generateActions();
  revalidatePath("/actions");
  revalidatePath("/", "layout");
  return res;
}

export async function setActionStatus(id: number, status: z.infer<typeof STATUS>) {
  const user = await requireUser("manager");
  const s = STATUS.parse(status);
  await db
    .update(actions)
    .set({
      status: s,
      updatedAt: new Date(),
      completedAt: s === "done" || s === "sent" ? new Date() : null,
      assigneeId: sql`coalesce(${actions.assigneeId}, ${user.id})`,
    })
    .where(eq(actions.id, id));
  revalidatePath("/actions");
  revalidatePath("/", "layout");
}

export async function saveActionNote(id: number, note: string) {
  await requireUser("manager");
  await db.update(actions).set({ note: note.slice(0, 2000) || null, updatedAt: new Date() }).where(eq(actions.id, id));
  revalidatePath("/actions");
}

export async function assignAction(id: number, userId: string | null) {
  await requireUser("manager");
  await db.update(actions).set({ assigneeId: userId, updatedAt: new Date() }).where(eq(actions.id, id));
  revalidatePath("/actions");
}

/** Queue the recommendation for one creator (from their profile). */
export async function queueCreatorAction(username: string): Promise<{ ok: boolean; message: string }> {
  await requireUser("manager");
  const period = await resolvePeriod({ range: "28d" });
  const recs = allRecommendations(await analyse(period)).filter((r) => r.username === username);
  if (!recs.length) return { ok: false, message: "No recommendation for this creator right now." };
  for (const r of recs) {
    await db
      .insert(actions)
      .values({
        username: r.username,
        type: r.type,
        priority: r.priority,
        title: r.title,
        reason: r.reason,
        instruction: r.instruction,
        expectedUplift: r.expectedUplift,
        baselineGmv: r.baselineGmv,
        periodStart: period.start,
        periodEnd: period.end,
      })
      .onConflictDoNothing();
  }
  revalidatePath("/actions");
  revalidatePath("/", "layout");
  return { ok: true, message: "Added to the action centre." };
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
