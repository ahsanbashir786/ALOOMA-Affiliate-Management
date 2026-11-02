// SKU catalogue parsing and staff-code normalisation. Pure functions (no DB).
import type { Cell } from "@/lib/ingest/read-xlsx";

export type SkuItem = { sku: string; family: string | null; name: string; isSet: boolean };
export type BomLine = { setSku: string; componentSku: string; qty: number };

const clean = (v: Cell | undefined) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const isSku = (s: string) => /^[A-Za-z0-9][A-Za-z0-9.-]*-[A-Za-z0-9.-]+$/.test(s);

/**
 * Reads the SKU workbooks. Two layouts are supported:
 *  - single items: Product Name | Variation Name | SKU
 *  - bundles (BOM): Set Name | Variation Name | Set SKU | [Alternate Set SKU] | Parent SKU
 *    The set's first component sits on the same row; following rows with only a
 *    component belong to the same set. A component listed twice means qty 2.
 */
export function parseSkuWorkbook(tabs: { name: string; rows: Cell[][] }[]): { items: SkuItem[]; bom: BomLine[] } {
  const items = new Map<string, SkuItem>();
  const bom = new Map<string, BomLine>();

  for (const tab of tabs) {
    const hi = tab.rows.findIndex((r) => r.some((c) => /^(set )?sku$/i.test(clean(c))));
    if (hi < 0) continue;
    const h = tab.rows[hi].map((c) => clean(c).toLowerCase());
    const col = (re: RegExp) => h.findIndex((x) => re.test(x));
    const cFamily = col(/^(product|set) name$/);
    const cName = col(/^variation name$/);
    const cSet = col(/^set sku$/);
    const cAlt = col(/^alternate set sku$/);
    const cPart = col(/^parent sku/);
    const cSku = col(/^sku$/);

    let family: string | null = null;
    let current: string[] = [];
    for (const r of tab.rows.slice(hi + 1)) {
      if (cFamily >= 0 && clean(r[cFamily])) family = clean(r[cFamily]);
      const name = cName >= 0 ? clean(r[cName]) : "";

      if (cSet >= 0) {
        const setSku = clean(r[cSet]);
        if (setSku && isSku(setSku)) {
          current = [setSku];
          const alt = cAlt >= 0 ? clean(r[cAlt]) : "";
          if (alt && isSku(alt)) current.push(alt);
          for (const s of current) items.set(s, { sku: s, family, name: name || s, isSet: true });
        }
        const part = cPart >= 0 ? clean(r[cPart]) : "";
        if (part && isSku(part) && current.length) {
          for (const s of current) {
            const key = `${s}|${part}`;
            const e = bom.get(key);
            if (e) e.qty++;
            else bom.set(key, { setSku: s, componentSku: part, qty: 1 });
          }
        }
      } else if (cSku >= 0) {
        const sku = clean(r[cSku]);
        if (sku && isSku(sku)) items.set(sku, { sku, family, name: name || sku, isSet: false });
      }
    }
  }
  return { items: [...items.values()], bom: [...bom.values()] };
}

// ───────────────────────── Staff short codes → SKU ─────────────────────────

const SIZE: Record<string, string> = { S: "S", SS: "SS", Q: "Q", K: "K", SINGLE: "S", QUEEN: "Q", KING: "K" };

const COLORS: [RegExp, string][] = [
  [/^(C\.?BEIGE|CASHMERE(-?BEIGE)?|BEIGE|BIEGE)$/, "CASHMERE-BEIGE"],
  [/^(I\.?SAND|IV|IVORY(-?SAND)?)$/, "IVORY-SAND"],
  [/^(O\.?MIST|OLIVE(-?MIST)?|OM|OMIST)$/, "OLIVE-MIST"],
  [/^(S\.?GREY|SG|GREY|STORM(-?GREY)?)$/, "STORM-GREY"],
  [/^(S\.?GREEN|GREEN|SEAFOAM(-?GREEN)?)$/, "SEAFOAM-GREEN"],
  [/^GLACIER$/, "GLACIER"],
  [/^(ROSEWOOD|RW)$/, "ROSEWOOD"],
  [/^(WHITE|WH)$/, "WH"],
];

function color(token: string | undefined): string | null {
  if (!token) return null;
  const t = token.toUpperCase().replace(/\s+/g, "").replace(/^[.-]+/, "");
  for (const [re, c] of COLORS) if (re.test(t)) return c;
  return null;
}

