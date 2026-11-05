// Reads the Affiliate Data Management filters from a URL. Pure (no database) so pages, the export and the filter bar agree.
import type { CreatorAction, CreatorStatus } from "@/lib/creators/status";
import type { DirOpts, DirSort } from "./directory";

export const STATUSES: CreatorStatus[] = ["Silent", "Slipping", "Winner", "Rising", "Quiet", "Posted", "Waiting", "New", "Steady", "Paused"];
export const ACTIONS: CreatorAction[] = ["Chase", "Push", "Reward", "Revive", "Coach", "Approach", "Resume", "Wait", "Keep"];
export const SORTS: { key: DirSort; label: string }[] = [
  { key: "gmv", label: "Highest total GMV" },
  { key: "gmv_asc", label: "Lowest total GMV" },
  { key: "linegmv", label: "Highest product GMV" },
  { key: "linegmv_asc", label: "Lowest product GMV" },
  { key: "orders", label: "Most orders" },
  { key: "orders_asc", label: "Fewest orders" },
  { key: "videos_all", label: "Most videos" },
  { key: "videos_all_asc", label: "Fewest videos" },
  { key: "lately", label: "Best lately (28 days)" },
  { key: "attention", label: "Needs attention first" },
  { key: "video", label: "Most videos lately" },
  { key: "stale", label: "Longest without a video" },
  { key: "name", label: "Name A–Z" },
];
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | "" => (allowed.includes(v as T) ? (v as T) : "");

export function parseDirectoryParams(sp: Record<string, string | undefined>): DirOpts {
  return {
    q: (sp.q ?? "").trim(),
    samples: (pick(sp.samples, ["with", "none", "all"]) || "with") as "with" | "none" | "all",
    product: /^\d{5,30}$/.test(sp.product ?? "") ? sp.product : "",
    status: pick(sp.status, STATUSES),
    action: pick(sp.action, [...ACTIONS, "todo"] as const),
    type: pick(sp.type, ["video", "live", "both"] as const),
    wa: pick(sp.wa, ["yes", "no"] as const),
    contact: pick(sp.contact, ["never", "recent", "overdue"] as const),
    sort: (SORTS.find((s) => s.key === sp.sort)?.key ?? "gmv") as DirSort,
    page: Math.max(1, Number(sp.page) || 1),
  };
}
