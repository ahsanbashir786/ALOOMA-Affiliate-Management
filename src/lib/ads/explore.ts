// An ESTIMATE of TikTok's Exploration status, because TikTok's API does not send it.
// Learned from the Seller Center export of 12 Nov 2026 (15,418 rows with TikTok's own labels next to the numbers). Pure (safe in client components).
//
// What the export showed:
//  - Underperforming is mostly "TikTok barely showed it": the typical video had RM 0.59 of spend, 50 impressions and no orders.
//  - Performing is about how much delivery it got and its ROI compared with its campaign. 20% of Performing videos have no order at all.
//  - Outstanding is the top ~4% of sales inside a campaign (a ranking, so it can only be approximated).
//  - Authorization needed was 76% of all rows: TikTok cannot use those videos until the creator authorizes them.

export type EstKey = "outstanding" | "performing" | "underperforming" | "exploring" | "unused" | "locked" | "unavailable";

export const EST: Record<EstKey, { label: string; tone: "good" | "brand" | "warn" | "critical" | "muted"; about: string }> = {
  outstanding: { label: "Outstanding", tone: "good", about: "Among the top sellers of its campaign, with good ROI." },
  performing: { label: "Performing", tone: "brand", about: "Got real delivery and its ROI is fine against its campaign." },
  underperforming: { label: "Underperforming", tone: "warn", about: "Mostly means TikTok gave it almost no delivery. Not proof that the video is bad." },
  exploring: { label: "Exploring", tone: "brand", about: "TikTok is still testing it." },
  unused: { label: "Never Used", tone: "muted", about: "GMV Max never spent on it." },
  locked: { label: "Authorization Needed", tone: "critical", about: "TikTok cannot use it until the creator authorizes it. This one comes from TikTok itself." },
  unavailable: { label: "Unavailable", tone: "muted", about: "TikTok marks it Unavailable, Excluded or Rejected. This one comes from TikTok itself." },
};

/** How close the estimate is to TikTok's real label, measured on the export above (Explored videos only). */
export const EST_ACCURACY = { match: 0.77, rows: 1455, source: "Seller Center export of 12 Nov 2026", outstandingFound: 0.56, outstandingRight: 0.39 };
export const EST_NOTE = "Estimated from spend, orders and ROI. It matches TikTok's own label on about 3 of 4 videos (checked on your 12 Nov 2026 export). TikTok's API does not send the real one.";

export type EstFacts = {
  /** All-time ad spend and orders. */ cost: number; orders: number; roi: number | null;
  /** ROI of the video's main campaign (sales / spend of all its videos). */ campRoi: number | null;
  /** Days since it was posted (null = not known). */ ageDays: number | null;
  /** Share (0 to 1) of campaign videos with less sales than this one. */ revPct: number | null;
  /** TikTok's latest delivery status for it. */ status: string | null;
};

export const OUTSTANDING_PCT = 0.95;

export function estimateExploration(f: EstFacts): EstKey {
  if (f.status === "AUTHORIZATION_NEEDED") return "locked";
  if (f.status && ["UNAVAILABLE", "EXCLUDED", "REJECTED"].includes(f.status)) return "unavailable";
  if (f.status === "LEARNING" || f.status === "IN_QUEUE") return "exploring";
  if (!(f.cost > 0)) return "unused";
  if (f.revPct != null && f.revPct >= OUTSTANDING_PCT && (f.roi ?? 0) >= 4 && f.orders >= 1 && f.cost >= 5) return "outstanding";
  const age = f.ageDays ?? 99, rel = f.roi != null && f.campRoi ? f.roi / f.campRoi : 0;
  if (f.cost <= 1.2) {
    if (age <= 7.5) return f.cost > 0.41 ? "performing" : "underperforming";
    return rel > 4.59 ? "performing" : "underperforming";
  }
  if (rel <= 0.41) return age <= 10.5 ? "performing" : "underperforming";
  return "performing";
}
