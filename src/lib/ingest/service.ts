import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { detectKind, detectKindFromTabs, KIND_META, REFERENCE_KINDS, SNAPSHOT_KINDS, type Kind } from "./kinds";
import { importFile, type ImportResult } from "./import";
import { guessPeriodFromFilename, isDescriptionRow, parseDMY } from "./parse-utils";
import { readWorkbook, readXlsx, type RawTab } from "./read-xlsx";

const DIR = path.join(tmpdir(), "ams-uploads");
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export type InspectResult = {
  token: string;
  filename: string;
  kind: Kind | null;
  kindLabel: string | null;
  rows: number;
  needsPeriod: boolean;
  suggestedStart: string | null;
  suggestedEnd: string | null;
  periodSource: "filename" | "data" | null;
  existing: { periodStart: string | null; periodEnd: string | null; rowCount: number }[];
  warnings: string[];
  columns: string[];
};

const tokenPath = (token: string) => path.join(DIR, `${token}.xlsx`);

export async function stashUpload(buf: Buffer): Promise<string> {
  await mkdir(DIR, { recursive: true });
  const token = randomUUID();
  await writeFile(tokenPath(token), buf);
  return token;
}

export async function discardUpload(token: string) {
  if (/^[0-9a-f-]{36}$/.test(token)) await rm(tokenPath(token), { force: true });
}

async function refYear(): Promise<number> {
  const rows = await db.execute<{ y: number | null }>(
    sql`select extract(year from max(created_at))::int as y from order_lines`,
  );
  return rows[0]?.y ?? new Date().getFullYear();
}

/** Detects the file type; multi-tab reference workbooks are read in full. */
async function detect(
  path: string,
  sheet: { header: string[]; rows: unknown[] },
): Promise<{ kind: Kind | null; rows: number; tabs: RawTab[] | null }> {
  let kind = detectKind(sheet.header);
  let tabs: RawTab[] | null = null;
  if (!kind || REFERENCE_KINDS.includes(kind)) {
    tabs = await readWorkbook(path);
    kind = kind ?? detectKindFromTabs(tabs);
  }
  const rows = tabs && kind && REFERENCE_KINDS.includes(kind) ? tabs.reduce((a, t) => a + t.rows.length, 0) : sheet.rows.length;
  return { kind, rows, tabs };
}

export async function inspectUpload(token: string, filename: string): Promise<InspectResult> {
  const sheet = await readXlsx(tokenPath(token));
  const found = await detect(tokenPath(token), sheet);
  const kind = found.kind;
  const warnings: string[] = [];
  const base: InspectResult = {
    token,
    filename,
    kind,
    kindLabel: kind ? KIND_META[kind].label : null,
    rows: 0,
    needsPeriod: false,
    suggestedStart: null,
    suggestedEnd: null,
    periodSource: null,
    existing: [],
    warnings,
    columns: sheet.header,
  };
  if (!kind) {
    warnings.push(
      "This file doesn't match any supported TikTok export. Check that you exported the right report and didn't edit the header row.",
    );
    return base;
  }

  if (REFERENCE_KINDS.includes(kind)) {
    base.rows = found.rows;
    return base;
  }
  const rows = sheet.rows.length && isDescriptionRow(sheet.rows[0]) ? sheet.rows.slice(1) : sheet.rows;
  base.rows = rows.length;
  if (!rows.length) warnings.push("The file has a header but no data rows.");

  base.needsPeriod = SNAPSHOT_KINDS.includes(kind);

  if (kind === "affiliate_orders" || kind === "all_orders") {
    // Orders carry their own timestamps – derive the window from the data.
    const iCol = sheet.header.indexOf(kind === "all_orders" ? "Created Time" : "Time Created");
    let min: Date | null = null;
    let max: Date | null = null;
    for (const r of rows) {
      const d = parseDMY(r[iCol]);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    if (min && max) {
      base.suggestedStart = min.toISOString().slice(0, 10);
      base.suggestedEnd = max.toISOString().slice(0, 10);
      base.periodSource = "data";
    }
  } else if (base.needsPeriod) {
    const guess = guessPeriodFromFilename(filename, await refYear());
    if (guess) {
      base.suggestedStart = guess.start;
      base.suggestedEnd = guess.end;
      base.periodSource = "filename";
    } else {
      warnings.push("Couldn't read the date range from the filename – please enter it.");
    }
  }

  if (base.needsPeriod) {
    base.existing = await db
      .select({ periodStart: uploads.periodStart, periodEnd: uploads.periodEnd, rowCount: uploads.rowCount })
      .from(uploads)
      .where(eq(uploads.kind, kind))
      .orderBy(desc(uploads.periodEnd))
      .limit(6);
  }
  return base;
}

export async function commitUpload(args: {
  token: string;
  filename: string;
  kind: Kind;
  periodStart: string | null;
  periodEnd: string | null;
  userId: string | null;
}): Promise<ImportResult> {
  const sheet = await readXlsx(tokenPath(args.token));
  const found = await detect(tokenPath(args.token), sheet);
  if (found.kind !== args.kind) throw new Error("The file no longer matches the selected report type.");
  try {
    return await importFile({
      kind: args.kind,
      filename: args.filename,
      header: sheet.header,
      rows: sheet.rows,
      tabs: found.tabs ?? undefined,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      userId: args.userId,
    });
  } finally {
    await discardUpload(args.token);
  }
}

/** Convenience for scripts: import a file already on disk. */
export async function importFromPath(
  file: string,
  opts: { periodStart?: string | null; periodEnd?: string | null; userId?: string | null } = {},
) {
  const buf = await readFile(file);
  const token = await stashUpload(buf);
  const filename = path.basename(file);
  const info = await inspectUpload(token, filename);
  if (!info.kind) {
    await discardUpload(token);
    throw new Error(`${filename}: not a recognised export`);
  }
  const res = await commitUpload({
    token,
    filename,
    kind: info.kind,
    periodStart: opts.periodStart ?? info.suggestedStart,
    periodEnd: opts.periodEnd ?? info.suggestedEnd,
    userId: opts.userId ?? null,
  });
  return { kind: info.kind, ...res };
}

export async function deleteUploadCascade(id: number) {
  const [u] = await db.select().from(uploads).where(eq(uploads.id, id));
  if (!u) return;
  if (u.kind === "affiliate_orders") await db.execute(sql`delete from order_lines where upload_id = ${id}`);
  if (u.kind === "all_orders") {
    // Sample rows the team has worked on are kept; untouched ones go with their orders.
    await db.execute(sql`delete from samples where upload_id = ${id} and source = 'orders'
      and owner_id is null and note is null and follow_up_at is null and result_override is null and coalesce(creator_match,'') <> 'manual'`);
    await db.execute(sql`delete from shop_order_lines where upload_id = ${id}`);
  }
  if (u.kind === "staff_sheet") {
    await db.execute(sql`delete from samples where source = 'staff_sheet' and upload_id = ${id}`);
  }
  await db.delete(uploads).where(and(eq(uploads.id, id)));
}