const TOWEL_COLORS: Record<string, string> = {
  PETAL: "PETAL", SNOW: "SNOW", VANILA: "VANILLA", VANILLA: "VANILLA", "L.BROWN": "LIGHT-BROWN", BROWN: "LIGHT-BROWN",
  "LIGHT-BROWN": "LIGHT-BROWN", "H.BLUE": "HAZE-BLUE", "HZEBLUE": "HAZE-BLUE", "HAZE-BLUE": "HAZE-BLUE", "HZESNOW": "SNOW",
  SKY: "SKY", BLUSH: "BLUSH", SLATE: "SLATE", MINT: "MINT", SAND: "SAND",
};

/**
 * Turns the short codes the team writes in the staff sheet into catalogue SKUs.
 * Returns null when the code can't be read with confidence (it is kept as written).
 */
export function resolveStaffCode(raw: string): string | null {
  let s = raw.toUpperCase().replace(/\s+/g, "").replace(/^EX/, "");
  if (!s || /^(OK|-|QUEEN|MISSINGDATA|\d+(\.\d+)?|.*NOSAMPLE.*)$/.test(s)) return null;
  s = s.replace(/^QULIT/, "QUILT").replace(/^NWMP/, "NWPMP");

  // Mattress protectors
  let m = s.match(/^(NWP|WP)MP-?(SS|S|Q|K)?/);
  if (m && m[2]) return m[1] === "NWP" ? `NMP-${m[2]}-WH-ST` : `WPMP-${m[2]}-WH-ST`;

  // Quilt comforter
  m = s.match(/^QUILT-?(SS|S|Q|K|SINGLE|QUEEN|KING)$/);
  if (m) return `Quilt-C-${SIZE[m[1]] === "SS" ? "S" : SIZE[m[1]]}-WH`;

  // Pillow protectors
  if (/^W?WPPP(X2)?$/.test(s)) return "WP-PP-WH-2PCS";
  if (/^NWPP?P(X2)?$/.test(s)) return "NWP-PP-WH-2PCS";

  // Pillows
  const pillows: Record<string, string> = {
    "SP-WH": "STD-PLW-WH", "BP-WH": "BOLS-PLW-WH", "LP-WH": "LUMB-PLW-WH", "EP-WH": "ERGONOMIC-PLW-WHITE",
    "EP-WHITE": "ERGONOMIC-PLW-WHITE", "EP-GREY": "ERGONOMIC-PLW-GREY",
  };
  if (pillows[s]) return pillows[s];

  // Towels
  m = s.match(/^(CTN|CF)TWL-(\d{5})-(.+)$/);
  if (m) {
    const c = TOWEL_COLORS[m[3]] ?? m[3];
    return `${m[1] === "CTN" ? "CTN" : "CF"}-TOWEL-${m[2]}-${c}`;
  }

  // Bedsheet / quilt-cover sets: Set-BS-WP-Q-Rosewood, Set-QC-NWP-K-OM, NWP-SET-BS-K
  m = s.match(/^(?:SET-?(BS|QC)-?(NWP|WP)|(NWP|WP)-SET-(BS|QC))-?(SS|S|Q|K)?-?(.*)$/);
  if (m) {
    const kind = m[1] ?? m[4];
    const wp = m[2] ?? m[3];
    const size = m[5];
    if (!size) return null;
    const c = color(m[6]) ?? (m[6] ? null : "WH");
    if (!c) return null;
    if (kind === "BS") return `${wp}-BS-${size}-${c}-SET`;
    const qcColor = c === "WH" ? "WHITE" : c;
    return `QC-${size === "SS" ? "S" : size}-${qcColor}${wp === "WP" ? "-WPSET" : "-SET"}`;
  }

  // Single bedsheet: BS-WP-Q-Glacier
  m = s.match(/^BS-(NWP|WP)-(SS|S|Q|K)-?(.*)$/);
  if (m) {
    const c = color(m[3]) ?? (m[3] ? null : "WH");
    return c ? `${m[1]}-BS-${m[2]}-${c}` : null;
  }

  // Single quilt cover: QC-K-White, QC-NWP-Q-White, QC-Q-Ivory sand
  m = s.match(/^QC-(?:N?WP-)?(S|Q|K)-(.+)$/);
  if (m) {
    const c = color(m[2]);
    return c ? `QC-${m[1]}-${c === "WH" ? "WHITE" : c}` : null;
  }
  return null;
}

/** Size / variant label for grouping in the product view, e.g. "Mattress protector (non-waterproof)". */
export function skuGroup(sku: string | null, family: string | null): string {
  if (family) return family;
  if (!sku) return "Unknown";
  if (/^NMP-/.test(sku)) return "Non Waterproof Mattress Protector";
  if (/^WPMP-/.test(sku)) return "Waterproof Mattress Protector";
  if (/^Quilt-C-/i.test(sku)) return "Quilt Comforter";
  if (/-SET$|-WPSET$|-2PCS$/.test(sku)) return "Sets";
  return sku.split("-").slice(0, 2).join("-");
}
