// TikTok's delivery status of a video (creative) in GMV Max. Pure (safe in client components).

/** Videos TikTok will not boost (its own rule for a creative boost: creative_delivery_status cannot be one of these). */
export const BLOCKED_STATUSES = ["AUTHORIZATION_NEEDED", "EXCLUDED", "REJECTED", "UNAVAILABLE"];
export const IDLE_STATUSES = ["NOT_DELIVERYING", "NOT_DELIVERING", "NOT_ACTIVE"];
export const ON_STATUSES = ["DELIVERING", "LEARNING", "IN_QUEUE"];
/** In plain words. (TikTok spells one of them "NOT_DELIVERYING".) */
export const STATUS_LABEL: Record<string, string> = {
  DELIVERING: "Delivering", LEARNING: "Learning", IN_QUEUE: "In queue", NOT_DELIVERYING: "Not delivering", NOT_DELIVERING: "Not delivering", NOT_ACTIVE: "Not active",
  AUTHORIZATION_NEEDED: "Needs authorization", EXCLUDED: "Excluded", REJECTED: "Rejected", UNAVAILABLE: "Unavailable",
};
export type DeliveryFilter = "any" | "idle" | "on";
export const isBlocked = (s: string | null | undefined) => !!s && BLOCKED_STATUSES.includes(s);
