// Pure helpers: what period of data was actually uploaded, and which periods may be compared.
// An order file's recorded period (not its earliest order) is the evidence of coverage; a day with no file is NOT a day with zero sales.
import { addDaysISO, daysBetweenISO } from "./time";

export type Span = { start: string; end: string };

/** Every day of [from, to] covered by at least one span. */
export function coveredDays(spans: Span[], from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const s of spans) {
    const a = s.start > from ? s.start : from;
    const b = s.end < to ? s.end : to;
    for (let d = a; d <= b; d = addDaysISO(d, 1)) out.add(d);
  }
  return out;
}

export const intersect = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));

/** Missing stretches inside [start, end] given the covered days. */
export function gapsIn(covered: Set<string>, start: string, end: string): Span[] {
  const gaps: Span[] = [];
  let cur: Span | null = null;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    if (!covered.has(d)) {
      if (cur) cur.end = d;
      else cur = { start: d, end: d };
    } else if (cur) {
      gaps.push(cur);
      cur = null;
    }
  }
  if (cur) gaps.push(cur);
  return gaps;
}

export type Comparable = {
  requested: Span;
  /** The dates actually reported on. Null when no fair comparison is possible. */
  current: (Span & { days: number }) | null;
  previous: (Span & { days: number }) | null;
  shortened: boolean;
  /** Why a comparison is withheld. */
  withheld: string | null;
};

const label = (g: Span) => (g.start === g.end ? g.start : `${g.start} to ${g.end}`);

/**
 * Equal-length periods only, and only where BOTH are completely covered.
 *  • Data ends before the requested end → both periods are shortened to the same length (min `minDays`), or the comparison is withheld.
 *  • Any gap inside either period → withheld (missing uploads are never read as zero sales).
 */
export function comparable(days: number, requestedEnd: string, covered: Set<string>, minDays = 7): Comparable {
  const start = addDaysISO(requestedEnd, -(days - 1));
  const requested = { start, end: requestedEnd };
  const none = (withheld: string): Comparable => ({ requested, current: null, previous: null, shortened: false, withheld });
  let latest: string | null = null;
  for (const d of covered) if (d <= requestedEnd && (!latest || d > latest)) latest = d;
  if (!latest) return none("No order files cover this period.");
  const effEnd = latest < requestedEnd ? latest : requestedEnd;
  const len = daysBetweenISO(start, effEnd) + 1;
  if (len < minDays) return none(`Order data only reaches ${effEnd}, which leaves ${Math.max(0, len)} day(s) of this period – too few to compare.`);
  const current = { start, end: effEnd, days: len };
  const previous = { start: addDaysISO(start, -len), end: addDaysISO(start, -1), days: len };
  const gaps = [...gapsIn(covered, current.start, current.end), ...gapsIn(covered, previous.start, previous.end)];
  if (gaps.length) return { requested, current: null, previous: null, shortened: false, withheld: `Order files are missing for ${gaps.slice(0, 3).map(label).join(", ")}${gaps.length > 3 ? " …" : ""}, so sales cannot be compared fairly.` };
  return { requested, current, previous, shortened: effEnd < requestedEnd, withheld: null };
}
