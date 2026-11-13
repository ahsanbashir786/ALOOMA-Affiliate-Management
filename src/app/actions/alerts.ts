"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { setAlertStatus } from "@/lib/alerts/queries";

/** "Seen" keeps the problem listed but stops it counting on the bell; "cleared" removes an error until it happens again. */
export async function markAlert(key: string, status: "seen" | "resolved"): Promise<{ ok: true }> {
  const user = await requirePermission("settings");
  await setAlertStatus(String(key).slice(0, 300), status, user.name);
  revalidatePath("/settings");
  return { ok: true };
}

/** Looks at everything again now. */
export async function checkAlertsNow(): Promise<{ ok: true }> {
  await requirePermission("settings");
  await evaluateAlerts(true);
  revalidatePath("/settings");
  return { ok: true };
}
