"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { rows } from "@/lib/sql";
import { todayKL } from "@/lib/time";
import { createBoost, createBoostAuto, saveBoostWriteSettings, stopBoost, type BoostResult, type BoostWriteSettings } from "@/lib/tiktok-ads/boost-write";

export type BatchInput = { boostedOn: string; days: number; note?: string; /** The one shared budget typed into Seller Center (when the videos have no budget each). */ total?: number; videos: { creativeId: string; productId: string; budget: number }[] };

/** Records a batch you boosted in TikTok Ads Manager, so its results can be compared before and after. Nothing is sent to TikTok. */
export async function saveBoostBatch(input: BatchInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const user = await requirePermission("ads");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.boostedOn) ? input.boostedOn : todayKL();
  if (day > todayKL()) return { ok: false, error: "The boost date cannot be in the future." };
  const seen = new Set<string>();
  const videos = (input.videos ?? []).filter((v) => v.creativeId && !seen.has(`${v.creativeId}|${v.productId}`) && seen.add(`${v.creativeId}|${v.productId}`)).slice(0, 100)
    .map((v) => ({ creativeId: String(v.creativeId).slice(0, 64), productId: String(v.productId || "-").slice(0, 64), budget: Math.max(0, Math.round((Number(v.budget) || 0) * 100) / 100) }));
  if (!videos.length) return { ok: false, error: "Choose at least one video." };
  const days = Math.min(30, Math.max(1, Math.round(Number(input.days) || 1)));
  const sum = videos.reduce((a, v) => a + v.budget, 0);
  const total = input.total != null && Number(input.total) > 0 ? Math.round(Number(input.total) * 100) / 100 : sum;
  const [b] = await rows<{ id: number }>(sql`insert into ads_boost_batches (boosted_on, days, total_budget, note, created_by) values (${day}::date, ${days}, ${total}, ${(input.note ?? "").trim().slice(0, 300) || null}, ${user.name}) returning id::int as id`);
  for (const v of videos) await rows(sql`insert into ads_boost_batch_videos (batch_id, creative_id, product_id, budget) values (${b.id}, ${v.creativeId}, ${v.productId}, ${v.budget}) on conflict do nothing`);
  revalidatePath("/ads");
  return { ok: true, id: b.id };
}

/** Removes a batch from the Boost Log (a mistake, for example). Nothing changes in TikTok. */
export async function deleteBoostBatch(id: number): Promise<{ ok: true }> {
  await requirePermission("ads");
  await rows(sql`delete from ads_boost_batches where id = ${Math.round(Number(id))}`);
  revalidatePath("/ads");
  return { ok: true };
}

// ── Creating and stopping a boost in TikTok. Spends real money, so only the owner-level permission (Settings) may do it. ──

/** Creates a creative boost for one video in TikTok. */
export async function createBoostNow(input: { itemId: string; advertiserId: string; campaignId: string; budget: number; days: number | null }): Promise<BoostResult> {
  const user = await requirePermission("settings");
  const r = await createBoost({ itemId: String(input.itemId ?? ""), advertiserId: String(input.advertiserId ?? ""), campaignId: String(input.campaignId ?? ""), budget: Number(input.budget), days: input.days == null ? null : Number(input.days), user: user.name });
  revalidatePath("/ads"); revalidatePath(`/ads/video/${input.itemId}`); revalidatePath("/settings");
  return r;
}

/** Stops a running boost in TikTok. */
export async function stopBoostNow(sessionId: string, itemId?: string): Promise<BoostResult> {
  const user = await requirePermission("settings");
  const r = await stopBoost(String(sessionId ?? ""), user.name);
  revalidatePath("/ads"); if (itemId) revalidatePath(`/ads/video/${itemId}`); revalidatePath("/settings");
  return r;
}

/** The limits and the on/off switch for boosting from the app. */
export async function setBoostWriteSettings(patch: Partial<BoostWriteSettings>): Promise<BoostWriteSettings> {
  await requirePermission("settings");
  const s = await saveBoostWriteSettings({ enabled: patch.enabled, maxBudget: patch.maxBudget, dailyCap: patch.dailyCap });
  revalidatePath("/settings"); revalidatePath("/ads");
  return s;
}

export type BulkItem = { key: string; itemId: string; budget: number };
export type BulkResult = { key: string; ok: boolean; message: string };

/** Boosts several videos one after the other (each its own creative boost, as TikTok's API allows). Stops asking TikTok once the owner's limits are reached; every try is logged. */
export async function createBoostsBulk(items: BulkItem[], days: number | null): Promise<BulkResult[]> {
  const user = await requirePermission("settings");
  const out: BulkResult[] = [];
  for (const it of (items ?? []).slice(0, 20)) {
    const r = await createBoostAuto({ itemId: String(it.itemId ?? ""), budget: Number(it.budget), days: days == null ? null : Number(days), user: user.name });
    out.push({ key: it.key, ok: r.ok, message: r.ok ? r.message : r.error });
  }
  revalidatePath("/ads"); revalidatePath("/settings");
  return out;
}

/** Remembers that a creator was asked to authorize their videos for ads again. Nothing is sent to the creator or to TikTok. */
export async function markAuthAsked(creator: string, videoCount: number): Promise<{ ok: true }> {
  const user = await requirePermission("ads");
  const name = String(creator ?? "").trim().slice(0, 120);
  if (!name) return { ok: true };
  await rows(sql`insert into ads_auth_asks (creator, asked_by, video_count) values (${name}, ${user.name}, ${Math.max(0, Math.round(Number(videoCount) || 0))})`);
  revalidatePath("/ads");
  return { ok: true };
}
