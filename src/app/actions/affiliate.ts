"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth";
import { saveAffiliateTarget } from "@/lib/affiliate/command";

/** Sets the sales goal for 28 days (empty = go back to the automatic average). */
export async function setAffiliateTarget(raw: string): Promise<{ ok?: true; error?: string }> {
  await requirePermission("creators");
  const t = raw.trim().replace(/[,\s]|^RM/gi, "");
  if (t === "") { await saveAffiliateTarget(null); revalidatePath("/affiliate"); return { ok: true }; }
  const p = z.coerce.number().positive().max(100_000_000).safeParse(t);
  if (!p.success) return { error: "Type the goal as a number, for example 200000." };
  await saveAffiliateTarget(Math.round(p.data));
  revalidatePath("/affiliate");
  return { ok: true };
}
