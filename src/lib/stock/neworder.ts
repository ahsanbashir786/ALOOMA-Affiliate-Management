// A new stock-in order (order 31 onward): the supplier's order lines plus the freight amount. Pure: no database.
import ExcelJS from "exceljs";
import { normSku } from "./sku";

export type NewLine = { sku: string; paid: number; free: number; unitRmb: number; rmbPerRm: number | null };
export type NewOrderLine = NewLine & { rmbPerRm: number; unitRm: number; freightPerPaid: number; totalCostRm: number };

const num = (v: ExcelJS.CellValue): number | null => {
  const p = v && typeof v === "object" && "result" in (v as object) ? (v as { result: ExcelJS.CellValue }).result : v;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string" && p.trim() !== "" && Number.isFinite(Number(p.replace(/[,¥￥\s]/g, "")))) return Number(p.replace(/[,¥￥\s]/g, ""));
  return null;
};
const str = (v: ExcelJS.CellValue): string => {
  const p = v && typeof v === "object" && "result" in (v as object) ? (v as { result: ExcelJS.CellValue }).result : v;
  return p == null || p instanceof Date || typeof p === "object" ? "" : String(p).trim();
};

export const TEMPLATE_HEADERS = ["SKU", "Paid Qty", "Free Qty", "Unit Price RMB", "RMB Per RM (Optional)"];

/**
 * Reads the supplier's order lines. The headers are found by name, so the supplier's own file usually works:
 * a column called SKU, one for the paid quantity, one for the unit price in RMB, and optionally free quantity and an exchange rate.
 */
export async function parseOrderLines(buf: Buffer | ArrayBuffer | Uint8Array): Promise<{ lines: NewLine[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const warnings: string[] = [];
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 25); r++) {
      const heads = Array.from({ length: Math.min(ws.columnCount, 30) }, (_, i) => str(ws.getRow(r).getCell(i + 1).value).toLowerCase());
      const idx = (re: RegExp, not?: RegExp) => heads.findIndex((h) => re.test(h) && !(not && not.test(h)));
      const sku = idx(/^(seller\s*)?sku\b|item\s*code|product\s*code|^sku/);
      if (sku < 0) continue;
      const paid = idx(/paid|^qty|quantity|pcs|pieces|^units?$|order\s*qty/, /free|total/);
      const free = idx(/free|bonus|extra/);
      const price = idx(/unit.*(price|rmb|cny)|price.*(rmb|cny|unit)|^price|rmb|cny|¥/, /per\s*rm|rate|total|amount/);
      const rate = idx(/rmb\s*per\s*rm|exchange|\brate\b/);
      if (paid < 0 || price < 0) continue;
      const lines: NewLine[] = [];
      for (let k = r + 1; k <= ws.rowCount; k++) {
        const row = ws.getRow(k);
        const s = normSku(str(row.getCell(sku + 1).value));
        const p = num(row.getCell(paid + 1).value);
        const pr = num(row.getCell(price + 1).value);
        if (!s || /^TOTAL/.test(s)) continue;
        if (p == null && pr == null) continue;
        if (p == null || p < 0 || pr == null || pr < 0) { warnings.push(`Row ${k} (${s}): the quantity or price is missing, so it was skipped.`); continue; }
        lines.push({ sku: s, paid: Math.round(p), free: free >= 0 ? Math.round(num(row.getCell(free + 1).value) ?? 0) : 0, unitRmb: pr, rmbPerRm: rate >= 0 ? num(row.getCell(rate + 1).value) : null });
      }
      if (lines.length) return { lines, warnings };
    }
  }
  return { lines: [], warnings: ["No order lines were found. The file needs a header row with these columns: SKU, Paid Qty, Unit Price RMB (Free Qty and RMB Per RM are optional)."] };
}

/** Cost per piece: the unit price in RM plus the freight, shared over the paid pieces only. Free pieces cost nothing. */
export function priceOrder(lines: NewLine[], rmbPerRm: number, freightRm: number): { lines: NewOrderLine[]; paid: number; free: number; productRmb: number; productRm: number; freightPerPaid: number; landed: number } {
  const paid = lines.reduce((s, l) => s + l.paid, 0);
  const freightPerPaid = paid > 0 ? freightRm / paid : 0;
  let productRmb = 0, productRm = 0, landed = 0;
  const out = lines.map((l) => {
    const rate = l.rmbPerRm && l.rmbPerRm > 0 ? l.rmbPerRm : rmbPerRm;
    const unitRm = l.unitRmb / rate;
    const total = l.paid * (unitRm + freightPerPaid);
    productRmb += l.paid * l.unitRmb; productRm += l.paid * unitRm; landed += total;
    return { ...l, rmbPerRm: rate, unitRm, freightPerPaid, totalCostRm: total };
  });
  return { lines: out, paid, free: lines.reduce((s, l) => s + l.free, 0), productRmb, productRm, freightPerPaid, landed };
}

export async function templateWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Order Lines");
  ws.columns = TEMPLATE_HEADERS.map((h) => ({ header: h, width: 24 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(["NMP-Q-WH-ST", 1000, 0, 19.95, ""]);
  ws.addRow(["WPMP-Q-WH-ST", 1000, 10, 23.45, ""]);
  const note = wb.addWorksheet("How To Use");
  note.getColumn(1).width = 110;
  for (const t of ["One row per SKU.", "Paid Qty is what you paid for. Free Qty is extra pieces that cost nothing.", "Unit Price RMB is the supplier's price per piece.", "RMB Per RM is optional. Leave it empty to use the rate you type in the app. Fill it only when one SKU used a different rate.", "You can also upload the supplier's own order file if it has columns named SKU, Paid Qty (or Qty) and Unit Price."]) note.addRow([t]);
  return (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
}
