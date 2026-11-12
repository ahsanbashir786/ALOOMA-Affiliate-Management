import "server-only";
import { sql as pg } from "@/db";
import { dayKL } from "@/lib/time";
import { loadProfit } from "./data";

export type ClaimStatus = "open" | "claimed" | "recovered" | "dismissed";
export type ClaimItem = { key: string; orderId: string; day: string | null; kind: string; type: string | null; amount: number; why: string; status: ClaimStatus; note: string | null; updatedBy: string | null };

export const titleCase = (s: string | null) => (s ?? "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const IS_ADS = /(^|_)ADS?(_|$)/;

/** A shipping fee this much above the usual is worth asking about. */
export function shippingLimit(fees: number[]): number {
  const s = fees.filter((x) => x > 0).sort((a, b) => a - b);
  if (s.length < 20) return Infinity; // too few orders to know what "usual" is
  const median = s[Math.floor(s.length / 2)];
  return Math.max(median * 2, median + 3);
}

/**
 * Money TikTok took from an order that you may be able to get back:
 *  - adjustments TikTok took off (shipping fee adjustment, penalties ...)
 *  - an order whose seller shipping fee is far above the usual
 * Reimbursements already received are summed up separately.
 */
export async function loadClaims(): Promise<{ items: ClaimItem[]; reimbursed: number; reimbursedCount: number; limit: number; types: { type: string; count: number; amount: number }[] }> {
  const [adj, data, saved] = await Promise.all([
    pg`select t.statement_id || ':' || t.id as tx, t.order_id, t.type, coalesce(t.adjustment_amount, t.settlement_amount, 0)::float8 as amount, s.statement_time
       from tt_fin_transactions t left join tt_fin_statements s on s.id = t.statement_id
       where t.adjustment_id is not null and t.order_id is not null`,
    loadProfit(),
    pg`select key, status, note, updated_by from claim_back_items`,
  ]);
  const savedBy = new Map(saved.map((r) => [String(r.key), r]));
  const dayOf = new Map(data.rows.map((r) => [r.orderId, r.day]));
  const items: ClaimItem[] = [];
  let reimbursed = 0, reimbursedCount = 0;
  const types = new Map<string, { count: number; amount: number }>();
  const push = (key: string, orderId: string, day: string | null, kind: string, type: string | null, amount: number, why: string) => {
    const sv = savedBy.get(key);
    items.push({ key, orderId, day, kind, type, amount, why, status: (sv?.status as ClaimStatus) ?? "open", note: (sv?.note as string) ?? null, updatedBy: (sv?.updated_by as string) ?? null });
  };
  for (const a of adj) {
    const type = String(a.type ?? "");
    const amount = Number(a.amount);
    const t = types.get(type) ?? { count: 0, amount: 0 };
    t.count++; t.amount += amount; types.set(type, t);
    if (/REIMBURS|COMPENSAT/i.test(type)) { if (amount > 0) { reimbursed += amount; reimbursedCount++; } continue; }
    if (IS_ADS.test(type.toUpperCase()) || amount >= 0) continue;
    const orderId = String(a.order_id);
    push(`${orderId}|deduction|${a.tx}`, orderId, dayOf.get(orderId) ?? (a.statement_time ? dayKL(a.statement_time as Date) : null), "Platform Deduction", type, -amount, `TikTok took RM ${(-amount).toFixed(2)} off this order as "${titleCase(type)}".`);
  }
  const paid = data.rows.filter((r) => r.money === "paid" || r.money === "processing");
  const limit = shippingLimit(paid.map((r) => -r.shipping));
  for (const r of paid) {
    const fee = -r.shipping;
    if (fee > limit) push(`${r.orderId}|shipping`, r.orderId, r.day, "Shipping Fee Higher Than Usual", null, fee, `The seller shipping fee deducted was RM ${fee.toFixed(2)}; most orders are far lower (limit RM ${limit.toFixed(2)}).`);
  }
  items.sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || (b.day ?? "").localeCompare(a.day ?? "") || b.amount - a.amount);
  return { items, reimbursed, reimbursedCount, limit, types: [...types.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) };
}
