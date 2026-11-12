// Reads the stock files the owner keeps in Excel. Pure: no database, so it can be tested on its own.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { normSku } from "./sku";

export type CostLine = { orderNo: string; sku: string; name: string; unitRmb: number; paid: number; free: number; rmbPerRm: number; unitRm: number; freightPerPaid: number; totalCostRm: number };
export type CostOrder = { orderNo: string; file: string | null; paid: number; free: number; productRmb: number; productRm: number; freightRm: number };
export type CostingFile = { orders: CostOrder[]; lines: CostLine[]; warnings: string[] };

export type DatesRow = { orderNo: string; file: string | null; purchaseDate: string | null; invoiceRefs: string | null; arrivalDate: string | null; arrivalExact: boolean; arrivalNote: string | null };
export type OpeningFile = { asOf: string; items: { sku: string; closing: number }[]; samples: number; warnings: string[] };
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
  const m = /^(\d+)([A-Za-z]?)$/.exec(orderNo.trim());
  if (!m) return 9999;
  return Number(m[1]) * 10 + (m[2] ? m[2].toUpperCase().charCodeAt(0) - 64 : 0);
}

// ───────── ALOOMA_All_Order_Costing: one sheet, an order summary then one block per order ─────────
export async function parseCosting(buf: Buffer | ArrayBuffer | Uint8Array): Promise<CostingFile> {
  const wb = await open(buf);
  const ws = wb.worksheets[0];
  const warnings: string[] = [];
  const orders: CostOrder[] = [];
  const lines: CostLine[] = [];
  const files = new Map<string, string>();
  let section: "summary" | "detail" | "bysku" = "summary";
  let current: string | null = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const v = rowVals(ws, r, 15);
    const a = text(v[0]);
    if (!a) continue;
    if (/^ORDER DETAIL/i.test(a)) { section = "detail"; continue; }
    if (/^ALL ORDERS BY SKU/i.test(a)) { section = "bysku"; continue; }
    if (section === "bysku") continue;
    const blk = /^ORDER\s+(\S+)\s*\|\s*(.*)$/i.exec(a);
    if (blk) { current = blk[1]; files.set(current, blk[2].trim()); continue; }
    if (section === "summary") {
      if (/^GRAND TOTAL/i.test(a)) continue;
      const paid = num(v[2]);
      if (paid == null || !/^\d+[A-Za-z]?$/.test(a)) continue;
      orders.push({ orderNo: a, file: null, paid, free: num(v[3]) ?? 0, productRmb: num(v[5]) ?? 0, productRm: num(v[7]) ?? 0, freightRm: num(v[11]) ?? 0 });
    } else if (section === "detail" && current) {
      const sku = text(v[2]);
      const paid = num(v[4]);
      if (!sku || paid == null || a === "Order" || /^TOTAL/i.test(a)) continue;
      lines.push({
        orderNo: a,
        sku: normSku(sku),
        name: text(v[1]) ?? sku,
        unitRmb: num(v[3]) ?? 0,
        paid,
        free: num(v[5]) ?? 0,
        rmbPerRm: num(v[8]) ?? 0,
        unitRm: num(v[9]) ?? 0,
        freightPerPaid: num(v[10]) ?? 0,
        totalCostRm: num(v[12]) ?? 0,
      });
    }
  }
  for (const o of orders) o.file = files.get(o.orderNo) ?? null;
  // The order summary and its lines must agree.
  for (const o of orders) {
    const ls = lines.filter((l) => l.orderNo === o.orderNo);
    if (!ls.length) { warnings.push(`Order ${o.orderNo} has no SKU lines.`); continue; }
    const paid = ls.reduce((s, l) => s + l.paid, 0);
    if (paid !== o.paid) warnings.push(`Order ${o.orderNo}: summary says ${o.paid} paid pieces, SKU lines add up to ${paid}.`);
  }
  if (!orders.length) warnings.push("No orders were found. Is this the Order Costing file?");
  return { orders, lines, warnings };
}

// ───────── ALOOMA_Order_Inbound_and_Purchase_Dates ─────────
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "Late Mar 2026 (in stock by 1 Apr)" → 2026-03-25; "Jan 2026" → 2026-01-15. Returns null when no month can be read. */
export function estimateArrival(t: string | null): string | null {
  if (!t) return null;
  const clean = t.replace(/\([^)]*\)/g, " ");
  const found: { m: number; y: number | null }[] = [];
  for (const m of clean.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/gi)) found.push({ m: MONTHS[m[1].toLowerCase()], y: m[2] ? Number(m[2]) : null });
  if (!found.length) return null;
  // A month with no year takes the year of the next month named after it ("Late Jan – Feb 2026").
  for (let i = found.length - 1; i >= 0; i--) if (found[i].y == null) found[i].y = found[i + 1]?.y ?? found[i - 1]?.y ?? null;
  const last = found[found.length - 1];
  if (last.y == null) return null;
  const dayOfMonth = found.length === 1 && /\blate\b/i.test(clean) ? 25 : 15;
  return `${last.y}-${String(last.m).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

export async function parseDates(buf: Buffer | ArrayBuffer | Uint8Array): Promise<{ rows: DatesRow[]; warnings: string[] }> {
  const wb = await open(buf);
  const ws = wb.getWorksheet("Order Inbound Summary") ?? wb.worksheets[0];
  const warnings: string[] = [];
  let head = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) if (text(ws.getRow(r).getCell(1).value) === "Order") { head = r; break; }
  if (!head) return { rows: [], warnings: ["No 'Order' header row was found. Is this the Order Inbound and Purchase Dates file?"] };
  const rows: DatesRow[] = [];
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const v = rowVals(ws, r, 12);
    const o = text(v[0]);
    if (!o || !/^\d+[A-Za-z]?$/.test(o)) continue;
    const exact = day(v[7]);
    const bestText = text(v[10]);
    const est = exact ?? estimateArrival(bestText) ?? estimateArrival(text(v[8]));
    if (!est) warnings.push(`Order ${o}: no arrival date or month could be read.`);
    rows.push({
      orderNo: o,
      file: text(v[1]),
      purchaseDate: day(v[3]),
      invoiceRefs: text(v[5]),
      arrivalDate: est,
      arrivalExact: !!exact,
      arrivalNote: exact ? "Exact day from the warehouse document" : (bestText ?? text(v[8])),
    });
  }
  return { rows, warnings };
}

// ───────── Flexship inventory report (monthly closing stock) ─────────
export async function parseInventoryReport(buf: Buffer | ArrayBuffer | Uint8Array): Promise<OpeningFile> {
  const wb = await open(buf);
  const ws = wb.worksheets[0];
  const warnings: string[] = [];
  let asOf = "";
  const items: { sku: string; closing: number }[] = [];
  let samples = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = rowVals(ws, r, 11);
    const sku = text(v[0]);
    if (!sku) continue;
    const closing = num(v[7]);
    if (!asOf) asOf = text(v[8]) ?? "";
    if (closing == null || closing <= 0) continue;
    if (/SAMPLE/i.test(sku)) { samples += closing; continue; }
    items.push({ sku: normSku(sku), closing });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) { warnings.push("The report's closing date could not be read."); asOf = ""; }
  return { asOf, items, samples, warnings };
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
