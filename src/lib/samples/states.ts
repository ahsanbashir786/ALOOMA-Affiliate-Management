// Sample states, verdicts and message templates. Pure (no DB) so screens and server share them.

export const RESULTS = {
  not_posted: { label: "Not posted – chase", tone: "critical" },
  in_window: { label: "Waiting to post", tone: "warn" },
  in_transit: { label: "On the way", tone: "neutral" },
  posted_video: { label: "Posted video", tone: "good" },
  did_live: { label: "Did LIVE", tone: "good" },
  posted_other: { label: "Posted (other product)", tone: "brand" },
  no_creator: { label: "Creator unknown", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} as const;
export type ResultKey = keyof typeof RESULTS;
export const POSTED_RESULTS: ResultKey[] = ["posted_video", "did_live", "posted_other"];

/** What staff see for one sample line, combining the posting check with sales. */
export type LineState = "chase" | "waiting" | "transit" | "posted_no_sales" | "selling" | "cancelled" | "unknown";
export const LINE_STATES: Record<LineState, { label: string; tone: "critical" | "warn" | "neutral" | "brand" | "good" }> = {
  chase: { label: "Not posted – chase", tone: "critical" },
  waiting: { label: "Waiting to post", tone: "warn" },
  transit: { label: "On the way", tone: "neutral" },
  posted_no_sales: { label: "Posted – no orders yet", tone: "brand" },
  selling: { label: "Posted & selling", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  unknown: { label: "Creator unknown", tone: "warn" },
};

export function lineState(result: ResultKey, contentOrders: number): LineState {
  if (result === "cancelled") return "cancelled";
  if (result === "no_creator") return "unknown";
  if (result === "in_transit") return "transit";
  if (result === "in_window") return "waiting";
  if (result === "not_posted") return "chase";
  return contentOrders > 0 ? "selling" : "posted_no_sales";
}

// ───────── creator-level verdict: what should the affiliate manager do next? ─────────

export type SampleVerdict = "chase" | "stop" | "coach" | "more_content" | "more" | "refresh" | "wait" | "ok";

export const VERDICTS: Record<
  SampleVerdict,
  { label: string; short: string; tone: "good" | "critical" | "serious" | "warn" | "neutral" | "brand"; todo: string }
> = {
  chase: { label: "Chase to post", short: "Chase", tone: "serious", todo: "Delivered, nothing posted after the deadline. Send a WhatsApp reminder." },
  coach: { label: "Posted, not selling yet", short: "Coach", tone: "brand", todo: "The video is up but has no orders. Check the video, add a voucher or a stronger hook." },
  more_content: { label: "Performing – ask for more content", short: "More content", tone: "brand", todo: "Their sample content sells but they post little. Ask for more videos." },
  more: { label: "Send more samples", short: "More samples", tone: "good", todo: "Posts and sells. Reward them with another product." },
  refresh: { label: "Old content still selling", short: "Fresh video", tone: "warn", todo: "Newest video is old but still sells. Ask for a fresh video before it fades." },
  stop: { label: "Stop samples", short: "Stop", tone: "critical", todo: "Several samples, nothing posted. Pause new samples until they post." },
  wait: { label: "Waiting", short: "Waiting", tone: "warn", todo: "Samples on the way or still inside the posting window." },
  ok: { label: "No action", short: "OK", tone: "neutral", todo: "Nothing to do right now." },
};

/** Tabs on the tracker, in the order a manager should work them. */
export const QUEUES: SampleVerdict[] = ["chase", "coach", "more_content", "more", "refresh", "stop", "wait", "ok"];

export type MessageInput = {
  username: string;
  products: string;
  verdict: SampleVerdict;
  deliveredLabel: string;
  contentGmv: number;
  videosSince: number;
  posted: number;
  lastVideoLabel: string | null;
};

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;

/** Ready-to-send WhatsApp text for each verdict. */
export function waMessage(m: MessageInput): string {
  const hi = `Hi ${m.username}, `;
  switch (m.verdict) {
    case "chase":
      return `${hi}hope you're well! 😊 Your free sample (${m.products}) was delivered on ${m.deliveredLabel}.\n\nWe'd love to see your video! Could you let us know when you plan to post?\n• Show the product in use in the first few seconds.\n• Tag the product so viewers can tap the yellow basket and buy straight away.\nNeed a brief or any help? Just reply here.`;
    case "stop":
      return `${hi}just checking in on the sample we sent (${m.products}). We'd love to see your video – once it's up, we'll be happy to send more products your way!`;
    case "coach":
      return `${hi}thank you for posting with ${m.products}! 🙌 Let's turn more viewers into buyers:\n• Show the product in use within the first 5 seconds.\n• Say the key benefit and the offer out loud, and tell viewers to tap the yellow basket.\n• Pin a comment with the product name and any voucher.\nWant us to share a brief or a voucher code?`;
    case "more_content":
      return `${hi}your content with ${m.products} is already bringing in ${rm(m.contentGmv)} in sales – thank you! 🎉\n\nTo keep it growing, could you post ${m.videosSince <= 1 ? "2 more videos" : "a new video"} this week? A "part 2" of your best video with a new angle works really well. Need a brief or another sample? Just reply.`;
    case "more":
      return `${hi}thank you for the great content with ${m.products} – it's bringing in ${rm(m.contentGmv)} in sales! 🎉\n\nWe'd like to send you another free sample. Which product or size would you like next? A matching set (bedsheet + pillowcases) works well for a "room makeover" video.`;
    case "refresh":
      return `${hi}your earlier video${m.lastVideoLabel ? ` (${m.lastVideoLabel})` : ""} is still bringing in sales – great job! 🔥\n\nBefore it fades, could you post a fresh video or a sequel? Happy to send a new sample or a brief if that helps.`;
    default:
      return `${hi}thank you for working with us!`;
  }
}

export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
