// What moved one product's sales, and what to do about it. Pure (no database).
import { explainChange, type Effect } from "./stages";

export type ProductInput = {
  sales: { now: number; prev: number };
  sellers: { now: number; prev: number };
  /** Videos posted that link the product; null when TikTok's video list does not reach that period. */
  videos: { now: number | null; prev: number | null };
};
export type Move = { key: Effect["key"]; label: string; effect: number };
export type ProductVerdict = {
  /** The three levers with how much of the change each explains (null when videos cannot be judged). */
  moves: Move[] | null;
  /** The lever that explains the most of the change. */
  main: Move | null;
  /** Plain words: what happened and what to do. */
  headline: string;
  /** Which Actions list helps: more creators selling, more content, or better content. */
  lever: "creators" | "content" | "quality" | null;
};

/** A change smaller than this share of last period's sales is called steady. */
export const STEADY_BAND = 0.05;
/** Flat sales still get a warning when two levers moved by at least this share of last period's sales in opposite directions. */
export const CANCEL_BAND = 0.25;

const TEXT: Record<Effect["key"], { up: string; down: string; lever: "creators" | "content" | "quality" }> = {
  sellers: { up: "More creators sold it. Keep bringing in creators.", down: "Fewer creators sold it. Wake up the quiet ones and bring in new creators.", lever: "creators" },
  posts: { up: "Creators posted more videos for it.", down: "Fewer videos were posted for it. Ask your creators for more videos.", lever: "content" },
  perPost: { up: "Each video sold more. Find what worked and repeat it.", down: "Each video sells less. Share what works and put ads on the best videos.", lever: "quality" },
};

export function judgeProduct(p: ProductInput): ProductVerdict {
  const change = p.sales.now - p.sales.prev;
  const steady = p.sales.prev > 0 ? Math.abs(change) / p.sales.prev < STEADY_BAND : p.sales.now <= 0;
  const posts = p.videos.now != null && p.videos.prev != null && p.videos.now > 0 && p.videos.prev > 0;
  const ex = posts ? explainChange({ sellers: p.sellers.now, posts: p.videos.now!, sales: p.sales.now }, { sellers: p.sellers.prev, posts: p.videos.prev!, sales: p.sales.prev }) : null;
  const moves: Move[] | null = ex ? ex.effects.map((e) => ({ key: e.key, label: e.label, effect: e.effect })) : null;
  const main = moves ? [...moves].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0] : null;
  if (p.sales.now <= 0 && p.sales.prev <= 0) return { moves, main: null, headline: "No affiliate sales in either period.", lever: "creators" };
  if (steady) {
    // Flat overall can hide two big moves that cancel out: say so.
    if (moves) {
      const up = [...moves].sort((a, b) => b.effect - a.effect)[0], down = [...moves].sort((a, b) => a.effect - b.effect)[0];
      const big = Math.min(up.effect, -down.effect);
      if (p.sales.prev > 0 && big >= p.sales.prev * CANCEL_BAND && up.effect > 0 && down.effect < 0) {
        const rm = (n: number) => `RM ${Math.round(Math.abs(n)).toLocaleString("en-MY")}`;
        return { moves, main: down, headline: `Steady overall, but two things cancelled out: ${up.label} added ${rm(up.effect)} while ${down.label} lost ${rm(down.effect)}. ${TEXT[down.key].down}`, lever: TEXT[down.key].lever };
      }
    }
    return { moves, main, headline: "Steady. Nothing moved much.", lever: null };
  }
  if (!main) {
    // Without the video list we can still say whether creators moved.
    if (p.sellers.prev > 0 && p.sellers.now !== p.sellers.prev) {
      const up = p.sellers.now > p.sellers.prev;
      return { moves, main: null, headline: `${up ? "More" : "Fewer"} creators sold it (${p.sellers.prev} → ${p.sellers.now}). Video counts are not available for these dates.`, lever: change < 0 ? "creators" : null };
    }
    return { moves, main: null, headline: "Video counts are not available for these dates, so the cause cannot be split.", lever: null };
  }
  // Say what drove the change in its own direction: a fall is explained by the lever that lost most, a rise by the one that gained most.
  const driver = [...moves!].sort((a, b) => (change < 0 ? a.effect - b.effect : b.effect - a.effect))[0];
  const t = TEXT[driver.key];
  return { moves, main: driver, headline: change < 0 ? t.down : t.up, lever: change < 0 ? t.lever : null };
}

/** Is this product short of creators compared with the others (so it is a target for new outreach)? */
export function fewCreators(sellers: number, all: number[]): boolean {
  const xs = all.filter((n) => n > 0).sort((a, b) => a - b);
  if (!xs.length) return false;
  const median = xs[Math.floor((xs.length - 1) / 2)];
  return sellers < median * 0.5;
}
