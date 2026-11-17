"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { shopeeDisconnect } from "@/lib/shopee/client";
import { setShopeeSyncSettings } from "@/lib/shopee/sync";

/** Forget the Shopee connection (the login is deleted). Nothing in Shopee changes. */
export async function disconnectShopee(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await shopeeDisconnect();
  revalidatePath("/settings");
  return { ok: true };
}

/** Auto-sync for Shopee: 0 = off, otherwise every 30, 60, 180, 720 or 1440 minutes. */
export async function setShopeeSyncSchedule(minutes: number): Promise<{ ok: true }> {
  await requirePermission("sync");
  await setShopeeSyncSettings(Number(minutes));
  revalidatePath("/sync");
  return { ok: true };
}
