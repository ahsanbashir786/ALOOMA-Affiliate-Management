"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { disconnect } from "@/lib/tiktok/client";

/** Forget the TikTok connection (tokens are deleted). Synced data is untouched. */
export async function disconnectTikTok(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await disconnect();
  revalidatePath("/settings");
  return { ok: true };
}
