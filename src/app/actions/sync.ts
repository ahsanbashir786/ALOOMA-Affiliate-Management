"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SYNC_CHOICES, clearInterrupted, saveSyncSettings } from "@/lib/tiktok/sync";

/** The automatic sync: off, or every 30 minutes / 1 hour / 3 hours / 12 hours / day. */
export async function setSyncSchedule(everyMinutes: number): Promise<{ ok: true }> {
  await requireUser("admin");
  const on = (SYNC_CHOICES as readonly number[]).includes(everyMinutes);
  await saveSyncSettings({ enabled: on, everyMinutes: on ? everyMinutes : 60 });
  revalidatePath("/sync");
  return { ok: true };
}

/** For a sync that seems stuck: marks it as interrupted so a new one can start. Nothing already saved is lost. */
export async function resetStuckSync(): Promise<{ cleared: number }> {
  await requireUser("manager");
  const cleared = await clearInterrupted("Reset by a person");
  revalidatePath("/sync");
  return { cleared };
}
