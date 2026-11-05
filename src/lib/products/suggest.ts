// A first guess of which of the 13 products a TikTok listing is. Pure (no database). It is only a suggestion: the owner confirms it.
import { EXCLUDED, type ProductKey } from "./catalog";

export type Suggestion = { key: ProductKey | typeof EXCLUDED | null; confidence: "high" | "medium" | "low"; why: string };
/** Lines sold per SKU family (the part of the seller SKU before the first dash, e.g. WPMP, NMP), for evidence only. */
export type Families = Record<string, number>;

const WP_FAM = ["WPMP", "WP"], NWP_FAM = ["NMP", "NWP"];
const sum = (f: Families, names: string[]) => names.reduce((n, k) => n + (f[k] ?? 0), 0);

export function suggestListing(title: string | null, families: Families = {}): Suggestion {
  const t = (title ?? "").toLowerCase();
  if (!t) return { key: null, confidence: "low", why: "No title yet" };
  if (!/looma/.test(t)) return { key: EXCLUDED, confidence: "high", why: "Not an ALOOMA product" };
  const total = Object.values(families).reduce((a, b) => a + b, 0);
  if (/towel|tuala/.test(t)) return /coral|fleece/.test(t) ? { key: "towel_coral", confidence: "high", why: "Coral fleece towel in the title" } : { key: "towel_cotton", confidence: "high", why: "Cotton towel in the title" };
  if (/pillow protector|sarung bantal protector/.test(t)) return { key: "pillow_protectors", confidence: "high", why: "Pillow protector in the title" };
  if (/bedsheet/.test(t) || (/fitted sheet|cadar/.test(t) && !/mattress protector/.test(t))) {
    const set = /\bset\b/.test(t);
    const wp = /waterproof/.test(t) && !/non[- ]?waterproof/.test(t);
    const key = set ? (wp ? "bs_wp_set" : "bs_nwp_set") : wp ? "bs_wp" : "bs_nwp";
    return { key, confidence: "high", why: `${set ? "Set" : "Single item"}, ${wp ? "waterproof" : "no waterproof"} in the title` };
  }
  if (/comforter|duvet|selimut/.test(t)) return { key: "quilt", confidence: "high", why: "Comforter / duvet in the title" };
  if (/mattress protector|pelapik tilam/.test(t)) {
    const exclusive = /exclusive/.test(t);
    const wpLines = sum(families, WP_FAM), nwpLines = sum(families, NWP_FAM);
    const titleWp = /non[- ]?waterproof/.test(t) ? false : /kal+is air|kencing|waterproof/.test(t) ? true : null;
    // What the listing mostly sells is the stronger evidence: titles of both versions share many words.
    let wp: boolean | null = null, why = "";
    if (wpLines + nwpLines >= 20 && Math.max(wpLines, nwpLines) / (wpLines + nwpLines) >= 0.65) {
      wp = wpLines > nwpLines;
      why = `${Math.max(wpLines, nwpLines).toLocaleString("en-MY")} of ${total.toLocaleString("en-MY")} lines are ${wp ? "waterproof (WPMP/WP)" : "non-waterproof (NMP/NWP)"} SKUs`;
    } else if (titleWp !== null) { wp = titleWp; why = "Title wording only (no sales yet)"; }
    if (wp === null) return { key: null, confidence: "low", why: "Cannot tell waterproof or not" };
    const agree = titleWp === null || titleWp === wp;
    return { key: exclusive ? (wp ? "mp_wp_x" : "mp_nwp_x") : wp ? "mp_wp" : "mp_nwp", confidence: agree ? "high" : "medium", why: `${exclusive ? "Exclusive. " : ""}${why}${agree ? "" : " (the title says the opposite)"}` };
  }
  if (/bantal|pillow/.test(t)) return { key: "pillows", confidence: "high", why: "Pillow in the title" };
  return { key: null, confidence: "low", why: "No clear match in the title" };
}

/** The SKU family of a seller SKU: the part before the first dash, upper case. */
export const skuFamily = (sku: string | null | undefined) => (sku ?? "").split("-")[0].toUpperCase();
