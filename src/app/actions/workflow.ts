"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { commitmentChanges, commitments, contentDecisions, staffEvents } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { refreshSamples } from "@/lib/samples/service";
import { todayKL } from "@/lib/time";
import { createCommitment, refreshCommitments, rescheduleCommitment } from "@/lib/workflow/commitments";
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
export type ActionContext = { action: string; product?: string | null; productId?: string | null; status?: string | null };
const Context = z
  .object({ action: z.string().trim().min(1).max(20), product: z.string().trim().max(120).nullish(), productId: z.string().max(40).nullish(), status: z.string().max(20).nullish() })
  .optional();

export async function markContacted(usernames: string[], confirmCount?: number, context?: ActionContext): Promise<R> {
  const ctx = Context.safeParse(context);
  if (!ctx.success) return { error: "Check the action details." };
  const user = await requireUser("manager");
  const names = [...new Set(z.array(Name).min(1).max(200).parse(usernames))];
  // Bulk safety: the caller must confirm exactly how many records it is about to change.
  if (names.length > 1 && confirmCount !== names.length) return { error: `Please confirm the ${names.length} selected creators first.` };
  const batchId = names.length > 1 ? randomUUID() : null;
  let last = 0;
  for (const u of names) last = await addEvent({ username: u, kind: "contacted", userId: user.id, batchId, ...(ctx.data ? { details: { action: ctx.data.action, product: ctx.data.product ?? null, productId: ctx.data.productId ?? null, status: ctx.data.status ?? null } } : {}) });
  done();
  return { ok: true, eventId: last, batchId: batchId ?? undefined, count: names.length };
}

const Deliverable = z
  .object({
    details: z.string().trim().max(300).optional(),
    productId: z.string().regex(/^\d{5,30}$/).optional(),
    contentType: z.enum(["video", "live"]).optional(),
    quantity: z.number().int().min(1).max(50).optional(),
  })
  .optional();
export type PromiseOptions = z.input<typeof Deliverable>;

/** Derived state (commitment progress, sample deadlines) must follow every change to promises or decisions. */
async function afterChange(sampleIds?: number[]) {
  if (sampleIds?.length) await refreshSamples({ sampleIds });
  else await refreshCommitments();
}

/**
 * The creator promised to post by a date. Only the date is needed. Optional, structured: content type, product, quantity.
 * (Free text "details" is kept for reading and is never interpreted as a quantity or product.)
 */
export async function markPromised(username: string, promisedOn: string, opts?: PromiseOptions): Promise<R> {
  const user = await requireUser("manager");
  const u = Name.parse(username);
  const p = Day.safeParse(promisedOn);
  if (!p.success) return { error: p.error.issues[0].message };
  const o = Deliverable.safeParse(opts);
  if (!o.success) return { error: "Check the optional details (quantity 1–50, product, video or LIVE)." };
  const v = o.data ?? {};
  const eventId = await addEvent({
    username: u,
    kind: "promised",
    userId: user.id,
    details: { promisedOn: p.data, details: v.details || null, productId: v.productId ?? null, contentType: v.contentType ?? null, quantity: v.quantity ?? null },
  });
  const { sampleIds } = await createCommitment({ username: u, eventId, promisedOn: p.data, details: v.details, productId: v.productId, contentType: v.contentType, quantity: v.quantity });
  // The agreed date replaces the default posting deadline for the samples this promise is about.
  await afterChange(sampleIds);
  done();
  return { ok: true, eventId };
}

/**
 * Move the deadline of an existing promise. This is NOT a new commitment: the original date and every change stay on record,
 * only the current deadline drives reminders, and Progress does not count it as another promise secured.
 */
