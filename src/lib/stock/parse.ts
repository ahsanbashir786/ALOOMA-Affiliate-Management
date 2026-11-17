// Reads the stock files the owner keeps in Excel (SKU list, bundle lists and the inventory file). Pure: no database, so it can be tested on its own.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { normSku } from "./sku";

/** One delivery of one SKU in one order: that many pieces arrive on that day at that landed cost (RM 0 for free pieces). */
export type InventoryChunk = { orderNo: string; sku: string; receipt: string; chunk: number; arrival: string; qty: number; free: boolean; unitRm: number; unitRmb: number | null; rmbPerRm: number | null; productRm: number; freightRm: number };
export type InventoryOrder = { orderNo: string; firstArrival: string; lastArrival: string; deliveries: number; paid: number; free: number; productRm: number; freightRm: number; landedRm: number };
export type InventoryFile = {
  chunks: InventoryChunk[]; orders: InventoryOrder[];
  /** Free pieces the file lists without a receipt date: they cannot be used by FIFO until they have a date. */
  undatedFree: { orderNo: string; sku: string; qty: number }[];
  /** Pieces the file marks as excluded (for example extra pieces of order 29). */
  excluded: { orderNo: string; sku: string; qty: number; why: string }[];
  names: Map<string, string>; warnings: string[]; pieces: number; freePieces: number; landedRm: number;
};
export type BundleRow = { setSku: string; name: string | null; fbsSku: string | null; parts: { sku: string; qty: number }[] };
export type SkuRow = { sku: string; name: string | null; family: string | null };

type Cell = ExcelJS.CellValue;

const plain = (v: Cell): string | number | boolean | Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return plain(o.result as Cell);
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    return null;
  }
  return v as string | number | boolean;
};
const text = (v: Cell): string | null => {
  const p = plain(v);
  if (p == null || p instanceof Date) return null;
  const t = String(p).trim();
  return t === "" ? null : t;
};
const num = (v: Cell): number | null => {
  const p = plain(v);
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string" && p.trim() !== "" && p.trim() !== "-" && Number.isFinite(Number(p.replace(/,/g, "")))) return Number(p.replace(/,/g, ""));
  return null;
};
const day = (v: Cell): string | null => {
  const p = plain(v);
  if (p instanceof Date) return p.toISOString().slice(0, 10);
  if (typeof p === "string" && /^\d{4}-\d{2}-\d{2}/.test(p)) return p.slice(0, 10);
  return null;
};

/**
 * Some programs write every tag with a prefix (<x:sheet> instead of <sheet>). Excel reads that, the Excel reader library does not.
 * This strips the prefix from the workbook's own XML parts so the file loads the same way.
 */
async function withoutPrefixes(buf: Buffer | ArrayBuffer | Uint8Array): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf as Buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/.+\.xml$/.test(name) || /\/theme\//.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    const prefix = /xmlns:([A-Za-z0-9_]+)="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/.exec(xml)?.[1];
    if (!prefix) continue;
    zip.file(name, xml.replace(new RegExp(`<(/?)${prefix}:`, "g"), "<$1").replace(new RegExp(`xmlns:${prefix}=`), "xmlns="));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function open(buf: Buffer | ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    return wb;
  } catch {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await withoutPrefixes(buf)) as unknown as ExcelJS.Buffer);
    return wb;
  }
}
const rowVals = (ws: ExcelJS.Worksheet, r: number, n = 16): Cell[] => {
  const row = ws.getRow(r);
  const out: Cell[] = [];
  for (let c = 1; c <= n; c++) out.push(row.getCell(c).value);
  return out;
};

/** Order labels sort 1A, 1B, 1C, 2A, 2B, 3A, 3B, 4, 5 ... (oldest first; only used to break ties). */
export function orderSort(orderNo: string): number {
  if (/^[A-Za-z]$/.test(orderNo.trim())) return 0; // order "A" came before order 1A
  const m = /^(\d+)([A-Za-z]?)$/.exec(orderNo.trim());
  if (!m) return 9999;
  return Number(m[1]) * 10 + (m[2] ? m[2].toUpperCase().charCodeAt(0) - 64 : 0);
}

// ───────── ALOOMA Total Inventory Data: every stock-in order, every delivery date, every piece ─────────
/**
 * The one inventory file. Sheet "Inbound Costing" has one row per SKU and order (landed RM per piece) and one column per delivery
 * (the date above the column, the quantity in the cell). Sheet "Free Units by Date" has the free pieces the same way, at RM 0.
 * Every filled cell is one stock layer: that many pieces of that SKU arriving on that day at that cost. FIFO uses them as they are.
 */
