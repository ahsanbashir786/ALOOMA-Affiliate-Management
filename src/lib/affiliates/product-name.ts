// Short, readable listing names, e.g. "Mattress Protector · Non-Waterproof (Exclusive)". Pure (no database).

const clean = (s: string) => s.replace(/…$/, "").replace(/\{[^}]*\}/g, "").replace(/^ALOOMA\s+/i, "").replace(/\s+/g, " ").trim();

/** Turns a long TikTok listing title into a short name that tells listings apart: item, waterproof or not, set or single, exclusive. */
export function listingName(shortName: string | null, fullName?: string | null, fallback?: string | null): string {
  const short = (shortName ?? "").toLowerCase();
  const all = `${shortName ?? ""} ${fullName ?? ""}`.toLowerCase();
  const wp = /non[- ]?waterproof/.test(all) ? "Non-Waterproof" : /waterproof/.test(all) ? "Waterproof" : null;
  const excl = /exclusive/.test(all) ? " (Exclusive)" : "";
  if (/mattress protector/.test(all)) return `Mattress Protector${wp ? ` · ${wp}` : ""}${excl}`;
  if (/pillow protector/.test(all)) return `Pillow Protector${excl}`;
  if (/fitted bedsheet|bedsheet/.test(short)) {
    const w = /non[- ]?waterproof/.test(short) ? "Non-Waterproof" : /waterproof/.test(short) ? "Waterproof" : "Non-Waterproof";
    return `Bedsheet · ${w} (${/^set\b/.test(short) ? "Set" : "Single Item"})${excl}`;
  }
  if (/selimut|blanket|duvet/.test(short)) return "Selimut (Blanket)";
  if (/coral fleece/.test(all)) return "Coral Fleece Towel";
  if (/towel|tuala/.test(short)) return "Cotton Towel";
  if (/bantal|pillow/.test(short)) return "Pillow";
  const base = clean(shortName || fallback || fullName || "Sample");
  return base.length > 40 ? `${base.slice(0, 38).trim()}…` : base;
}
