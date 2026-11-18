// Did contacting a creator bring sales? Pure (no database).
// For each recorded contact we compare the creator's sales in the 14 days before with the 14 days from the contact day on,
// and set that against creators nobody contacted, over the same two windows. The difference is the effect of the work.
import { addDaysISO, daysBetweenISO } from "@/lib/time";

export const WINDOW = 14;
export type ContactEvent = { id: number; username: string; day: string; userId: string | null; action: string };
/** Sales (RM) per creator per day. */
export type Daily = Map<string, Map<string, number>>;

export type EventResult = {
  id: number;
  before: number;
  after: number;
  /** Days of the "after" window we can see so far (14 = complete). */
  seen: number;
  complete: boolean;
};

const sum = (m: Map<string, number> | undefined, from: string, to: string) => {
  if (!m) return 0;
  let t = 0;
  for (const [d, v] of m) if (d >= from && d <= to) t += v;
  return t;
};

export function measureEvent(e: ContactEvent, daily: Daily, ref: string): EventResult {
  const m = daily.get(e.username);
  const seen = Math.max(0, Math.min(WINDOW, daysBetweenISO(e.day, ref) + 1));
  return { id: e.id, before: sum(m, addDaysISO(e.day, -WINDOW), addDaysISO(e.day, -1)), after: sum(m, e.day, addDaysISO(e.day, seen - 1)), seen, complete: seen >= WINDOW };
}

export type Group = { events: number; creators: number; before: number; after: number; changePct: number | null };
export type Outcomes = {
  results: Map<number, EventResult>;
  /** Contacts whose 14 days are over, and the creators nobody contacted over the same windows. */
  worked: Group;
  control: { before: number; after: number; changePct: number | null };
  /** Percentage points better (or worse) than the creators nobody contacted; null until there are finished contacts. */
  lift: number | null;
  byAction: { action: string; worked: Group; lift: number | null }[];
};

const pct = (before: number, after: number) => (before > 0 ? ((after - before) / before) * 100 : null);

export function measureOutcomes(events: ContactEvent[], daily: Daily, ref: string): Outcomes {
  const results = new Map<number, EventResult>();
  const contacted = new Set(events.map((e) => e.username));
  // The creators nobody contacted, over the same windows (one total per distinct contact day).
  const days = [...new Set(events.map((e) => e.day))];
  const ctl = new Map<string, { before: number; after: number }>();
  for (const d of days) {
    if (daysBetweenISO(d, ref) + 1 < WINDOW) continue;
    let before = 0, after = 0;
    for (const [u, m] of daily) {
      if (contacted.has(u)) continue;
      const b = sum(m, addDaysISO(d, -WINDOW), addDaysISO(d, -1));
      if (b <= 0) continue; // compare like with like: creators who were selling
      before += b; after += sum(m, d, addDaysISO(d, WINDOW - 1));
    }
    ctl.set(d, { before, after });
  }
  const groups = new Map<string, { n: number; users: Set<string>; before: number; after: number; cb: number; ca: number }>();
  const add = (key: string, e: ContactEvent, r: EventResult) => {
    const g = groups.get(key) ?? { n: 0, users: new Set<string>(), before: 0, after: 0, cb: 0, ca: 0 };
    const c = ctl.get(e.day) ?? { before: 0, after: 0 };
    g.n++; g.users.add(e.username); g.before += r.before; g.after += r.after; g.cb += c.before; g.ca += c.after;
    groups.set(key, g);
  };
  for (const e of events) {
    const r = measureEvent(e, daily, ref);
    results.set(e.id, r);
    // Only creators who were selling before count: a creator with no earlier sales has nothing to compare with.
    if (r.complete && r.before > 0) { add("*", e, r); add(e.action, e, r); }
  }
  const out = (g: { n: number; users: Set<string>; before: number; after: number; cb: number; ca: number } | undefined) => {
    const worked: Group = { events: g?.n ?? 0, creators: g?.users.size ?? 0, before: g?.before ?? 0, after: g?.after ?? 0, changePct: g ? pct(g.before, g.after) : null };
    const cp = g ? pct(g.cb, g.ca) : null;
    return { worked, control: { before: g?.cb ?? 0, after: g?.ca ?? 0, changePct: cp }, lift: worked.changePct != null && cp != null ? worked.changePct - cp : null };
  };
  const all = out(groups.get("*"));
  return {
    results, worked: all.worked, control: all.control, lift: all.lift,
    byAction: [...groups.keys()].filter((k) => k !== "*").sort().map((k) => ({ action: k, ...(({ worked, lift }) => ({ worked, lift }))(out(groups.get(k))) })),
  };
}
