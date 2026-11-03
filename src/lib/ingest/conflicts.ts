import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { importConflicts, orderLines, shopOrderLines } from "@/db/schema";
import { AFFILIATE_DATES, SHOP_DATES } from "./freshness";

const revive = (row: Record<string, unknown>, dates: readonly string[]) => {
  const out = { ...row };
  for (const k of [...dates, "createdAt", "asof"]) if (typeof out[k] === "string") out[k] = new Date(out[k] as string);
  return out;
};

/**
 * The deliberate correction path for lines an import could not rank.
 * "accept" writes the file's version (a person vouches it is the newer one); "dismiss" keeps what is stored.
 * Either way the decision and who made it stay on record.
 */
export async function resolveConflicts(ids: number[], action: "accept" | "dismiss", userId: string | null): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db.select().from(importConflicts).where(and(eq(importConflicts.status, "pending"), sql`${importConflicts.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  let n = 0;
  await db.transaction(async (tx) => {
    for (const c of rows) {
      if (action === "accept") {
        const inc = c.incoming as Record<string, unknown>;
        if (c.kind === "affiliate_orders") {
          const row = revive(inc, AFFILIATE_DATES) as typeof orderLines.$inferInsert;
          await tx.insert(orderLines).values(row).onConflictDoUpdate({ target: [orderLines.orderId, orderLines.skuId], set: row });
        } else {
          const row = revive(inc, SHOP_DATES) as typeof shopOrderLines.$inferInsert;
          await tx.insert(shopOrderLines).values(row).onConflictDoUpdate({ target: [shopOrderLines.orderId, shopOrderLines.skuId], set: row });
        }
      }
      await tx.update(importConflicts).set({ status: action === "accept" ? "accepted" : "dismissed", resolvedAt: new Date(), resolvedBy: userId }).where(eq(importConflicts.id, c.id));
      n++;
    }
  });
  return n;
}
