import { Badge } from "@/components/ui/primitives";

// Kept in sync with RESULTS in lib/samples/service (that module is server-only).
const RESULTS: Record<string, { label: string; tone: "critical" | "warn" | "neutral" | "good" | "brand" }> = {
  not_posted: { label: "Not posted – chase", tone: "critical" },
  in_window: { label: "Waiting to post", tone: "warn" },
  in_transit: { label: "On the way", tone: "neutral" },
  posted_video: { label: "Posted video", tone: "good" },
  did_live: { label: "Did LIVE", tone: "good" },
  posted_other: { label: "Posted, other product", tone: "brand" },
  no_creator: { label: "Creator unknown", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  requested: { label: "Requested", tone: "neutral" },
  history: { label: "From staff sheet", tone: "neutral" },
};

export function ResultBadge({ result, manual }: { result: string; manual?: boolean }) {
  const r = RESULTS[result] ?? { label: result, tone: "neutral" as const };
  return (
    <Badge tone={r.tone}>
      {r.label}
      {manual && <span className="opacity-70">· set by team</span>}
    </Badge>
  );
}

/** wa.me link for a +60… number. */
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