export async function parseInventoryFile(buf: Buffer | ArrayBuffer | Uint8Array): Promise<InventoryFile> {
  const wb = await open(buf);
  const warnings: string[] = [];
  const chunks: InventoryChunk[] = [];
  const undatedFree: { orderNo: string; sku: string; qty: number }[] = [];
  const excluded: { orderNo: string; sku: string; qty: number; why: string }[] = [];
  const names = new Map<string, string>();

  const readSheet = (ws: ExcelJS.Worksheet, free: boolean) => {
    // The header row is the one whose third cell says SKU; the dates are in the row above it.
    let head = 0;
    for (let r = 1; r <= 20 && !head; r++) if ((text(ws.getRow(r).getCell(3).value) ?? "").toLowerCase() === "sku") head = r;
    if (!head) { warnings.push(`The sheet "${ws.name}" has no SKU column header, so it was skipped.`); return; }
    const width = Math.max(ws.columnCount, 12);
    const hdr: (string | null)[] = [], dates: (string | null)[] = [];
    for (let c = 1; c <= width; c++) { hdr[c] = text(ws.getRow(head).getCell(c).value); dates[c] = day(ws.getRow(head - 1).getCell(c).value); }
    const firstQty = (hdr.findIndex((h, i) => i > 0 && /landed rm \/ pc/i.test(h ?? ""))) + 1;
    const totalAt = hdr.findIndex((h, i) => i > 0 && /^total pieces$/i.test(h ?? ""));
    if (firstQty <= 1 || totalAt <= 0) { warnings.push(`The sheet "${ws.name}" does not have the delivery columns (Landed RM / pc … Total pieces), so it was skipped.`); return; }
    for (let r = head + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const first = text(row.getCell(1).value) ?? "";
      if (/^grand total/i.test(first)) break;
      const rawSku = text(row.getCell(3).value);
      if (!rawSku) continue;
      const sku = normSku(rawSku);
      const orderNo = (text(row.getCell(4).value) ?? "").toUpperCase();
      if (!orderNo) { warnings.push(`Row ${r} (${sku}) has no order number and was skipped.`); continue; }
      const status = text(row.getCell(5).value) ?? "";
      const unitRmb = num(row.getCell(6).value), rate = num(row.getCell(7).value);
      const productRm = num(row.getCell(8).value) ?? 0, freightRm = num(row.getCell(9).value) ?? 0, landed = num(row.getCell(10).value) ?? 0;
      const label = [first, text(row.getCell(2).value)].filter(Boolean).join(" ");
      if (!names.has(sku) && label) names.set(sku, label);
      let rowQty = 0;
      for (let c = firstQty; c < totalAt; c++) {
        const q = num(row.getCell(c).value);
        if (!q || q <= 0) continue;
        rowQty += q;
        if (free && /exclusion/i.test(status)) { excluded.push({ orderNo, sku, qty: q, why: status }); continue; }
        if (/^undated$/i.test(hdr[c] ?? "")) { undatedFree.push({ orderNo, sku, qty: q }); continue; }
        const arrival = dates[c];
        if (!arrival) { warnings.push(`${sku} in order ${orderNo}: ${q} pieces are in the column "${hdr[c]}" which has no date, so they are not counted.`); continue; }
        chunks.push({ orderNo, sku, receipt: hdr[c] ?? "", chunk: (free ? 1000 : 0) + c, arrival, qty: q, free, unitRm: free ? 0 : landed, unitRmb: free ? null : unitRmb, rmbPerRm: free ? null : rate, productRm: free ? 0 : productRm, freightRm: free ? 0 : freightRm });
      }
      const total = num(row.getCell(totalAt).value);
      if (total != null && Math.abs(total - rowQty) > 0.5) warnings.push(`${sku} in order ${orderNo}: the deliveries add up to ${rowQty} but the file says ${total} pieces.`);
    }
  };

  const bought = wb.worksheets.find((w) => /inbound costing/i.test(w.name)) ?? wb.worksheets[0];
  const freeWs = wb.worksheets.find((w) => /free units/i.test(w.name));
  if (!bought) return { chunks, orders: [], undatedFree, excluded, names, warnings: ["The file has no sheets."], pieces: 0, freePieces: 0, landedRm: 0 };
  readSheet(bought, false);
  if (freeWs && freeWs !== bought) readSheet(freeWs, true);
  else if (!freeWs) warnings.push("The sheet \"Free Units by Date\" is not in the file, so no free pieces were counted.");

  const by = new Map<string, InventoryOrder>();
  for (const c of chunks) {
    const o = by.get(c.orderNo) ?? { orderNo: c.orderNo, firstArrival: c.arrival, lastArrival: c.arrival, deliveries: 0, paid: 0, free: 0, productRm: 0, freightRm: 0, landedRm: 0 };
    if (c.arrival < o.firstArrival) o.firstArrival = c.arrival;
    if (c.arrival > o.lastArrival) o.lastArrival = c.arrival;
    o.deliveries++;
    if (c.free) o.free += c.qty; else { o.paid += c.qty; o.productRm += c.qty * c.productRm; o.freightRm += c.qty * c.freightRm; o.landedRm += c.qty * c.unitRm; }
    by.set(c.orderNo, o);
  }
  const orders = [...by.values()].sort((a, b) => orderSort(a.orderNo) - orderSort(b.orderNo));
  return {
    chunks, orders, undatedFree, excluded, names, warnings,
    pieces: chunks.reduce((s, c) => s + c.qty, 0), freePieces: chunks.filter((c) => c.free).reduce((s, c) => s + c.qty, 0), landedRm: chunks.reduce((s, c) => s + c.qty * c.unitRm, 0),
  };
}

