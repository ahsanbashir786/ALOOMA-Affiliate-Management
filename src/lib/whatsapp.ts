// WhatsApp helpers shared by the Affiliate Data screens and the Execution Plan.

export type MsgLang = "en" | "ms";

/** "6.019602194E10" / 60196021940 / "012-345 6789" → "+60196021940" (null when it cannot be a Malaysian number). */
export function normalisePhone(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  let digits: string;
  if (typeof v === "number" || /^[\d.]+e\+?\d+$/i.test(String(v).trim())) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    digits = BigInt(Math.round(n)).toString();
  } else {
    // Letter O typed instead of zero is a common slip.
    digits = String(v).replace(/[oO]/g, "0").replace(/\D/g, "");
  }
  if (digits.startsWith("0")) digits = "6" + digits;
  else if (/^1\d{8,9}$/.test(digits)) digits = "60" + digits;
  return digits.length >= 10 && digits.length <= 13 ? `+${digits}` : null;
}

/** A wa.me link that opens WhatsApp with the message ready. */
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
