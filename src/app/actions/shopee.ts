"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { shopeeDisconnect } from "@/lib/shopee/client";

/** Forget the Shopee connection (the login is deleted). Nothing in Shopee changes. */
export async function disconnectShopee(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await shopeeDisconnect();
  revalidatePath("/settings");
  return { ok: true };
}
