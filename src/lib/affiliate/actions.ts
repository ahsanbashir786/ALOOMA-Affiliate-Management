// The Actions queue: one next action per creator, ranked by the sales it could bring. Pure (no database).
// Nothing is stored: the queue is worked out from the same rows as Affiliate Data, so it can never disagree or double count.
import type { DirLine, DirRow } from "@/lib/creators/workflow/directory";
import { NEEDS_ACTION, type CreatorAction } from "@/lib/creators/status";
import { addDaysISO, daysBetweenISO } from "@/lib/time";

export type Lever = "creators" | "content" | "quality";
export const LEVER_LABEL: Record<Lever, string> = { creators: "More Active Creators", content: "More Videos", quality: "Better Videos" };
/** Which lever each action pulls. */
export const ACTION_LEVER: Record<CreatorAction, Lever> = { Push: "content", Reward: "content", Chase: "creators", Revive: "creators", Approach: "creators", Resume: "creators", Coach: "quality", Keep: "content", Wait: "content" };
/** A creator contacted for an action leaves the To Do list for this many days, while we wait to see the result. */
export const WAIT_DAYS = 14;

export type Baseline = {
  /** Share of creators who received a sample and now sell (0–1). */
  sellRate: number;
  /** Their average sales in 28 days (RM). */
  avgSeller28: number;
};

/** What happened in the past, in numbers: how often a sampled creator turns into a seller, and how much they sell. */
export function baselineOf(rows: DirRow[]): Baseline {
  let sampled = 0, sellers = 0, sum = 0;
  for (const r of rows) {
    if (!r.allLines.some((l) => l.sampled)) continue;
    sampled++;
    const g = r.extra?.gmv28 ?? 0;
    if (g > 0) { sellers++; sum += g; }
  }
  return { sellRate: sampled ? sellers / sampled : 0, avgSeller28: sellers ? sum / sellers : 0 };
}

/**
 * The sales (RM, 28 days) an action could bring, from numbers we measured, never a guess about the future:
 *  Push     two more posts at the creator's own sales per post, but no more than what she sells in 28 days
 *  Reward   one more post at her own sales per post
 *  Coach    sold-and-slipping: win back the drop · posted, no sale yet: the usual sampled seller × how often that happens
 *  Revive   slipping: win back the drop · quiet: a typical month when she was active
 *  Chase    the usual sampled seller × how often a sampled creator sells
 *  Approach 0 (new creators are held until the old samples are working)
 */
export function expectedGain(r: DirRow, l: DirLine, b: Baseline): number {
  const per = l.gmv28 / Math.max(1, l.videos28);
  switch (l.action) {
    case "Push": return Math.min(l.gmv28, 2 * per);
    case "Reward": return per;
    case "Coach": return l.status === "Slipping" ? Math.max(0, l.prev28 - l.gmv28) : b.sellRate * b.avgSeller28;
    case "Revive": {
      if (l.status === "Slipping") return Math.max(0, l.prev28 - l.gmv28);
      const first = r.extra?.firstOn, last = r.extra?.lastSaleOn;
      const months = first && last ? Math.max(1, daysBetweenISO(first, last) / 28) : 1;
      return l.gmv > 0 ? l.gmv / months : r.gmvAll / months;
    }
    case "Chase": return b.sellRate * b.avgSeller28;
    default: return 0;
  }
}

export type Item = {
  username: string;
  pid: string | null;
  product: string;
  action: CreatorAction;
  status: DirLine["status"];
  lever: Lever;
  expected: number;
  reason: string;
  /** Days since the sample was sent / last sale, where a date tells us. */
  days: number | null;
  doneOn: string | null;
  /** How many other products also have something to do for this creator. */
  also: number;
  row: DirRow;
  line: DirLine;
};

const sampleDays = (l: DirLine, ref: string) => {
  const d = (l.sampleSkus ?? []).flatMap((s) => s.times.map((t) => t.on)).sort().pop();
  return d ? Math.max(0, daysBetweenISO(d, ref)) : null;
};

/** One item per creator: the line worth the most. Creators with nothing to do are left out. */
export function buildQueue(rows: DirRow[], ref: string, b: Baseline): Item[] {
  const out: Item[] = [];
  for (const r of rows) {
    if (r.paused) continue;
    let best: { l: DirLine; g: number } | null = null, n = 0;
    for (const l of r.lines) {
      if (!NEEDS_ACTION.includes(l.action) || l.action === "Resume") continue;
      n++;
      const g = expectedGain(r, l, b);
      if (!best || g > best.g || (g === best.g && l.gmv > best.l.gmv)) best = { l, g };
    }
    if (!best) continue;
    const l = best.l;
    out.push({
      username: r.username, pid: l.pid, product: l.noSample ? "" : l.name, action: l.action, status: l.status, lever: ACTION_LEVER[l.action], expected: best.g, reason: l.reason,
      days: l.status === "Quiet" ? (r.extra?.lastSaleOn ? Math.max(0, daysBetweenISO(r.extra.lastSaleOn, ref)) : null) : sampleDays(l, ref),
      doneOn: l.doneOn, also: n - 1, row: r, line: l,
    });
  }
  return out;
}

export type Queue = { todo: Item[]; waiting: Item[]; held: Item[] };

/**
 * Splits the queue. Contacted lately → "waiting for result". New creators (Approach) are held while too many samples have not sold yet.
 * To do is ranked by expected sales; new creators always come last.
 */
export function splitQueue(items: Item[], today: string, guardHigh: boolean): Queue {
  const cut = addDaysISO(today, -WAIT_DAYS);
  const waiting = items.filter((i) => i.doneOn && i.doneOn > cut).sort((a, b) => (b.doneOn ?? "").localeCompare(a.doneOn ?? ""));
  const open = items.filter((i) => !(i.doneOn && i.doneOn > cut));
  const rank = (a: Item, b: Item) => (a.action === "Approach" ? 1 : 0) - (b.action === "Approach" ? 1 : 0) || b.expected - a.expected || (b.days ?? 0) - (a.days ?? 0) || a.username.localeCompare(b.username);
  const sorted = [...open].sort(rank);
  return guardHigh ? { todo: sorted.filter((i) => i.action !== "Approach"), waiting, held: sorted.filter((i) => i.action === "Approach") } : { todo: sorted, waiting, held: [] };
}
