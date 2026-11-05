import "server-only";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";

/** Typed raw query helper. Cast counts with ::int and sums with ::float8 in SQL. */
export async function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}
