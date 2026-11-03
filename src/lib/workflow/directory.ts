import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { RELATIONSHIP, type Relationship } from "./relationship";
import { loadRelationships, type RelationshipRow } from "./relationships";

export type DirRow = {
  username: string;
  status: Relationship;
  nextLabel: string | null;
  nextOn: string | null;
  overdue: boolean;
  samples: { sent: number; posted: number };
  content: { pieces: number; done: number; needed: number };
};

export type Directory = { rows: DirRow[]; total: number; counts: Record<Relationship | "all", number> };

const ORDER: Relationship[] = ["stalled", "collaborating", "approached", "active", "inactive", "prospect", "paused"];

/** Searchable directory of every creator we have a record of: recorded work, samples, or sales. Status and next action come from the records. */
export async function getDirectory(opts: { q: string; status: Relationship | ""; page: number; size: number }): Promise<Directory> {
  const known = await rows<{ creator: string }>(sql`
    select distinct creator from order_lines where creator is not null and creator <> '(unknown)'
    union select distinct creator from samples where creator is not null
    union select username from creators where source = 'manual'`);
  const rel = await loadRelationships([...new Set([...known.map((k) => k.creator)])]);
  // plus everyone with recorded work (events / promises) who might have no sales
  const worked = await loadRelationships();
  for (const [u, r] of worked) rel.set(u, r);
  const all: RelationshipRow[] = [...rel.values()];
  const counts = { all: all.length, prospect: 0, approached: 0, collaborating: 0, active: 0, stalled: 0, inactive: 0, paused: 0 } as Directory["counts"];
  for (const r of all) counts[r.status]++;
  const q = opts.q.trim().toLowerCase().replace(/^@/, "");
  let list = all.filter((r) => (!q || r.username.toLowerCase().includes(q)) && (!opts.status || r.status === opts.status));
  // what needs attention first: overdue, then stalled, then soonest next date, then name
  list = list.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.nextOn ?? "9999").localeCompare(b.nextOn ?? "9999") || a.username.localeCompare(b.username));
  const total = list.length;
  const page = list.slice((opts.page - 1) * opts.size, opts.page * opts.size);
  const names = page.map((p) => p.username);
  const [smp, cnt, prm] = names.length
    ? await Promise.all([
        rows<{ creator: string; sent: number; posted: number }>(sql`
          select creator, count(*)::int as sent, (count(*) filter (where coalesce(result_override, result) in ('posted_video', 'did_live')))::int as posted
          from samples where source = 'orders' and creator in (${sql.join(names.map((n) => sql`${n}`), sql`, `)}) and coalesce(order_status, '') <> 'Canceled' group by creator`),
        rows<{ creator: string; n: number }>(sql`select creator, count(*)::int as n from content_items where creator in (${sql.join(names.map((n) => sql`${n}`), sql`, `)}) group by creator`),
        rows<{ username: string; done: number; needed: number }>(sql`
          select c.username, coalesce(sum(least(st.done, st.needed)), 0)::int as done, coalesce(sum(st.needed), 0)::int as needed
          from commitments c join staff_events e on e.id = c.event_id and e.reverted_at is null join commitment_status st on st.commitment_id = c.id
          where st.state <> 'fulfilled' and c.username in (${sql.join(names.map((n) => sql`${n}`), sql`, `)}) group by c.username`),
      ])
    : [[], [], []];
  const sBy = new Map(smp.map((x) => [x.creator, x]));
  const cBy = new Map(cnt.map((x) => [x.creator, x.n]));
  const pBy = new Map(prm.map((x) => [x.username, x]));
  return {
    total,
    counts,
    rows: page.map((r) => ({
      username: r.username,
      status: r.status,
      nextLabel: r.nextLabel,
      nextOn: r.nextOn,
      overdue: r.overdue,
      samples: { sent: sBy.get(r.username)?.sent ?? 0, posted: sBy.get(r.username)?.posted ?? 0 },
      content: { pieces: cBy.get(r.username) ?? 0, done: pBy.get(r.username)?.done ?? 0, needed: pBy.get(r.username)?.needed ?? 0 },
    })),
  };
}

export { RELATIONSHIP };