export async function rescheduleCommitmentAction(commitmentId: number, toOn: string): Promise<R> {
  const user = await requireUser("manager");
  const p = Day.safeParse(toOn);
  if (!p.success) return { error: p.error.issues[0].message };
  const [c] = await db.select().from(commitments).where(eq(commitments.id, commitmentId));
  if (!c) return { error: "That promise no longer exists." };
  const [origin] = await db.select({ reverted: staffEvents.revertedAt }).from(staffEvents).where(eq(staffEvents.id, c.eventId));
  if (!origin || origin.reverted) return { error: "That promise was undone." };
  const eventId = await addEvent({ username: c.username, kind: "rescheduled", userId: user.id, details: { commitmentId, promiseEventId: c.eventId, toOn: p.data } });
  const res = await rescheduleCommitment({ commitmentId, eventId, toOn: p.data });
  if (!res) return { error: "That promise no longer exists." };
  await db.update(staffEvents).set({ details: { commitmentId, promiseEventId: c.eventId, fromOn: res.fromOn, toOn: p.data } }).where(eq(staffEvents.id, eventId));
  await afterChange(c.sampleIds);
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

/** Undo one action, or a whole bulk batch. The history keeps who did it, when, and who undid it; derived state is rebuilt. */
export async function undoEvent(eventId: number): Promise<R> {
  const user = await requireUser("manager");
  const [ev] = await db.select({ kind: staffEvents.kind, username: staffEvents.username, batchId: staffEvents.batchId }).from(staffEvents).where(eq(staffEvents.id, eventId));
  if (!ev) return { error: "That action no longer exists." };
  // samples whose deadline depended on the promise (found before the event stops counting)
  let sampleIds: number[] = [];
  if (ev.kind === "promised" || ev.kind === "rescheduled") {
    const direct = await db.select({ s: commitments.sampleIds }).from(commitments).where(eq(commitments.eventId, eventId));
    const viaChange = await db
      .select({ s: commitments.sampleIds })
      .from(commitmentChanges)
      .innerJoin(commitments, eq(commitments.id, commitmentChanges.commitmentId))
      .where(eq(commitmentChanges.eventId, eventId));
    sampleIds = [...direct, ...viaChange].flatMap((x) => x.s);
  }
  if (ev.batchId) await revertBatch(ev.batchId, user.id);
  else await revertEvent(eventId, user.id);
  if (ev.kind === "promised" || ev.kind === "rescheduled") await afterChange(sampleIds);
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

/**
 * Staff decide on possible content for a commitment (works with or without a sample).
 * "verified" counts the piece for this commitment only; pass shared = true to deliberately let it ALSO count where another
 * commitment already uses it. "rejected" stops it being suggested for this commitment.
 */
export async function decideCommitmentContent(commitmentId: number, contentId: string, decision: "verified" | "rejected", shared = false): Promise<R> {
  const user = await requireUser("manager");
  const [c] = await db.select().from(commitments).where(eq(commitments.id, commitmentId));
  if (!c) return { error: "That promise no longer exists." };
  const cid = z.string().trim().min(1).max(200).parse(contentId);
  const [item] = (await db.execute(sql`select link from content_items where content_id = ${cid}`)) as unknown as { link: string | null }[];
  await db.insert(contentDecisions).values({
    username: c.username,
    commitmentId,
    contentId: cid,
    link: item?.link ?? null,
    decision,
    userId: user.id,
    shared: decision === "verified" && shared,
  });
  await afterChange(c.sampleIds);
  done();
  return { ok: true };
}

/** Paste a video link for a promise when the reports do not have it yet. Counted by staff verification; its posting date stays unknown. */
export async function addCommitmentLink(commitmentId: number, link: string): Promise<R> {
  const l = z.string().trim().min(8, "Paste the video link.").max(500).safeParse(link);
  if (!l.success) return { error: l.error.issues[0].message };
  const user = await requireUser("manager");
  const [c] = await db.select().from(commitments).where(eq(commitments.id, commitmentId));
  if (!c) return { error: "That promise no longer exists." };
  const id = l.data.match(/video\/(\d+)/)?.[1] ?? `link:${l.data}`;
  await db.insert(contentDecisions).values({ username: c.username, commitmentId, contentId: id, link: l.data, decision: "verified", userId: user.id });
  await afterChange(c.sampleIds);
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
    .returning({ sampleId: contentDecisions.sampleId, commitmentId: contentDecisions.commitmentId });
  if (d?.sampleId) await refreshSamples({ sampleIds: [d.sampleId] });
  else if (d?.commitmentId) {
    const [c] = await db.select({ s: commitments.sampleIds }).from(commitments).where(eq(commitments.id, d.commitmentId));
    await afterChange(c?.s);
  }
  done();
  return { ok: true };
}

const NewCreator = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .transform((s) => s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?tiktok\.com\/@/, "").replace(/[/?].*$/, ""))
    .pipe(z.string().regex(/^[a-z0-9._]{2,40}$/, "Enter the TikTok username, e.g. @name.")),
  phone: z.string().trim().max(30).optional(),
  contactedNow: z.boolean().optional(),
});

/** Start outreach to a creator nobody has recorded yet. A sample is not needed. WhatsApp numbers keep their own permission. */
export async function addCreatorAction(input: z.input<typeof NewCreator>): Promise<R & { username?: string; existed?: boolean }> {
  const user = await requireUser("manager");
  const p = NewCreator.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { addCreator } = await import("@/lib/workflow/creators");
  const { mayEditContacts } = await import("@/lib/auth");
  if (p.data.phone && !mayEditContacts(user)) return { error: "You don't have permission to edit WhatsApp numbers. Add the creator without a number, or ask an admin." };
  const res = await addCreator({ username: p.data.username, phone: p.data.phone ?? null, contactedNow: !!p.data.contactedNow, userId: user.id });
  if ("error" in res) return { error: res.error };
  done();
  return { ok: true, username: p.data.username, existed: res.existed };
}
