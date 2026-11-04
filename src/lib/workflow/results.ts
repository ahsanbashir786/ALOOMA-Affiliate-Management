import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { addDaysISO, todayKL } from "@/lib/time";

export type ActionResults = {
  /** Creators whose first contact in the period is at least 28 days old, so the 28 days after are complete. */
  measured: number;
  /** Contacted too recently – the 28 days after are not complete yet. */
  waiting: number;
  before: number;
  after: number;
  /** Creators who posted at least one video in the 28 days after contact. */
  posted: number;
  byAction: { action: string; n: number; before: number; after: number; posted: number }[];
  byStaff: { name: string; n: number; before: number; after: number; posted: number }[];
};

/**
 * Sales in the 28 days after a creator was first contacted (in the period), against the 28 days before.
 * This is context, not proof: other things also move sales. Only creators with a complete 28 days after are counted.
 */
export async function getActionResults(days: number): Promise<ActionResults> {
  const end = todayKL();
  const start = addDaysISO(end, -(days - 1));
  const [lastRow] = await rows<{ d: string | null }>(sql`select to_char(max(created_at), 'YYYY-MM-DD') as d from order_lines`);
  const dataEnd = lastRow?.d ?? end;
  const list = await rows<{ username: string; d: string; action: string | null; by: string | null; before: number; after: number; posted: boolean }>(sql`
    with first_c as (
      select distinct on (e.username) e.username, to_char((e.at at time zone 'Asia/Kuala_Lumpur')::date, 'YYYY-MM-DD') as d,
        e.details->>'action' as action, u.name as by
      from staff_events e left join users u on u.id::text = e.user_id::text
      where e.kind = 'contacted' and e.reverted_at is null and (e.at at time zone 'Asia/Kuala_Lumpur')::date between ${start}::date and ${end}::date
      order by e.username, e.at)
    select f.username, f.d, f.action, f.by,
      coalesce((select sum(al.pay) from ${AL} where al.creator = f.username and al.valid and al.created_at::date between f.d::date - 28 and f.d::date - 1), 0)::float8 as before,
      coalesce((select sum(al.pay) from ${AL} where al.creator = f.username and al.valid and al.created_at::date between f.d::date + 1 and f.d::date + 28), 0)::float8 as after,
      exists (select 1 from content_items ci where ci.creator = f.username and ci.kind = 'video' and ci.posted_at::date between f.d::date + 1 and f.d::date + 28) as posted
    from first_c f`);
  const ready = list.filter((r) => addDaysISO(r.d, 28) <= dataEnd);
  const agg = <K extends string>(key: (r: (typeof ready)[number]) => K) => {
    const m = new Map<K, { n: number; before: number; after: number; posted: number }>();
    for (const r of ready) {
      const e = m.get(key(r)) ?? { n: 0, before: 0, after: 0, posted: 0 };
      e.n++; e.before += r.before; e.after += r.after; e.posted += r.posted ? 1 : 0;
      m.set(key(r), e);
    }
    return m;
  };
  return {
    measured: ready.length,
    waiting: list.length - ready.length,
    before: ready.reduce((a, r) => a + r.before, 0),
    after: ready.reduce((a, r) => a + r.after, 0),
    posted: ready.filter((r) => r.posted).length,
    byAction: [...agg((r) => r.action ?? "Contacted")].map(([action, v]) => ({ action, ...v })).sort((a, b) => b.n - a.n),
    byStaff: [...agg((r) => r.by ?? "Unknown")].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n),
  };
}
