"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requirePermission, requireView } from "@/lib/auth";
import { addEvent } from "@/lib/creators/workflow/events";
import { fetchCreatorProfile, outreachScopes, preferredCategories, reviewEnabled, reviewSampleApplication, saveProfile, searchMarketplace, setReviewEnabled } from "@/lib/tiktok/outreach";
import { judgeCreators, type TikTokCreator } from "@/lib/affiliate/outreach-load";

type R = { ok?: true; error?: string };
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
const Reason = z.enum(["NOT_MATCH", "OFFLINE", "OUT_OF_STOCK", "OTHER"]);

/** Approve or reject one waiting sample request on TikTok. Needs the Approve Samples permission, the owner's switch, and TikTok's write permission. */
export async function reviewSample(id: string, result: "APPROVE" | "REJECT", reason?: string): Promise<R> {
  const user = await requirePermission("approve_samples");
  const p = z.object({ id: z.string().regex(/^\d{5,30}$/), result: z.enum(["APPROVE", "REJECT"]), reason: Reason.optional() }).safeParse({ id, result, reason });
  if (!p.success) return { error: "That request could not be read. Reload the page and try again." };
  if (!(await reviewEnabled())) return { error: "Approving is switched off. The owner switches it on at the top of the Outreach screen." };
  const sc = await outreachScopes();
  if (!sc.connected) return { error: "TikTok Shop is not connected." };
  if (!sc.write) return { error: "TikTok has not granted the permission to approve samples (seller.affiliate_collaboration.write). Switch it on in Partner Center, then reconnect TikTok in Settings." };
  // Check our own copy first: only a waiting, approvable, not expired request is sent to TikTok.
  const [row] = await q(sql`select creator, status, is_approvable, order_id, expires_at, sku_name, product_title from tt_sample_requests where id = ${p.data.id}`);
  if (!row) return { error: "This request is not in your data any more. Run Data Sync and try again." };
  if (row.is_approvable !== true || (row.order_id && !/^0*$/.test(String(row.order_id)))) return { error: "TikTok says this request can no longer be decided." };
  if (row.expires_at && new Date(String(row.expires_at)) < new Date()) return { error: "This request has expired." };
  const r = await reviewSampleApplication(p.data.id, p.data.result, p.data.reason);
  if (!r.ok) return { error: `TikTok did not accept it: ${r.error}` };
  await q(sql`update tt_sample_requests set status = ${p.data.result === "APPROVE" ? "APPROVED" : "REJECTED"}, is_approvable = false where id = ${p.data.id}`);
  await addEvent({ username: String(row.creator), kind: "note", userId: user.id, details: { action: p.data.result === "APPROVE" ? "Approved Sample" : "Rejected Sample", product: String(row.product_title ?? row.sku_name ?? ""), applicationId: p.data.id, reason: p.data.reason ?? null } });
  revalidatePath("/affiliate/outreach");
  return { ok: true };
}

/** The owner's switch for approving and rejecting. Off until turned on. */
export async function setOutreachReview(on: boolean): Promise<R> {
  await requirePermission("settings");
  await setReviewEnabled(!!on);
  revalidatePath("/affiliate/outreach");
  return { ok: true };
}

export type FindResult = { ok: true; creators: TikTokCreator[]; hidden: number; fieldsSeen: string[] } | { ok: false; error: string };

/** Looks creators up in TikTok's Creator Marketplace, in your categories, and applies your rules. Reads only, so a read-only login may use it. */
export async function findCreators(keyword: string, gmv: string[]): Promise<FindResult> {
  await requireView("creators");
  const sc = await outreachScopes();
  if (!sc.connected || !sc.market) return { ok: false, error: "TikTok has not granted the creator search permission yet." };
  const prefs = await preferredCategories();
  const r = await searchMarketplace({ keyword: keyword.slice(0, 60), gmvRanges: gmv.slice(0, 4), categoryIds: prefs.ids, notInvited90d: true });
  if (!r.ok) return { ok: false, error: /too many requests|rate limit/i.test(r.error) ? "TikTok is busy right now. Wait a minute and press Search TikTok again." : r.error };
  return judgeCreators(r.creators, prefs, r.fieldsSeen);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Asks TikTok for the level, categories and scores of the creators whose sample requests are waiting and not checked yet (or checked over a week ago).
 * Fifteen at a time, one every half second, so the shared speed limit is not hit. Press again for the next fifteen.
 */
export async function checkEligibility(): Promise<{ ok?: true; checked: number; left: number; error?: string }> {
  await requirePermission("creators");
  const sc = await outreachScopes();
  if (!sc.connected || !sc.market) return { checked: 0, left: 0, error: "TikTok has not granted the creator search permission yet." };
  const need = async (limit: number) => (await q(sql`
    select distinct r.creator_id as id from tt_sample_requests r
    where r.is_approvable and r.creator_id is not null and (r.order_id is null or r.order_id ~ '^0*$')
      and not exists (select 1 from tt_creator_profiles p where p.open_id = r.creator_id and p.checked_at > now() - interval '7 days') limit ${limit}`)).map((r) => String(r.id));
  const ids = await need(15);
  let checked = 0;
  for (const id of ids) {
    const r = await fetchCreatorProfile(id);
    if (r.ok) { await saveProfile(id, r.profile); checked++; }
    else if (r.busy) { return { checked, left: (await need(500)).length, error: "TikTok is busy right now. Wait a minute and press Check Eligibility again." }; }
    else { await saveProfile(id, { username: null, followers: null, level: null, categoryIds: [], pps: null, rating: null, postRate: null, sampleScore: null, fulfilmentScore: null, officialRecommend: null, risingStar: null, blocked: null, invited90d: null, hasCollaborated: null, hasProfile: false }); checked++; }
    await wait(450);
  }
  revalidatePath("/affiliate/outreach");
  return { ok: true, checked, left: (await need(500)).length };
}
