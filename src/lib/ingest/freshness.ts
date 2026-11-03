// Pure rules deciding what an import may do to a line that is already stored.
//
// What the exports give us: no "export generated" time and no "last updated" time per row – only lifecycle timestamps
// (created, paid, shipped, delivered, cancelled, commission paid). A line's freshness stamp (`asof`) is therefore the latest
// of ITS OWN lifecycle timestamps. Upload time is never used: it says when a file was loaded, not how current its contents are.
//
// Guarantee: a line is never replaced by information that is provably older, and information we cannot rank is never
// silently overwritten – it is kept as-is and listed as a conflict for a person to accept or dismiss.
// Limitation: returns and refunds carry no timestamp, so a return that happens after the last stamped event is accepted on the
// strength of being an adverse change that adds information; a REVERSAL (a return that disappears) is treated as a conflict.

export type Version = Record<string, string | number | boolean | null>;

export type Verdict =
  | { kind: "new" }
  | { kind: "identical" }
  | { kind: "apply"; why: string }
  | { kind: "older" }
  | { kind: "conflict"; why: string; changed: string[] };

/** How a change looks, independent of any timestamp. "worse" = new cancellation/return/refund, "better" = one disappeared. */
export type Direction = "worse" | "better" | "neutral";

export function classify(
  stored: { asof: Date | null; v: Version } | undefined,
  incoming: { asof: Date | null; v: Version },
  direction: (stored: Version, incoming: Version) => Direction,
): Verdict {
  if (!stored) return { kind: "new" };
  const changed = Object.keys(incoming.v).filter((k) => stored.v[k] !== incoming.v[k]);
  if (!changed.length) return { kind: "identical" };
  const a = incoming.asof?.getTime() ?? null;
  const b = stored.asof?.getTime() ?? null;
  if (b == null) return { kind: "apply", why: "stored line had no freshness stamp" };
  if (a != null && a > b) return { kind: "apply", why: "newer lifecycle timestamp" };
  if (a != null && a < b) return { kind: "older" };
  // same stamp (or none): freshness cannot be ranked
  const dir = direction(stored.v, incoming.v);
  const onlyFills = changed.every((k) => stored.v[k] == null && incoming.v[k] != null);
  if (onlyFills) return { kind: "apply", why: "adds information that was missing" };
  if (dir === "worse") return { kind: "apply", why: "new cancellation / return / refund (these carry no timestamp)" };
  return {
    kind: "conflict",
    changed,
    why: dir === "better" ? "the file no longer shows a cancellation/return/refund that is stored" : "the same lifecycle timestamp but different values – cannot tell which is newer",
  };
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null);
const n4 = (x: unknown) => (typeof x === "number" ? Math.round(x * 10000) / 10000 : x == null ? null : Number(x));

/** Normalise a row (insert object or stored row) to comparable scalars. */
export function toVersion(row: Record<string, unknown>, fields: readonly string[], numeric: readonly string[], dates: readonly string[]): Version {
  const v: Version = {};
  for (const f of fields) {
    const x = row[f];
    v[f] = dates.includes(f) ? iso(x) : numeric.includes(f) ? n4(x) : x == null ? null : (x as string | boolean);
  }
  return v;
}

export const latest = (...ds: (Date | null | undefined)[]): Date | null => {
  let m: Date | null = null;
  for (const d of ds) if (d && (!m || d > m)) m = d;
  return m;
};

// ── per-export field lists and adverse-change detection ──
export const AFFILIATE_FIELDS = [
  "productId", "price", "paymentAmount", "quantity", "fullyRefunded", "cod", "status", "creator", "contentType", "contentId", "commissionModel",
  "commissionRate", "estCommission", "actualCommission", "estAdsCommission", "actualAdsCommission", "paidAt", "deliveredAt", "commissionPaidAt",
] as const;
export const AFFILIATE_NUM = ["price", "paymentAmount", "quantity", "estCommission", "actualCommission", "estAdsCommission", "actualAdsCommission"] as const;
export const AFFILIATE_DATES = ["paidAt", "deliveredAt", "commissionPaidAt"] as const;

export const SHOP_FIELDS = [
  "status", "substatus", "cancelType", "cancelBy", "cancelReason", "returnQty", "subtotalAfter", "platformDiscount", "sellerDiscount", "orderAmount",
  "refundAmount", "paidAt", "shippedAt", "deliveredAt", "cancelledAt", "shippingProvider", "paymentMethod", "orderChannel", "creator", "buyerUsername",
  "trackingId", "rtsAt", "isSample",
] as const;
export const SHOP_NUM = ["returnQty", "subtotalAfter", "platformDiscount", "sellerDiscount", "orderAmount", "refundAmount"] as const;
export const SHOP_DATES = ["paidAt", "shippedAt", "deliveredAt", "cancelledAt", "rtsAt"] as const;

export function affiliateDirection(s: Version, i: Version): Direction {
  const worse = (i.fullyRefunded === true && s.fullyRefunded !== true) || (i.status === "Ineligible" && s.status !== "Ineligible");
  const better = (s.fullyRefunded === true && i.fullyRefunded !== true) || (s.status === "Ineligible" && i.status !== "Ineligible");
  return worse && !better ? "worse" : better && !worse ? "better" : "neutral";
}

export function shopDirection(s: Version, i: Version): Direction {
  const cancelled = (v: Version) => v.status === "Canceled";
  // the export also fills the returned quantity on CANCELLED lines, so a quantity only means a return when the order was not cancelled
  const returned = (v: Version) => v.cancelType === "Return/Refund" || (Number(v.returnQty ?? 0) > 0 && v.status !== "Canceled") || Number(v.refundAmount ?? 0) > 0;
  const worse = (cancelled(i) && !cancelled(s)) || (returned(i) && !returned(s)) || Number(i.refundAmount ?? 0) > Number(s.refundAmount ?? 0);
  const better = (cancelled(s) && !cancelled(i)) || (returned(s) && !returned(i)) || Number(i.refundAmount ?? 0) < Number(s.refundAmount ?? 0);
  return worse && !better ? "worse" : better && !worse ? "better" : "neutral";
}
