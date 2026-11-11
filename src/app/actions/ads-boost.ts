"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { rows } from "@/lib/sql";
import { todayKL } from "@/lib/time";

export type BatchInput = { boostedOn: string; days: number; note?: string; videos: { creativeId: string; productId: string; budget: number }[] };

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
  const total = videos.reduce((a, v) => a + v.budget, 0);
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
