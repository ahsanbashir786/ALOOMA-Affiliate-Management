// Reads the Creators page filters from a URL. Pure (no database) so the page, the filter bar and the export agree.
import type { DirOpts, DirSort } from "@/lib/workflow/directory";
import { ACTIONS, STATUSES } from "@/lib/workflow/directory-params";
import { TIERS, type Tier } from "./score";
import { addDaysISO, todayKL } from "@/lib/time";

export const PERIODS = [
  { key: "28", label: "28 days", days: 28 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

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

export function parseCreatorParams(sp: Record<string, string | undefined>): DirOpts & { days: PeriodKey } {
  const days = (PERIODS.find((p) => p.key === sp.days)?.key ?? "all") as PeriodKey;
  const p = PERIODS.find((x) => x.key === days)!;
  return {
    source: "synced",
    q: (sp.q ?? "").trim(),
    samples: (pick(sp.samples, ["with", "none", "all"]) || "all") as "with" | "none" | "all",
    product: /^\d{5,30}$/.test(sp.product ?? "") ? sp.product : "",
    status: pick(sp.status, STATUSES),
    action: pick(sp.action, [...ACTIONS, "todo"] as const),
    type: pick(sp.type, ["video", "live", "both"] as const),
    wa: pick(sp.wa, ["yes", "no"] as const),
    contact: pick(sp.contact, ["never", "recent", "overdue"] as const),
    owner: sp.owner === "none" || /^[0-9a-f-]{36}$/.test(sp.owner ?? "") ? sp.owner : "",
    tier: pick(sp.tier, TIERS as readonly Tier[]),
    sort: (ALLOWED_SORTS.has(sp.sort ?? "") ? sp.sort : "gmv") as DirSort,
    page: Math.max(1, Number(sp.page) || 1),
    range: p.days ? { start: addDaysISO(todayKL(), -(p.days - 1)), end: todayKL() } : undefined,
    days,
  };
}
