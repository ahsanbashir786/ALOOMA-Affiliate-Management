"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import { contentDecisions, staffEvents } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { refreshSamples } from "@/lib/samples/service";
import { todayKL } from "@/lib/time";
import { createCommitment } from "@/lib/workflow/commitments";
import { addEvent, revertBatch, revertEvent } from "@/lib/workflow/events";

type R = { ok?: true; error?: string; eventId?: number; batchId?: string; count?: number };

const done = () => {
  revalidatePath("/today");
  revalidatePath("/progress");
  revalidatePath("/samples", "layout");
  revalidatePath("/affiliates", "layout");
};

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const Name = z.string().trim().min(1).max(80);

/**
 * Staff confirm they contacted the creator. Opening WhatsApp, copying a message or opening TikTok never does this –
 * only this action. It records who and when, and schedules the follow-up (replayed from the log).
 */
export async function markContacted(usernames: string[], confirmCount?: number): Promise<R> {
  const user = await requireUser("manager");
  const names = [...new Set(z.array(Name).min(1).max(200).parse(usernames))];
  // Bulk safety: the caller must confirm exactly how many records it is about to change.
  if (names.length > 1 && confirmCount !== names.length) return { error: `Please confirm the ${names.length} selected creators first.` };
  const batchId = names.length > 1 ? randomUUID() : null;
  let last = 0;
  for (const u of names) last = await addEvent({ username: u, kind: "contacted", userId: user.id, batchId });
  done();
  return { ok: true, eventId: last, batchId: batchId ?? undefined, count: names.length };
}

/** The creator promised to post by a date. Only a date is needed; details are optional. */
export async function markPromised(username: string, promisedOn: string, details?: string): Promise<R> {
  const user = await requireUser("manager");
  const u = Name.parse(username);
  const p = Day.safeParse(promisedOn);
  if (!p.success) return { error: p.error.issues[0].message };
  const eventId = await addEvent({ username: u, kind: "promised", userId: user.id, details: { promisedOn: p.data, details: details?.trim() || null } });
  const sampleIds = await createCommitment({ username: u, eventId, promisedOn: p.data, details });
  // The agreed date replaces the default posting deadline for these samples.
  if (sampleIds.length) await refreshSamples({ sampleIds });
  done();
  return { ok: true, eventId };
}

export async function markNeedsHelp(username: string, reason: string, nextOn: string | null): Promise<R> {
  const user = await requireUser("manager");
  const u = Name.parse(username);
  const r = z.string().trim().min(2).max(200).safeParse(reason);
  if (!r.success) return { error: "Choose a reason." };
  if (nextOn && !Day.safeParse(nextOn).success) return { error: "Choose a valid next-action date." };
  const eventId = await addEvent({ username: u, kind: "needs_help", userId: user.id, details: { reason: r.data, ...(nextOn ? { nextOn } : {}) } });
  done();
  return { ok: true, eventId };
}

export async function pauseCreator(username: string, reason: string, resumeOn?: string | null): Promise<R> {
  const user = await requireUser("manager");
  const u = Name.parse(username);
  const r = z.string().trim().min(2, "Give a short reason.").max(200).safeParse(reason);
  if (!r.success) return { error: r.error.issues[0].message };
  if (resumeOn && !Day.safeParse(resumeOn).success) return { error: "Choose a valid resume date." };
  if (resumeOn && resumeOn <= todayKL()) return { error: "The resume date must be after today." };
  const eventId = await addEvent({ username: u, kind: "paused", userId: user.id, details: { reason: r.data, ...(resumeOn ? { resumeOn } : {}) } });
  done();
  return { ok: true, eventId };
}

export async function resumeCreator(username: string): Promise<R> {
  const user = await requireUser("manager");
  const eventId = await addEvent({ username: Name.parse(username), kind: "resumed", userId: user.id });
  done();
  return { ok: true, eventId };
}

/** Undo one action, or a whole bulk batch. The history keeps who did it, when, and who undid it. */
export async function undoEvent(eventId: number): Promise<R> {
  const user = await requireUser("manager");
  const [ev] = await db.select({ kind: staffEvents.kind, username: staffEvents.username, batchId: staffEvents.batchId }).from(staffEvents).where(eq(staffEvents.id, eventId));
  if (!ev) return { error: "That action no longer exists." };
  if (ev.batchId) await revertBatch(ev.batchId, user.id);
  else await revertEvent(eventId, user.id);
  if (ev.kind === "promised") await refreshSamples(); // the agreed date no longer applies
  done();
  return { ok: true };
}

const Decision = z.object({
  sampleId: z.number().int().positive(),
  contentId: z.string().trim().min(1).max(200),
  decision: z.enum(["verified", "rejected"]),
  link: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Staff verify (with a link or id) or reject content the system was unsure about. Survives every import. */
export async function decideContent(input: z.input<typeof Decision>, username: string): Promise<R> {
  const user = await requireUser("manager");
  const d = Decision.safeParse(input);
  if (!d.success) return { error: d.error.issues[0].message };
  await db.insert(contentDecisions).values({
    username: Name.parse(username),
    sampleId: d.data.sampleId,
    contentId: d.data.contentId,
    link: d.data.link || null,
    decision: d.data.decision,
    userId: user.id,
    note: d.data.note || null,
  });
  await refreshSamples({ sampleIds: [d.data.sampleId] });
  done();
  return { ok: true };
}

/** Add a content link by hand when the system found nothing (e.g. the video is not in the reports yet). */
export async function addManualContent(username: string, sampleId: number, link: string): Promise<R> {
  const l = z.string().trim().min(8, "Paste the video link.").max(500).safeParse(link);
  if (!l.success) return { error: l.error.issues[0].message };
  const id = l.data.match(/video\/(\d+)/)?.[1] ?? `link:${l.data}`;
  return decideContent({ sampleId, contentId: id, decision: "verified", link: l.data }, username);
}

export async function undoDecision(decisionId: number): Promise<R> {
  const user = await requireUser("manager");
  const [d] = await db
    .update(contentDecisions)
    .set({ revertedAt: new Date(), revertedBy: user.id })
    .where(and(eq(contentDecisions.id, decisionId), isNull(contentDecisions.revertedAt)))
    .returning({ sampleId: contentDecisions.sampleId });
  if (d?.sampleId) await refreshSamples({ sampleIds: [d.sampleId] });
  done();
  return { ok: true };
}
