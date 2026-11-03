"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { creators, samples } from "@/db/schema";
import { getCurrentUser, mayEditContacts, requireUser } from "@/lib/auth";
import { generateActions } from "@/lib/analytics/recommendations";
import { refreshSamples } from "@/lib/samples/service";
import { normalisePhone } from "@/lib/ingest/import";

const done = () => {
  revalidatePath("/samples", "layout");
  revalidatePath("/today");
};

const NO_PHONE_RIGHT = "You don't have permission to edit WhatsApp numbers. Ask an admin to tick “Can edit WhatsApp” for you in Settings.";
async function allowedToEditContacts(): Promise<boolean> {
  const u = await getCurrentUser();
  return !!u && mayEditContacts(u);
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const Username = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9._]{2,40}$/, "Enter a valid TikTok username."));

const Patch = z.object({
  ownerId: z.uuid().nullable().optional(),
  followUpAt: Day.optional(),
  note: z.string().max(2000).nullable().optional(),
  resultOverride: z.enum(["posted_video", "did_live", "not_posted"]).nullable().optional(),
});
export type SamplePatch = z.input<typeof Patch>;

/** Team notes on one sample: person in charge, follow-up date, note, and a corrected result. */
export async function updateSample(id: number, patch: SamplePatch): Promise<{ ok?: true; error?: string }> {
  await requireUser("manager");
  const p = Patch.safeParse(patch);
  if (!p.success) return { error: p.error.issues[0].message };
  const v = p.data;
  await db
    .update(samples)
    .set({
      ...(v.ownerId !== undefined ? { ownerId: v.ownerId } : {}),
      ...(v.followUpAt !== undefined ? { followUpAt: v.followUpAt } : {}),
      ...(v.note !== undefined ? { note: v.note?.trim() || null } : {}),
      ...(v.resultOverride !== undefined ? { resultOverride: v.resultOverride } : {}),
      updatedAt: new Date(),
    })
    .where(eq(samples.id, id));
  // Confirmed as posted: close the open, untouched chase for this creator if nothing else is outstanding.
  if (v.resultOverride === "posted_video" || v.resultOverride === "did_live") {
    await db.execute(sql`
      delete from actions a using samples s
      where s.id = ${id} and a.username = s.creator and a.type = 'sample_chase' and a.status = 'open'
        and a.note is null and a.assignee_id is null
        and not exists (
          select 1 from samples o where o.creator = s.creator and o.id <> s.id
            and coalesce(o.result_override, o.result) = 'not_posted')`);
  }
  done();
  return { ok: true };
}

/**
 * TikTok hides the receiver's name on sample orders. When the app can't match it, staff pick
 * the TikTok username once – it applies to every sample with the same masked name.
 */
export async function setBuyerCreator(buyerMasked: string, creator: string): Promise<{ ok?: true; error?: string }> {
  await requireUser("manager");
  const u = Username.safeParse(creator);
  if (!u.success) return { error: u.error.issues[0].message };
  await db.execute(sql`
    update samples set creator = ${u.data}, creator_match = 'manual', updated_at = now()
    where buyer_masked = ${buyerMasked} and creator is null`);
  await refreshSamples();
  done();
  return { ok: true };
}

/** The one thing staff must add: the creator's WhatsApp number. */
export async function saveCreatorPhone(username: string, phone: string): Promise<{ ok?: true; error?: string }> {
  await requireUser("manager");
  if (!(await allowedToEditContacts())) return { error: NO_PHONE_RIGHT };
  const tel = phone.trim() ? normalisePhone(phone) : null;
  if (phone.trim() && !tel) return { error: "Enter the number with country code, e.g. 60123456789." };
  await db
    .insert(creators)
    .values({ username, phone: tel, contactEdited: true })
    .onConflictDoUpdate({ target: creators.username, set: { phone: tel, contactEdited: true, updatedAt: new Date() } });
  revalidatePath(`/creators/${encodeURIComponent(username)}`);
  done();
  return { ok: true };
}

const Contact = z.object({
  phone: z.string().trim().max(30).nullable(),
  approach: z.enum(["video", "live", "both"]).nullable(),
});

export async function saveCreatorContact(username: string, input: z.input<typeof Contact>): Promise<{ ok?: true; error?: string }> {
  await requireUser("manager");
  if (!(await allowedToEditContacts())) return { error: NO_PHONE_RIGHT };
  const p = Contact.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const phone = p.data.phone ? normalisePhone(p.data.phone) : null;
  if (p.data.phone && !phone) return { error: "Enter the number with country code, e.g. 60123456789." };
  await db
    .insert(creators)
    .values({ username, phone, approach: p.data.approach, contactEdited: true })
    .onConflictDoUpdate({
      target: creators.username,
      set: { phone, approach: p.data.approach, contactEdited: true, updatedAt: new Date() },
    });
  revalidatePath(`/creators/${encodeURIComponent(username)}`);
  done();
  return { ok: true };
}

/** Re-run creator matching, the posting check and the follow-up actions. */
export async function refreshSampleChecks(): Promise<{ matched: number; created: number }> {
  await requireUser("manager");
  const r = await refreshSamples();
  const a = await generateActions();
  done();
  revalidatePath("/", "layout");
  return { ...r, created: a.created };
}
