// Segment catalogue – shared by server (classification) and UI (badges, filters).
export type SegmentKey =
  | "star"
  | "underposting"
  | "rising"
  | "new"
  | "steady"
  | "low_conversion"
  | "slipping"
  | "inactive"
  | "sample_no_post"
  | "untapped";

export type SegmentTone = "good" | "brand" | "neutral" | "warn" | "serious" | "critical";

export const SEGMENTS: Record<
  SegmentKey,
  { label: string; short: string; tone: SegmentTone; summary: string; playbook: string }
> = {
  star: {
    label: "Star",
    short: "Star",
    tone: "good",
    summary: "Top seller with a healthy posting rhythm and stable results.",
    playbook: "Protect and reward: exclusive products, early access, higher commission, a direct contact.",
  },
  underposting: {
    label: "Winner, posts too little",
    short: "Under-posting",
    tone: "brand",
    summary: "Sells well but posts less than the target rhythm – the biggest quick win.",
    playbook: "Ask for more shoppable videos per week and point them at their best-converting product.",
  },
  rising: {
    label: "Rising",
    short: "Rising",
    tone: "good",
    summary: "Sales growing fast versus the previous period.",
    playbook: "Back the momentum: samples for new products, a push to keep the cadence up.",
  },
  new: {
    label: "New seller",
    short: "New",
    tone: "brand",
    summary: "First meaningful sales this period.",
    playbook: "Welcome them, share what works for similar creators, and keep them posting.",
  },
  steady: {
    label: "Steady",
    short: "Steady",
    tone: "neutral",
    summary: "Consistent, mid-sized contributor.",
    playbook: "Light-touch nudges: new product launches and a content brief now and then.",
  },
  low_conversion: {
    label: "Views, few sales",
    short: "Low conversion",
    tone: "warn",
    summary: "Gets attention but converts below the typical GMV per 1,000 views.",
    playbook: "Coach the content: product demo, clearer call to action, better product match, offer or voucher.",
  },
  slipping: {
    label: "Slipping",
    short: "Slipping",
    tone: "serious",
    summary: "Sales dropped sharply versus the previous period.",
    playbook: "Reach out early: find the cause (stock, content fatigue, competing brand) and re-energise.",
  },
  inactive: {
    label: "Gone quiet",
    short: "Quiet",
    tone: "critical",
    summary: "Was selling before but had almost no sales this period.",
    playbook: "Re-activation message with a fresh reason to post – new product, sample or campaign.",
  },
  sample_no_post: {
    label: "Sample, no content",
    short: "No content",
    tone: "warn",
    summary: "Received samples but hasn't posted content with them.",
    playbook: "Remind them politely and ask for a posting date; stop sending samples until they post.",
  },
  untapped: {
    label: "Untapped reach",
    short: "Untapped",
    tone: "brand",
    summary: "Large following in your creator pool but no sales yet.",
    playbook: "Invite to a target collaboration with a free sample and a clear product brief.",
  },
};

export const SEGMENT_ORDER: SegmentKey[] = [
  "underposting",
  "slipping",
  "inactive",
  "low_conversion",
  "rising",
  "new",
  "star",
  "steady",
  "sample_no_post",
  "untapped",
];

export type FlagKey = "high_cancel" | "single_product" | "no_live" | "cod_heavy";
export const FLAGS: Record<FlagKey, { label: string; hint: string }> = {
  high_cancel: { label: "High cancellations", hint: "A large share of this creator's orders gets cancelled or returned." },
  single_product: { label: "One product only", hint: "Almost all sales come from a single product." },
  no_live: { label: "No LIVE yet", hint: "Strong video seller who hasn't tried LIVE." },
  cod_heavy: { label: "COD heavy", hint: "Most orders are cash on delivery, which cancel more often." },
};
