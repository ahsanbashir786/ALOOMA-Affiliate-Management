import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";

/** Active team members, for the owner pickers and filters. */
export async function getStaff(): Promise<{ id: string; name: string }[]> {
  return rows<{ id: string; name: string }>(sql`select id::text as id, name from users where active order by name`);
}

/** How long ago the affiliate orders were last synced, in words, and whether that is fresh enough to trust. */
export async function syncFreshness(): Promise<{ label: string; ok: boolean; never: boolean }> {
  const [r] = await rows<{ m: number | null }>(sql`select extract(epoch from (now() - max(last_success_at)))::float8 / 60 as m from tt_sync_state where dataset in ('affiliate_orders', 'sample_requests', 'videos')`);
  if (r?.m == null) return { label: "Not synced yet", ok: false, never: true };
  const m = Math.max(0, Math.round(r.m));
  const label = m < 2 ? "Synced just now" : m < 60 ? `Synced ${m} min ago` : m < 1440 ? `Synced ${Math.round(m / 60)} h ago` : `Synced ${Math.round(m / 1440)} days ago`;
  return { label, ok: m < 360, never: false };
}
