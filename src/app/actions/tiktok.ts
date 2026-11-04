"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { disconnect } from "@/lib/tiktok/client";

/** Forget the TikTok connection (tokens are deleted). Imported data and uploads are untouched. */
export async function disconnectTikTok(): Promise<{ ok: true }> {
  await requireUser("admin");
  await disconnect();
  revalidatePath("/settings");
  return { ok: true };
}
