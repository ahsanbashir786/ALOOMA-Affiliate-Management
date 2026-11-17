"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { parseBundles, parseInventoryFile, parseSkuList } from "@/lib/stock/parse";
import { removeAppOrder, saveBundles, saveInventoryFile, saveNewOrder, saveSkuList } from "@/lib/stock/save";
import { parseOrderLines, priceOrder } from "@/lib/stock/neworder";
import { clearCosting } from "@/lib/stock/costing";
import { clearProfit } from "@/lib/profit/data";

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
    } else if (kind === "inventory") {
      const file = await parseInventoryFile(bufs[0]);
      if (!file.chunks.length) { out = { kind, ok: false, title: "No stock found in this file", lines: [], notes: file.warnings.length ? file.warnings : ["The file needs the sheet \"Inbound Costing\" with the SKU, Order and delivery columns."] }; }
      else {
        const r = await saveInventoryFile(file);
        const n = (x: number) => x.toLocaleString("en-MY", { maximumFractionDigits: 0 });
        const days = file.chunks.map((c) => c.arrival).sort();
        out = { kind, ok: true, title: "Inventory file saved", lines: [`${r.saved} orders, ${n(file.pieces)} pieces (${n(file.freePieces)} of them free)`, `Deliveries from ${days[0]} to ${days[days.length - 1]}`, `Landed cost RM ${n(file.landedRm)}`], notes: r.notes };
      }
    } else {
      out = { kind, ok: false, title: "Unknown file type", lines: [], notes: [] };
    }
    clearCosting(); clearProfit();
    revalidatePath("/stock");
    return out;
  } catch (e) {
    return { kind, ok: false, title: "The file could not be read", lines: [], notes: [e instanceof Error ? e.message : "Unknown error"] };
  }
}

/** Adds one new stock-in order from the supplier's order lines, the rate and the freight amount. */
export async function addStockOrder(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requirePermission("stock");
  const kind = "new-order";
  const fail = (title: string, notes: string[] = []): ImportState => ({ kind, ok: false, title, lines: [], notes });
  const orderNo = String(form.get("orderNo") ?? "").trim().toUpperCase();
  const rate = Number(String(form.get("rate") ?? "").replace(",", "."));
  const freight = Number(String(form.get("freight") ?? "").replace(/,/g, ""));
  const arrival = String(form.get("arrival") ?? "");
  const purchase = String(form.get("purchase") ?? "") || null;
  const file = form.get("file");
  if (!/^[A-Z0-9-]{1,12}$/.test(orderNo)) return fail("Type an order number, for example 31");
  if (!Number.isFinite(rate) || rate <= 0) return fail("Type the exchange rate (RMB for RM 1, for example 1.65)");
  if (!Number.isFinite(freight) || freight < 0) return fail("Type the freight amount in RM (0 if there is none)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return fail("Choose the day the order arrived in the warehouse");
  if (purchase && !/^\d{4}-\d{2}-\d{2}$/.test(purchase)) return fail("The purchase date is not a date");
  if (!(file instanceof File) || file.size === 0) return fail("Choose the order file");
  if (file.size > MAX_BYTES) return fail("The file is too big (limit 10 MB)");
  if (!/\.xlsx$/i.test(file.name)) return fail("Please use an Excel file that ends with .xlsx");
  try {
    const parsed = await parseOrderLines(Buffer.from(await file.arrayBuffer()));
    if (!parsed.lines.length) return fail("No order lines found", parsed.warnings);
    const priced = priceOrder(parsed.lines, rate, freight);
    if (priced.paid === 0) return fail("Every line has 0 paid pieces", parsed.warnings);
    const r = await saveNewOrder({ orderNo, purchaseDate: purchase, arrivalDate: arrival, file: file.name, freightRm: freight, priced });
    clearCosting(); clearProfit();
    revalidatePath("/stock");
    if (!r.saved) return fail("Order not added", r.notes);
    const money = (n: number) => n.toLocaleString("en-MY", { maximumFractionDigits: 2 });
    return { kind, ok: true, title: `Order ${orderNo} added`, lines: [`${priced.lines.length} SKUs, ${priced.paid.toLocaleString("en-MY")} paid and ${priced.free.toLocaleString("en-MY")} free pieces`, `Product RM ${money(priced.productRm)} + freight RM ${money(freight)} = landed cost RM ${money(priced.landed)}`, `Freight per paid piece RM ${priced.freightPerPaid.toFixed(4)}; average cost per piece RM ${money(priced.landed / (priced.paid + priced.free))}`], notes: [...parsed.warnings, ...r.notes] };
  } catch (e) {
    return fail("The file could not be read", [e instanceof Error ? e.message : "Unknown error"]);
  }
}

export async function removeStockOrder(orderNo: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("stock");
  const ok = await removeAppOrder(orderNo);
  clearCosting(); clearProfit();
  revalidatePath("/stock");
  return ok ? { ok: true } : { ok: false, error: "Only orders added in the app can be removed." };
}
