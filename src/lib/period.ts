import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computePeriod, type Bounds, type Period } from "./period-core";

export * from "./period-core";

/** Order data bounds. Falls back to "today" when nothing has been imported. */
export const getDataBounds = cache(async (): Promise<Bounds> => {
  const rows = await db.execute<{ min: string | null; max: string | null }>(
    sql`select to_char(min(created_at), 'YYYY-MM-DD') as min, to_char(max(created_at), 'YYYY-MM-DD') as max from order_lines`,
  );
  const r = rows[0];
  const today = new Date().toISOString().slice(0, 10);
  return { min: r?.min ?? today, max: r?.max ?? today, hasData: !!r?.min };
});

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function resolvePeriod(sp: SP): Promise<Period> {
  return computePeriod(await getDataBounds(), {
    range: first(sp.range),
    from: first(sp.from),
    to: first(sp.to),
  });
}

/** Query-string that carries the period across navigation. */
export function periodQuery(p: Pick<Period, "key" | "start" | "end">) {
  if (p.key === "custom") return `range=custom&from=${p.start}&to=${p.end}`;
  return `range=${p.key}`;
}