// ───────── Bundle (set) lists ─────────
/** Set rows carry the Set SKU; the parts are in the "Parent SKU" column on that row and the rows under it. A part listed twice counts twice. */
export async function parseBundles(buf: Buffer | ArrayBuffer | Uint8Array): Promise<{ bundles: BundleRow[]; warnings: string[] }> {
  const wb = await open(buf);
  const out = new Map<string, BundleRow>();
  const warnings: string[] = [];
  for (const ws of wb.worksheets) {
    let setCol = -1, partCol = -1, altCol = -1, nameCol = -1, head = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 6); r++) {
      const v = rowVals(ws, r, 8).map(text);
      const si = v.findIndex((x) => /^set sku$/i.test(x ?? ""));
      if (si >= 0) { head = r; setCol = si; partCol = v.findIndex((x) => /parent sku/i.test(x ?? "")); altCol = v.findIndex((x) => /alternate set sku/i.test(x ?? "")); nameCol = v.findIndex((x) => /variation name/i.test(x ?? "")); break; }
    }
    if (!head || partCol < 0) continue;
    let cur: BundleRow | null = null;
    for (let r = head + 1; r <= ws.rowCount; r++) {
      const v = rowVals(ws, r, 8);
      const set = text(v[setCol]);
      const part = text(v[partCol]);
      if (set) {
        const key = normSku(set);
        cur = out.get(key) ?? { setSku: key, name: nameCol >= 0 ? text(v[nameCol]) : null, fbsSku: altCol >= 0 && text(v[altCol]) ? normSku(text(v[altCol])) : null, parts: [] };
        out.set(key, cur);
      }
      if (cur && part) {
        const p = normSku(part);
        const f = cur.parts.find((x) => x.sku === p);
        if (f) f.qty += 1; else cur.parts.push({ sku: p, qty: 1 });
      }
    }
  }
  for (const b of out.values()) if (!b.parts.length) warnings.push(`Bundle ${b.setSku} has no parts.`);
  if (!out.size) warnings.push("No bundles were found. Is this a Set SKU / BOM list?");
  return { bundles: [...out.values()], warnings };
}

// ───────── Single-item SKU list ─────────
export async function parseSkuList(buf: Buffer | ArrayBuffer | Uint8Array): Promise<{ skus: SkuRow[]; warnings: string[] }> {
  const wb = await open(buf);
  const out = new Map<string, SkuRow>();
  for (const ws of wb.worksheets) {
    let head = 0, skuCol = -1, nameCol = -1, prodCol = -1;
    for (let r = 1; r <= Math.min(ws.rowCount, 4); r++) {
      const v = rowVals(ws, r, 8).map(text);
      const i = v.findIndex((x) => /^sku$/i.test(x ?? ""));
      if (i >= 0) { head = r; skuCol = i; nameCol = v.findIndex((x) => /variation name/i.test(x ?? "")); prodCol = v.findIndex((x) => /product name/i.test(x ?? "")); break; }
    }
    if (!head) continue;
    let family: string | null = null;
    for (let r = head + 1; r <= ws.rowCount; r++) {
      const v = rowVals(ws, r, 8);
      if (prodCol >= 0 && text(v[prodCol])) family = text(v[prodCol]);
      const sku = text(v[skuCol]);
      if (!sku) continue;
      out.set(normSku(sku), { sku: normSku(sku), name: nameCol >= 0 ? text(v[nameCol]) : null, family });
    }
  }
  return { skus: [...out.values()], warnings: out.size ? [] : ["No SKUs were found. Is this a SKU list?"] };
}
