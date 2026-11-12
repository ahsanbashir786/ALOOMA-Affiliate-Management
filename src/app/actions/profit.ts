"use server";

import { revalidatePath } from "next/cache";
import { sql as pg } from "@/db";
import { requirePermission } from "@/lib/auth";
import { clearProfit } from "@/lib/profit/data";
import { clearCosting } from "@/lib/stock/costing";

export type ActionResult = { ok: true } | { ok: false; error: string };
const STATUSES = ["open", "claimed", "recovered", "dismissed"];

/** Remembers what you did about one claimable amount. */
export async function setClaimStatus(key: string, orderId: string, kind: string, amount: number, status: string, note: string): Promise<ActionResult> {
  const user = await requirePermission("profit");
  if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };
  if (!key || !orderId) return { ok: false, error: "Missing item." };
  await pg`insert into claim_back_items (key, order_id, kind, amount, status, note, updated_by, updated_at)
    values (${key.slice(0, 200)}, ${orderId.slice(0, 64)}, ${kind.slice(0, 80)}, ${Math.round(Number(amount) * 100) / 100}, ${status}, ${note.trim().slice(0, 500) || null}, ${user.name}, now())
    on conflict (key) do update set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`;
  revalidatePath("/profit");
  return { ok: true };
}

/** The cost of packing and sending one piece, until a real 3PL invoice is known. */
export async function saveFulfilmentRate(rate: number): Promise<ActionResult> {
  await requirePermission("profit");
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: "Enter an amount between 0 and 100." };
  await pg`insert into settings (key, value, updated_at) values ('profit_fulfilment', ${JSON.stringify({ perUnit: Math.round(rate * 100) / 100 })}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  clearProfit(); clearCosting();
  revalidatePath("/profit");
  return { ok: true };
}

/** The real 3PL invoice of a month. An empty amount removes it and the per-piece rate is used again. */
export async function saveFulfilmentInvoice(month: string, amount: number | null, note: string): Promise<ActionResult> {
  const user = await requirePermission("profit");
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Choose a month." };
  if (amount == null) { await pg`delete from profit_fulfilment_months where month = ${month + "-01"}::date`; }
  else {
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Enter the invoice amount." };
    await pg`insert into profit_fulfilment_months (month, amount, note, updated_by, updated_at) values (${month + "-01"}::date, ${Math.round(amount * 100) / 100}, ${note.trim().slice(0, 200) || null}, ${user.name}, now())
      on conflict (month) do update set amount = excluded.amount, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`;
  }
  clearProfit();
  revalidatePath("/profit");
  return { ok: true };
}
