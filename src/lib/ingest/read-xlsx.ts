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

export type RawTab = { name: string; rows: Cell[][] };

/** Reads one streamed worksheet into rows (blank rows dropped). */
async function readRows(ws: AsyncIterable<ExcelJS.Row>): Promise<Cell[][]> {
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
    if (values.some((v) => v != null)) rows.push(values);
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
  return rows;
}

const openReader = (path: string) =>
  new ExcelJS.stream.xlsx.WorkbookReader(path, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

const sheetName = (ws: unknown) => (ws as { name?: string }).name ?? "Sheet";

/**
 * Loads the whole workbook in memory. Reliable for every file layout; used for
 * the team's own (small) workbooks and as a fallback when streaming finds
 * nothing – ExcelJS's streaming reader can drop rows when a workbook saved by
 * Excel / Google Sheets stores its shared strings after the worksheets.
 */
async function readWorkbookInMemory(path: string): Promise<RawTab[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const tabs: RawTab[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as ExcelJS.CellValue[];
      const out: Cell[] = [];
      for (let i = 1; i < vals.length; i++) out[i - 1] = vals[i] === undefined ? null : cellValue(vals[i]);
      const values = Array.from(out, (v) => v ?? null);
      if (values.some((v) => v != null)) rows.push(values);
    });
    if (rows.length) tabs.push({ name: ws.name, rows });
  });
  return tabs;
}

const toSheet = (tab: RawTab): RawSheet => ({
  header: tab.rows[0].map((v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim())),
  rows: tab.rows.slice(1),
  sheetName: tab.name,
});

/**
 * Streams the first worksheet that has data. Everything is returned as a
 * string/number so IDs (19 digits) are never coerced through floats – the
 * TikTok exports store them as text.
 */
export async function readXlsx(path: string): Promise<RawSheet> {
  try {
    for await (const ws of openReader(path)) {
      const rows = await readRows(ws as unknown as AsyncIterable<ExcelJS.Row>);
      if (rows.length) return toSheet({ name: sheetName(ws), rows });
    }
  } catch {
    // The streaming reader occasionally fails on valid files (seen on a real export); the in-memory reader below is slower but robust.
  }
  const tabs = await readWorkbookInMemory(path);
  if (tabs.length) return toSheet(tabs[0]);
  throw new Error("The workbook has no readable worksheet.");
}

/** Every worksheet with its raw rows (no header split). Used for the team's multi-tab workbooks (SKU lists, staff sheet). */
export async function readWorkbook(path: string): Promise<RawTab[]> {
  return readWorkbookInMemory(path);
}
