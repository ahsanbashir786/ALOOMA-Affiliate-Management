import ExcelJS from "exceljs";

export type Cell = string | number | null;
export type RawSheet = { header: string[]; rows: Cell[][]; sheetName: string };

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      const t = v.richText.map((r) => r.text).join("").trim();
      return t === "" ? null : t;
    }
    if ("result" in v && v.result != null) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text.trim() || null;
  }
  return null;
}

/**
 * Streams the first worksheet that has data. Everything is returned as a
 * string/number so IDs (19 digits) are never coerced through floats – the
 * TikTok exports store them as text.
 */
export async function readXlsx(path: string): Promise<RawSheet> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  for await (const ws of reader) {
    const sheetName = (ws as unknown as { name?: string }).name ?? "Sheet";
    let header: string[] | null = null;
    const rows: Cell[][] = [];

    // Some exports (e.g. the all-orders list) write one <row> element per cell,
    // repeating the row number. Merge consecutive row elements with the same
    // number so every cell lands in the right row and column.
    let curNo = -1;
    let cur: Cell[] = [];
    const flush = () => {
      if (curNo < 0) return;
      const values = Array.from(cur, (v) => v ?? null);
      curNo = -1;
      cur = [];
      if (values.every((v) => v == null)) return;
      if (!header) {
        header = values.map((v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim()));
      } else {
        rows.push(values);
      }
    };

    for await (const row of ws) {
      if (row.number !== curNo) {
        flush();
        curNo = row.number;
      }
      const vals = row.values as ExcelJS.CellValue[];
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] === undefined) continue;
        const v = cellValue(vals[i]);
        if (v != null) cur[i - 1] = v;
      }
    }
    flush();
    if (header && (rows.length > 0 || (header as string[]).length > 0)) {
      return { header: header as string[], rows, sheetName };
    }
  }
  throw new Error("The workbook has no readable worksheet.");
}
