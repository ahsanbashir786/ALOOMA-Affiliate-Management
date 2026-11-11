// Suggested budgets for a creative boost batch. Pure (safe in client components); no network, no database.
// TikTok's batch budget (Seller Center, "Use batch budget"): 3 videos need at least RM 11 in total, 10 videos RM 35, spent unevenly across the videos.
// Both fit RM 3.50 a video, rounded up. One video on its own needs RM 5.
// We suggest the same low total and split it unevenly, by how well each video has done.

/** Minimum total for a batch: RM 3.50 a video, rounded up (3 videos RM 11, 10 videos RM 35, as TikTok showed). One video on its own: RM 5. TikTok's own minimum always applies on top. */
export const BATCH_MIN_PER_VIDEO = 3.5;
export const SINGLE_MIN = 5;
export const MIN_PER_VIDEO = 1;
const STEP = 0.5;

export const minBatchTotal = (n: number) => (n <= 0 ? 0 : n === 1 ? SINGLE_MIN : Math.ceil(n * BATCH_MIN_PER_VIDEO));

export type BudgetInput = { id: string; roi: number; orders: number };

/** How strongly a video deserves budget: good ROI and proof (orders). */
export const boostWeight = (v: { roi: number; orders: number }) => Math.max(0.01, v.roi) * Math.log(1 + Math.max(0, v.orders));

/**
 * Splits `total` (default: the minimum for this many videos) across the videos: most of it by weight, a little equally so
 * no video gets nothing. Amounts are in steps of RM 0.5, each at least RM 1, and they add up to exactly the total.
 */
export function suggestBudgets(videos: BudgetInput[], total?: number): { total: number; budgets: Record<string, number> } {
  const n = videos.length;
  if (!n) return { total: 0, budgets: {} };
  const sum = Math.max(total ?? 0, minBatchTotal(n), n * MIN_PER_VIDEO);
  const t = Math.round(sum / STEP) * STEP;
  const w = videos.map((v) => boostWeight(v));
  const wsum = w.reduce((a, b) => a + b, 0);
  const raw = videos.map((_, i) => t * (0.3 / n + 0.7 * (w[i] / wsum)));
  // Round down to the step (at least the minimum), then hand the leftover steps to the videos with the biggest remainders.
  const floor = raw.map((x) => Math.max(MIN_PER_VIDEO, Math.floor(x / STEP) * STEP));
  let left = Math.round((t - floor.reduce((a, b) => a + b, 0)) / STEP);
  const order = raw.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) floor[order[k].i] += STEP;
  // If the minimums pushed the sum over the total, take steps back from the largest.
  while (left < 0) { const j = floor.indexOf(Math.max(...floor)); if (floor[j] - STEP < MIN_PER_VIDEO) break; floor[j] -= STEP; left++; }
  return { total: floor.reduce((a, b) => a + b, 0), budgets: Object.fromEntries(videos.map((v, i) => [v.id, floor[i]])) };
}
