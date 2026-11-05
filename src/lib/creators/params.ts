// Reads the Creators page filters from a URL. Pure (no database) so the page, the filter bar and the export agree.
import type { DirOpts, DirSort } from "@/lib/creators/workflow/directory";
import { ACTIONS, STATUSES } from "@/lib/creators/workflow/directory-params";
import { TIERS, type Tier } from "./score";
import { isProductKey, UNMAPPED } from "@/lib/products/catalog";
import { addDaysISO, todayKL } from "@/lib/time";

/** Quick choices for the date range (days counted back from today, today included). */
export const RANGE_PRESETS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 1 month", days: 30 },
  { key: "90", label: "Last 3 months", days: 90 },
] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: string | undefined) => !!v && ISO.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;

/** The date range from ?from=&to= (either may be missing; an old ?days=28 link still works). No range = all time. */
export function parseRange(sp: Record<string, string | undefined>): { start: string; end: string } | undefined {
  const today = todayKL();
  const old = Number(sp.days);
  if (!sp.from && !sp.to && [28, 90, 365].includes(old)) return { start: addDaysISO(today, -(old - 1)), end: today };
  let from = validDay(sp.from) ? sp.from! : "";
  let to = validDay(sp.to) ? sp.to! : "";
  if (!from && !to) return undefined;
  if (!to || to > today) to = today;
  if (!from) from = "2020-01-01";
  if (from > to) [from, to] = [to, from];
  return { start: from, end: to };
}

export const CREATOR_SORTS: { key: DirSort; label: string }[] = [
  { key: "gmv", label: "Total GMV" },
  { key: "score", label: "Creator score" },
  { key: "lately", label: "Best lately (28 days)" },
  { key: "followers", label: "Followers" },
  { key: "orders", label: "Orders" },
  { key: "videos_all", label: "Videos" },
  { key: "attention", label: "Needs attention" },
  { key: "recent", label: "Latest sale" },
  { key: "stale", label: "Longest without a video" },
  { key: "name", label: "Name A–Z" },
];
const ALLOWED_SORTS = new Set<string>([...CREATOR_SORTS.map((s) => s.key), "gmv_asc", "linegmv", "linegmv_asc", "orders_asc", "videos_all_asc", "video"]);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | "" => (allowed.includes(v as T) ? (v as T) : "");

export function parseCreatorParams(sp: Record<string, string | undefined>): DirOpts & { from: string; to: string } {
  const range = parseRange(sp);
  return {
    q: (sp.q ?? "").trim(),
    samples: (pick(sp.samples, ["with", "none", "all"]) || "all") as "with" | "none" | "all",
    product: isProductKey(sp.product ?? "") || sp.product === UNMAPPED ? sp.product : "",
    status: pick(sp.status, STATUSES),
    action: pick(sp.action, [...ACTIONS, "todo"] as const),
    type: pick(sp.type, ["video", "live", "both"] as const),
    wa: pick(sp.wa, ["yes", "no"] as const),
    contact: pick(sp.contact, ["contacted", "never", "recent", "overdue"] as const),
    owner: sp.owner === "none" || /^[0-9a-f-]{36}$/.test(sp.owner ?? "") ? sp.owner : "",
    tier: pick(sp.tier, TIERS as readonly Tier[]),
    sort: (ALLOWED_SORTS.has(sp.sort ?? "") ? sp.sort : "gmv") as DirSort,
    page: Math.max(1, Number(sp.page) || 1),
    range,
    from: range?.start ?? "",
    to: range?.end ?? "",
  };
}
