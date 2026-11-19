// Is a creator worth inviting or approving? The owner's rules, in plain numbers. Pure (no database).
//   1. Their main categories must include one of ours.   2. Their creator level must be 5 or higher.
// Anything else TikTok tells us only adds "good signs" and a fit score; it never changes who is eligible.

/** The categories ALOOMA wants creators in (names as the owner wrote them; TikTok's own names are matched loosely). */
export const PREFERRED_CATEGORIES = ["Home Supplies", "Textile & Soft Furnishing", "Home Improvement", "Muslim Fashion", "Beauty and Personal Care", "Fashion Accessories"];
export const MIN_LEVEL = 5;

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, "")).join(" ");

export type Category = { id: string; parent_id: string; local_name: string };

/** The top-level TikTok categories that match the owner's names (spelling, plural and "&" differences are ignored). */
export function preferredRootIds(categories: Category[]): { ids: string[]; matched: { id: string; name: string }[]; missing: string[] } {
  const roots = categories.filter((c) => c.parent_id === "0" || c.parent_id === "");
  const matched: { id: string; name: string }[] = [], missing: string[] = [];
  for (const want of PREFERRED_CATEGORIES) {
    const w = norm(want);
    const hit = roots.find((c) => norm(c.local_name) === w) ?? roots.find((c) => norm(c.local_name).includes(w) || w.includes(norm(c.local_name)));
    if (hit) matched.push({ id: hit.id, name: hit.local_name }); else missing.push(want);
  }
  return { ids: matched.map((m) => m.id), matched, missing };
}

/** The top-level category of any category, by walking up. */
export function rootOf(id: string, categories: Category[]): string {
  const by = new Map(categories.map((c) => [c.id, c]));
  let cur = id, guard = 0;
  while (guard++ < 10) { const c = by.get(cur); if (!c || c.parent_id === "0" || c.parent_id === "") return cur; cur = c.parent_id; }
  return cur;
}

export type Profile = {
  level: number | null;
  categoryIds: string[];
  blocked?: boolean | null;
  officialRecommend?: boolean | null;
  risingStar?: boolean | null;
  fastGrowing?: boolean | null;
  pps?: number | null;
  rating?: number | null;
  postRate?: number | null;
  sampleScore?: number | null;
  fulfilmentScore?: number | null;
  hasCollaborated?: boolean | null;
  invited90d?: boolean | null;
};
export type Verdict = {
  status: "eligible" | "not" | "unknown";
  /** Why not, or what we could not see. */
  reasons: string[];
  /** Good signs, in plain words. */
  good: string[];
  /** 0 to 100, for ordering only. Null when there is nothing to judge. */
  fit: number | null;
};

export function evaluate(p: Profile | null, preferred: string[], categories: Category[] = []): Verdict {
  if (!p) return { status: "unknown", reasons: ["Not checked yet"], good: [], fit: null };
  const reasons: string[] = [], unknown: string[] = [], good: string[] = [];
  let bad = false;

  if (p.blocked) { bad = true; reasons.push("Blocked by your shop"); }
  if (p.level == null) unknown.push("TikTok does not show the creator level");
  else if (p.level < MIN_LEVEL) { bad = true; reasons.push(`Level ${p.level}, needs ${MIN_LEVEL} or higher`); } else good.push(`Level ${p.level}`);

  if (!p.categoryIds.length) unknown.push("TikTok does not show the creator's categories");
  else {
    const roots = new Set(p.categoryIds.map((id) => (categories.length ? rootOf(id, categories) : id)));
    if (preferred.some((id) => roots.has(id) || p.categoryIds.includes(id))) good.push("Sells in your categories");
    else if (preferred.length) { bad = true; reasons.push("Main categories are not in your list"); }
    else unknown.push("Your category list could not be loaded from TikTok");
  }

  // Extra signs: ordering only.
  let fit = 50;
  if (p.level != null) fit += Math.min(15, Math.max(0, (p.level - MIN_LEVEL + 1) * 5));
  if (p.officialRecommend) { fit += 10; good.push("Recommended by TikTok"); }
  if (p.risingStar) { fit += 6; good.push("Rising star"); }
  if (p.fastGrowing) { fit += 5; good.push("Fast growing"); }
  if (p.pps != null) { fit += (p.pps - 3) * 4; if (p.pps >= 4) good.push(`Promotion score ${p.pps}`); }
  if (p.rating != null) { fit += (p.rating - 3) * 3; if (p.rating >= 4) good.push(`Shops rate them ${p.rating}`); }
  if (p.postRate != null) { const r = p.postRate > 1 ? p.postRate / 100 : p.postRate; fit += (r - 0.5) * 12; if (r >= 0.6) good.push(`Posts after samples (${Math.round(r * 100)}%)`); }
  if (p.sampleScore != null) { fit += (p.sampleScore - 60) / 6; if (p.sampleScore >= 75) good.push(`Sample score ${Math.round(p.sampleScore)}`); }
  if (p.fulfilmentScore != null) fit += (p.fulfilmentScore - 3.5) * 2;
  if (p.invited90d) { fit -= 12; reasons.push("You invited them in the last 90 days"); }
  fit = Math.max(0, Math.min(100, Math.round(fit)));

  const status: Verdict["status"] = bad ? "not" : unknown.length ? "unknown" : "eligible";
  return { status, reasons: bad ? reasons : [...unknown, ...reasons.filter((r) => r.startsWith("You invited"))], good, fit: bad ? Math.min(fit, 40) : fit };
}

export const STATUS_LABEL: Record<Verdict["status"], string> = { eligible: "Eligible", not: "Not Eligible", unknown: "Not Sure" };
