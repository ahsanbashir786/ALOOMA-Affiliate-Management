"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { adsDisconnect } from "@/lib/tiktok-ads/client";
import { ADS_SYNC_CHOICES, saveAdsSyncSettings } from "@/lib/tiktok-ads/sync";

/** Forget the TikTok Ads connection (the login is deleted). Synced data is untouched. */
export async function disconnectTikTokAds(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await adsDisconnect();
  revalidatePath("/settings");
  revalidatePath("/sync");
  return { ok: true };
}

/** The automatic ads sync: off, or every 30 minutes / 1 hour / 3 hours / 12 hours / day. */
export async function setAdsSyncSchedule(everyMinutes: number): Promise<{ ok: true }> {
  await requirePermission("settings");
  const on = (ADS_SYNC_CHOICES as readonly number[]).includes(everyMinutes);
  await saveAdsSyncSettings({ enabled: on, everyMinutes: on ? everyMinutes : 60 });
  revalidatePath("/sync");
  return { ok: true };
}
