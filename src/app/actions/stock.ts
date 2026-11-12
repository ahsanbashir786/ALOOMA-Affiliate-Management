"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { parseBundles, parseCosting, parseDates, parseInventoryReport, parseSkuList } from "@/lib/stock/parse";
import { saveBundles, saveCosting, saveDates, saveOpening, saveSkuList } from "@/lib/stock/save";

export type ImportState = { kind: string; ok: boolean; title: string; lines: string[]; notes: string[] } | null;

const MAX_BYTES = 10 * 1024 * 1024;

/** One file at a time, one kind of file per card. Nothing is changed if the file cannot be read. */
export async function importStockFile(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requirePermission("stock");
  const kind = String(form.get("kind") ?? "");
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { kind, ok: false, title: "Choose a file first", lines: [], notes: [] };
  if (files.some((f) => f.size > MAX_BYTES)) return { kind, ok: false, title: "A file is too big (limit 10 MB)", lines: [], notes: [] };
  if (files.some((f) => !/\.xlsx$/i.test(f.name))) return { kind, ok: false, title: "Please use Excel files that end with .xlsx", lines: [], notes: [] };
  try {
    const bufs = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    let out: ImportState;
    if (kind === "skus") {
      const all = (await Promise.all(bufs.map(parseSkuList)));
      const skus = all.flatMap((a) => a.skus);
      const r = await saveSkuList(skus);
      out = { kind, ok: skus.length > 0, title: skus.length ? "SKU list saved" : "No SKUs found", lines: [`${r.saved} SKUs`], notes: all.flatMap((a) => a.warnings) };
    } else if (kind === "bundles") {
      const all = await Promise.all(bufs.map(parseBundles));
      const bundles = all.flatMap((a) => a.bundles);
      const r = await saveBundles(bundles);
      out = { kind, ok: bundles.length > 0, title: bundles.length ? "Bundles saved" : "No bundles found", lines: [`${r.saved} bundles, ${bundles.reduce((s, b) => s + b.parts.length, 0)} parts in total`], notes: all.flatMap((a) => a.warnings) };
    } else if (kind === "costing") {
      const file = await parseCosting(bufs[0]);
      if (!file.orders.length) { out = { kind, ok: false, title: "No orders found", lines: [], notes: file.warnings }; }
      else {
        const r = await saveCosting(file);
        const paid = file.lines.reduce((s, l) => s + l.paid, 0), free = file.lines.reduce((s, l) => s + l.free, 0), cost = file.lines.reduce((s, l) => s + l.totalCostRm, 0);
        out = { kind, ok: true, title: "Order costing saved", lines: [`${r.saved} orders, ${file.lines.length} SKU lines`, `${paid.toLocaleString("en-MY")} paid pieces and ${free.toLocaleString("en-MY")} free pieces`, `Landed cost RM ${cost.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`], notes: r.notes };
      }
    } else if (kind === "dates") {
      const file = await parseDates(bufs[0]);
      const r = await saveDates(file.rows);
      out = { kind, ok: r.saved > 0, title: r.saved ? "Dates saved" : "No orders matched", lines: [`${r.saved} orders updated`, `${file.rows.filter((x) => !x.arrivalExact).length} arrival dates are estimates (only the month is known)`], notes: [...file.warnings, ...r.notes] };
    } else if (kind === "opening") {
      const file = await parseInventoryReport(bufs[0]);
      const r = await saveOpening(file);
      out = { kind, ok: r.saved > 0, title: r.saved ? "Opening stock saved" : "Nothing saved", lines: [`${r.saved} pieces in stock on ${file.asOf || "an unknown day"}`, `${file.samples} sample pieces are not counted`], notes: r.notes };
    } else {
      out = { kind, ok: false, title: "Unknown file type", lines: [], notes: [] };
    }
    revalidatePath("/stock");
    return out;
  } catch (e) {
    return { kind, ok: false, title: "The file could not be read", lines: [], notes: [e instanceof Error ? e.message : "Unknown error"] };
  }
}
