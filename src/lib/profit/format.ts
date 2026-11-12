const nf2 = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 });

/** RM 1,234.56, or -RM 1,234.56 for a negative number. */
export const rm = (n: number | null | undefined, d = 2): string => (n == null || Number.isNaN(n) ? "–" : `${n < 0 ? "-" : ""}RM ${(d ? nf2 : nf0).format(Math.abs(n))}`);
/** Colour for profit: red when negative, green when positive. */
export const tone = (n: number | null | undefined) => (n == null ? "" : n < 0 ? "text-critical" : n > 0 ? "text-good" : "");
export const MONEY_STATE: Record<string, { label: string; tone: "good" | "brand" | "warn" | "neutral" }> = {
  paid: { label: "Paid", tone: "good" },
  processing: { label: "Settled, Not Paid Yet", tone: "brand" },
  estimate: { label: "Estimate", tone: "warn" },
  none: { label: "No Money Data Yet", tone: "neutral" },
};
