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
