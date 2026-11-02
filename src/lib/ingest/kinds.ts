export const KINDS = [
  "affiliate_orders",
  "all_orders",
  "creator_list",
  "creator_transactions",
  "video_list",
  "sample_analysis",
  "product_list",
  "sku_catalog",
  "staff_sheet",
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_META: Record<
  Kind,
  { label: string; description: string; transactional: boolean; where: string }
> = {
  affiliate_orders: {
    label: "Affiliate orders",
    description: "Order lines with creator, content type and commission. The most detailed source – updated in place.",
    transactional: true,
    where: "Seller Center → Orders → Affiliate orders → Export",
  },
  all_orders: {
    label: "All shop orders",
    description:
      "Every order across channels – status, cancellations, discounts, payment, delivery, state. Shows the affiliate share and what's happening outside affiliate.",
    transactional: true,
    where: "Seller Center → Orders → Export orders",
  },
  creator_list: {
    label: "Creator list",
    description: "Every creator with GMV by source, followers and collaboration split.",
    transactional: false,
    where: "Affiliate Center → Creator analysis → Creator list",
  },
  creator_transactions: {
    label: "Transaction analysis",
    description: "Per-creator performance, videos/LIVEs posted, impressions, views and commission.",
    transactional: false,
    where: "Affiliate Center → Transaction analysis → Creators",
  },
  video_list: {
    label: "Video analysis",
    description: "Per-video GMV, views, clicks, CTR, GPM and engagement.",
    transactional: false,
    where: "Affiliate Center → Video analysis → Video list",
  },
  sample_analysis: {
    label: "Sample analysis",
    description: "Samples requested/shipped, posting rate and 45/90-day ROI per creator.",
    transactional: false,
    where: "Affiliate Center → Sample analysis → Creator list",
  },
  product_list: {
    label: "Product list",
    description: "Catalogue-level GMV, items sold, creators and refunds per product.",
    transactional: false,
    where: "Affiliate Center → Products → List products",
  },
  sku_catalog: {
    label: "SKU list / bundles",
    description:
      "Your own SKU master: single items and what each bundle (SET) contains. Lets samples and sales be counted per item. Upload each SKU workbook once and again when it changes.",
    transactional: false,
    where: "Your internal SKU / BOM workbooks",
  },
  staff_sheet: {
    label: "Staff affiliate sheet",
    description:
      "The team's own sheet – used only for WhatsApp numbers (plus notes and LIVE/video approach). Samples themselves come from the All orders export.",
    transactional: false,
    where: "Your internal Google Sheet / Excel (download as .xlsx)",
  },
};

/** Kinds whose period is optional (they are reference data, not dated reports). */
export const REFERENCE_KINDS: Kind[] = ["sku_catalog", "staff_sheet"];

/** Which kinds are stored as dated snapshots (so a period is required). */
export const SNAPSHOT_KINDS: Kind[] = [
  "creator_list",
  "creator_transactions",
  "video_list",
  "sample_analysis",
  "product_list",
];

export function detectKind(header: string[]): Kind | null {
  const h = new Set(header.map((x) => x.toLowerCase()));
  const has = (...cols: string[]) => cols.every((c) => h.has(c.toLowerCase()));
  if (has("Order ID", "Creator Username", "Content Type")) return "affiliate_orders";
  if (has("Creator username", "Affiliate GMV")) return "creator_list";
  if (has("Creator name", "Creator-attributed GMV")) return "creator_transactions";
  if (has("Video ID", "Video title")) return "video_list";
  if (has("Creator name", "Samples requested", "45-day ROI")) return "sample_analysis";
  if (has("Product ID", "Product name", "Refunded GMV")) return "product_list";
  if (has("Order ID", "Order Status", "SKU Subtotal After Discount")) return "all_orders";
  if (has("Username", "WhatsApp")) return "staff_sheet";
  if (has("SKU", "Variation Name") || has("Set SKU", "Variation Name")) return "sku_catalog";
  return null;
}

/** For workbooks whose first tab has a title row above the header (e.g. the bundle lists). */
export function detectKindFromTabs(tabs: { rows: (string | number | null)[][] }[]): Kind | null {
  for (const t of tabs) {
    for (const r of t.rows.slice(0, 5)) {
      const k = detectKind(r.map((c) => (c == null ? "" : String(c).trim())));
      if (k) return k;
    }
  }
  return null;
}
