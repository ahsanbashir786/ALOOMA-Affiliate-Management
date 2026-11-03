import "server-only";
import { sql } from "drizzle-orm";
import { AL, rows } from "@/lib/analytics/sql";
import { daysBetweenISO, fmtDayLabel, todayKL } from "@/lib/time";
import { getCommitments } from "./commitments";
import { getWorkflowStates } from "./events";
import { unansweredAttempts } from "./replay";
import { relationshipOf, type Relationship } from "./relationship";
import { getWorkflowSettings } from "./settings";

export type RelationshipRow = {
  username: string;
  status: Relationship;
  attempts: number;
  contacts: number;
  outstanding: number;
  overdueDays: number | null;
  lastSaleOn: string | null;
  /** The next dated obligation or reminder, in plain words (null when nothing is scheduled). */
  nextLabel: string | null;
  nextOn: string | null;
  overdue: boolean;
};

/**
 * Relationship status of every creator that has any recorded activity (contact, promise, sample, hand-added) – or of the given ones.
 * Pure derivation from records: nothing here is typed in by staff, and nothing is stored.
 */
export async function loadRelationships(usernames?: string[]): Promise<Map<string, RelationshipRow>> {
  if (usernames && !usernames.length) return new Map();
  const today = todayKL();
  const [cfg, states, comms] = await Promise.all([getWorkflowSettings(), getWorkflowStates(usernames), getCommitments(usernames)]);
  const scope = usernames ? sql`and creator in (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})` : sql``;
  const [sales, open, content, manual] = await Promise.all([
    rows<{ creator: string; last: string | null }>(sql`
      select al.creator, to_char(max(al.created_at) filter (where al.valid), 'YYYY-MM-DD') as last from ${AL}
      where al.creator is not null ${usernames ? sql`and al.creator in (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})` : sql``} group by al.creator`),
    rows<{ creator: string }>(sql`select distinct creator from samples where source = 'orders' and creator is not null ${scope}
      and coalesce(result_override, result) in ('in_transit', 'in_window', 'not_posted', 'uncertain')`),
    rows<{ creator: string; at: Date }>(sql`select creator, max(posted_at) as at from content_items where posted_at is not null ${scope} group by creator`),
    rows<{ username: string }>(sql`select username from creators where source = 'manual' ${usernames ? sql`and username in (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})` : sql``}`),
  ]);
  const saleBy = new Map(sales.map((s) => [s.creator, s.last]));
  const openSample = new Set(open.map((o) => o.creator));
  const contentBy = new Map(content.map((c) => [c.creator, new Date(c.at)]));
  const names = new Set<string>([...states.keys(), ...comms.map((c) => c.username), ...openSample, ...manual.map((m) => m.username), ...(usernames ?? [])]);
  const out = new Map<string, RelationshipRow>();
  for (const u of names) {
    const st = states.get(u);
    const outs = comms.filter((c) => c.username === u && c.state !== "fulfilled");
    const overdue = outs.filter((c) => c.dueOn < today).map((c) => daysBetweenISO(c.dueOn, today));
    const attempts = st ? unansweredAttempts(st, contentBy.get(u) ?? null) : 0;
    const contacts = st?.lastContactedAt ? Math.max(1, st.contactTimes.length) : 0; // ever contacted
    const firstOut = [...outs].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
    const nextOpen = st?.open[0];
    const nextOn = firstOut?.dueOn ?? nextOpen?.dueOn ?? null;
    const nextLabel = firstOut
      ? firstOut.dueOn < today ? `Promise ${daysBetweenISO(firstOut.dueOn, today)}d overdue` : `Promise due ${fmtDayLabel(firstOut.dueOn)}`
      : nextOpen ? `${nextOpen.kind === "resume" ? "Resume" : "Follow-up"} ${fmtDayLabel(nextOpen.dueOn)}` : null;
    out.set(u, {
      username: u,
      nextLabel,
      nextOn,
      overdue: !!firstOut && firstOut.dueOn < today,
      status: relationshipOf({
        paused: st?.status === "paused",
        contacts,
        attempts,
        maxUnanswered: cfg.maxUnanswered,
        outstanding: outs.length,
        overdueDays: overdue.length ? Math.max(...overdue) : null,
        stalledOverdueDays: cfg.stalledOverdueDays,
        sampleOpen: openSample.has(u),
        lastSaleOn: saleBy.get(u) ?? null,
        today,
        inactiveDays: cfg.inactiveDays,
      }),
      attempts,
      contacts,
      outstanding: outs.length,
      overdueDays: overdue.length ? Math.max(...overdue) : null,
      lastSaleOn: saleBy.get(u) ?? null,
    });
  }
  return out;
}
