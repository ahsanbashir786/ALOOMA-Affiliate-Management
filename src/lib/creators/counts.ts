import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/sql";
import { addDaysISO, todayKL } from "@/lib/time";

export type DailyCounts = { day: string; creators: number; sellers: number; todo: number; unowned: number };

/** Saves today's headline counts (one row per day, the latest view of the day wins). Never breaks the page. */
export async function recordDailyCounts(c: Omit<DailyCounts, "day">): Promise<void> {
  try {
    await rows(sql`insert into creator_daily_counts (day, creators, sellers, todo, unowned) values (${todayKL()}::date, ${c.creators}, ${c.sellers}, ${c.todo}, ${c.unowned})
      on conflict (day) do update set creators = excluded.creators, sellers = excluded.sellers, todo = excluded.todo, unowned = excluded.unowned, recorded_at = now()`);
  } catch { /* the counts are a convenience; the page must still load */ }
}

/**
 * The saved counts to compare with: the newest day that is at least 28 days old; if we have not been saving that long,
 * the oldest day we have (so the change grows into a full 28-day comparison). null when only today exists.
 */
export async function countsToCompare(): Promise<DailyCounts | null> {
  const today = todayKL();
  const cols = sql`to_char(day, 'YYYY-MM-DD') as day, creators, sellers, todo, unowned`;
  const [old] = await rows<DailyCounts>(sql`select ${cols} from creator_daily_counts where day <= ${addDaysISO(today, -28)}::date order by day desc limit 1`);
  if (old) return old;
  const [first] = await rows<DailyCounts>(sql`select ${cols} from creator_daily_counts where day < ${today}::date order by day asc limit 1`);
  return first ?? null;
}
