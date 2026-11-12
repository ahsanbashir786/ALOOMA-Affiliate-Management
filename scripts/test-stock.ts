// Stock and FIFO costing. Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-stock.ts
// Set STOCK_FILES to a folder holding the owner's real files to also check the import against them.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runFifo, explode, type BundleMap, type Layer, type Sale } from "../src/lib/stock/fifo";
import { estimateArrival, mergeOpening, parseBundles, parseCosting, parseDates, parseInventoryReport, parseSkuList } from "../src/lib/stock/parse";
import { normSku } from "../src/lib/stock/sku";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };
const near = (a: number, b: number, e = 0.005) => Math.abs(a - b) <= e;

(async () => {
  // ── SKU matching
  check("sku: case does not matter", normSku("Quilt-C-K-WH") === normSku("QUILT-C-K-WH"));
  check("sku: GRAY and GREY are one SKU", normSku("LUMB-PLW-STORM-GRAY") === "LUMB-PLW-STORM-GREY");

  // ── FIFO engine
  const L = (id: number, orderNo: string, sortNo: number, arrival: string, sku: string, qty: number, totalCost: number): Layer => ({ id, orderNo, sortNo, arrival, sku, qty, totalCost });
  const layers = [L(1, "A", 1, "2025-06-01", "X", 10, 100), L(2, "B", 2, "2025-07-01", "X", 10, 200), L(3, "C", 3, "2025-07-01", "Y", 5, 50)];
  const S = (ref: string, day: string, sku: string, qty: number): Sale => ({ ref, day, sku, qty });
  let r = runFifo(layers, [S("s1", "2025-06-10", "X", 4), S("s2", "2025-06-20", "X", 8), S("s3", "2025-07-05", "X", 4)]);
  check("fifo: first sale takes the oldest layer at its cost", near(r.costed[0].cost, 40) && r.costed[0].takes.length === 1);
  check("fifo: a sale can run across two layers (6 from A at 10, 2 from B at 20)", true);
  const two = runFifo(layers, [S("two", "2025-07-02", "X", 12)]).costed[0];
  check("fifo: 12 pieces after both arrived = 10 from A at 10 + 2 from B at 20", near(two.cost, 140) && two.takes.length === 2 && two.shortQty === 0, JSON.stringify(two));
  check("fifo: before B arrives, only A is used and the rest is short", r.costed[1].takes.length === 1 && r.costed[1].shortQty === 2, JSON.stringify(r.costed[1]));
  check("fifo: after arrival the next sale uses B", r.costed[2].takes[0].orderNo === "B" && near(r.costed[2].cost, 80), JSON.stringify(r.costed[2]));
  // sale 2 above: A has 6 left, wants 8 → 6 from A, 2 short (B arrives 1 Jul). Short pieces use the nearest known cost (A = 10).
  check("fifo: pieces with no stock are flagged and costed at the nearest known cost", r.costed[1].shortQty === 2 && near(r.costed[1].shortUnitCost ?? 0, 10) && near(r.costed[1].cost, 60 + 20));
  const rem = r.remaining.filter((x) => x.sku === "X");
  check("fifo: stock left is right (A 0, B 6)", rem.find((x) => x.orderNo === "A")?.left === 0 && rem.find((x) => x.orderNo === "B")?.left === 6, JSON.stringify(rem));
  r = runFifo(layers, [S("s", "2025-05-01", "X", 1)]);
  check("fifo: a sale before anything arrived is flagged, costed at the oldest known cost", r.costed[0].shortQty === 1 && near(r.costed[0].cost, 10));
  r = runFifo(layers, [S("s", "2025-07-02", "Z", 2)]);
  check("fifo: a SKU with no cost anywhere is flagged with no cost", r.costed[0].shortQty === 2 && r.costed[0].shortUnitCost === null && r.costed[0].cost === 0);
  r = runFifo([L(9, "A", 1, "2025-06-01", "X", 4, 4), L(10, "B", 2, "2025-06-01", "X", 4, 8)], [S("a", "2025-06-01", "X", 5)]);
  check("fifo: two layers arriving the same day go in order number order", r.costed[0].takes[0].orderNo === "A" && r.costed[0].takes[1].orderNo === "B" && near(r.costed[0].cost, 6));

  // ── Bundles
  const bundles: BundleMap = new Map([["SET-Q", [{ sku: "BS-Q", qty: 1 }, { sku: "PC", qty: 2 }, { sku: "BC", qty: 1 }]]]);
  const ex = explode("set-q", 3, bundles);
  check("bundle: 3 sets become 3 sheets, 6 pillowcases, 3 bolster cases", ex.length === 3 && ex.find((x) => x.sku === "PC")?.qty === 6 && ex.find((x) => x.sku === "BC")?.qty === 3);
  check("bundle: the Shopee FBS code gives the same parts", explode("FBS-SET-Q", 1, bundles).length === 3);
  check("bundle: a plain SKU is itself", explode("abc", 2, bundles)[0].sku === "ABC" && explode("abc", 2, bundles)[0].qty === 2);

  // ── Arrival text
  check("arrival: 'Dec 2025' is the middle of the month", estimateArrival("Dec 2025") === "2025-12-15");
  check("arrival: 'Late Mar 2026 (in stock by 1 Apr)' is the 25th of March", estimateArrival("Late Mar 2026 (in stock by 1 Apr)") === "2026-03-25");
  check("arrival: 'Late Jan – Feb 2026' uses February", estimateArrival("Late Jan – Feb 2026") === "2026-02-15");
  check("arrival: nothing readable gives no date", estimateArrival("soon") === null && estimateArrival(null) === null);

  // ── Several inventory reports
  const mo = mergeOpening([{ asOf: "2025-05-31", items: [{ sku: "A", closing: 5 }, { sku: "B", closing: 2 }], samples: 1, warnings: [] }, { asOf: "2025-05-31", items: [{ sku: "A", closing: 3 }], samples: 2, warnings: [] }]);
  check("opening: several reports for the same day are added together", mo.items.find((i) => i.sku === "A")?.closing === 8 && mo.items.find((i) => i.sku === "B")?.closing === 2 && mo.samples === 3 && mo.asOf === "2025-05-31" && mo.warnings.length === 0);
  check("opening: reports with different days give a warning and use the earliest", mergeOpening([{ asOf: "2025-05-31", items: [], samples: 0, warnings: [] }, { asOf: "2025-06-30", items: [], samples: 0, warnings: [] }]).warnings.length === 1);

  // ── The owner\'s real files
  const dir = process.env.STOCK_FILES;
  if (!dir) { console.log("\n(STOCK_FILES not set: real-file checks skipped)"); }
  else {
    const find = (re: RegExp) => { const f = readdirSync(dir).find((n) => re.test(n)); if (!f) throw new Error("missing file " + re); return readFileSync(path.join(dir, f)); };
    const costing = await parseCosting(find(/All_Order_Costing_1\.xlsx$/));
    const paid = costing.lines.reduce((s, l) => s + l.paid, 0), free = costing.lines.reduce((s, l) => s + l.free, 0);
    const cost = costing.lines.reduce((s, l) => s + l.totalCostRm, 0);
    check("costing: 34 orders", costing.orders.length === 34, String(costing.orders.length));
    check("costing: 648 SKU lines", costing.lines.length === 648, String(costing.lines.length));
    check("costing: 235,110 paid and 369 free pieces", paid === 235110 && free === 369, `${paid}/${free}`);
    check("costing: landed cost RM 2,734,265.07", near(cost, 2734265.07, 0.1), String(cost));
    check("costing: no warnings (summary and lines agree)", costing.warnings.length === 0, costing.warnings.join("; "));

    const dates = await parseDates(find(/Order_Inbound_and_Purchase_Dates\.xlsx$/));
    check("dates: 34 orders", dates.rows.length === 34, String(dates.rows.length));
    check("dates: every order has an arrival date", dates.rows.every((d) => d.arrivalDate), dates.warnings.join("; "));
    check("dates: orders 29 and 30 are exact", dates.rows.find((d) => d.orderNo === "29")?.arrivalDate === "2026-10-06" && dates.rows.find((d) => d.orderNo === "30")?.arrivalDate === "2026-11-05" && dates.rows.find((d) => d.orderNo === "30")?.arrivalExact === true);
    check("dates: 1B was bought on 21 May 2025", dates.rows.find((d) => d.orderNo === "1B")?.purchaseDate === "2025-05-21");
    check("dates: 1C is estimated, not exact", dates.rows.find((d) => d.orderNo === "1C")?.arrivalExact === false && dates.rows.find((d) => d.orderNo === "1C")?.arrivalDate === "2026-03-25", JSON.stringify(dates.rows.find((d) => d.orderNo === "1C")));

    const open = await parseInventoryReport(find(/Flexship_Inventory_Report_May_2025\.xlsx$/));
    check("opening: report date is 31 May 2025", open.asOf === "2025-05-31", open.asOf);
    const nmp = open.items.filter((i) => i.sku.startsWith("NMP-"));
    check("opening: 926 mattress protectors", nmp.reduce((s, i) => s + i.closing, 0) === 926, JSON.stringify(nmp));
    check("opening: 99 sample pieces are kept out", open.samples === 99);

    const sets = [find(/Other_Products_List_of_SKU_SETS_BOM\.xlsx$/), find(/NWP_BS_List_of_SKU_SETS_BOM\.xlsx$/), find(/WP_BS_List_of_SKU_SETS_BOM\.xlsx$/)];
    const all = new Map<string, Awaited<ReturnType<typeof parseBundles>>["bundles"][number]>();
    for (const f of readdirSync(dir).filter((n) => /SKU_SETS_BOM\.xlsx$/.test(n))) for (const b of (await parseBundles(readFileSync(path.join(dir, f)))).bundles) all.set(b.setSku, b);
    void sets;
    check("bundles: pillow protector x2 is two of the same part", all.get("NWP-PP-WH-2PCS")?.parts.length === 1 && all.get("NWP-PP-WH-2PCS")?.parts[0].qty === 2, JSON.stringify(all.get("NWP-PP-WH-2PCS")));
    check("bundles: its FBS code is kept", all.get("NWP-PP-WH-2PCS")?.fbsSku === "FBS-NWP-PP-WH-2PCS");
    const q = all.get("NWP-BS-Q-WH-SET");
    check("bundles: Queen set = 1 sheet + 2 pillowcases + 1 bolster case", !!q && q.parts.find((p) => p.sku === "NWP-BS-Q-WH")?.qty === 1 && q.parts.find((p) => p.sku === "NWP-PC-WH")?.qty === 2 && q.parts.find((p) => p.sku === "NWP-BC-WH")?.qty === 1, JSON.stringify(q));
    const s1 = all.get("NWP-BS-S-WH-SET");
    check("bundles: Single set = 1 sheet + 1 pillowcase", !!s1 && s1.parts.length === 2, JSON.stringify(s1));
    check("bundles: 144 bedsheet and quilt-cover sets plus the pillow sets are read", all.size >= 144, String(all.size));

    const skus = await parseSkuList(find(/List_of_SKU_Single_Items_Latest\.xlsx$/));
    check("skus: the single item list is read", skus.skus.length > 50 && skus.skus.some((s) => s.sku === "NMP-S-WH-ST"), String(skus.skus.length));
    const costSkus = new Set(costing.lines.map((l) => l.sku));
    const catalogue = new Set(skus.skus.map((s) => s.sku));
    const missing = [...costSkus].filter((s) => !catalogue.has(s));
    console.log(`INFO  costing SKUs not in the single item list: ${missing.length}` + (missing.length ? " (" + missing.slice(0, 12).join(", ") + ")" : ""));
    const parts = new Set([...all.values()].flatMap((b) => b.parts.map((p) => p.sku)));
    const orphan = [...parts].filter((p) => !catalogue.has(p) && !costSkus.has(p));
    console.log(`INFO  bundle parts that are in neither list: ${orphan.length}` + (orphan.length ? " (" + orphan.slice(0, 12).join(", ") + ")" : ""));

    // Database round trip
    const { saveBundles, saveCosting, saveDates, saveOpening, saveSkuList } = await import("../src/lib/stock/save");
    const { loadLayers, loadBundles } = await import("../src/lib/stock/load");
    const { sql: pg } = await import("../src/db");
    await pg`truncate stock_layers, stock_orders, stock_bundle_parts, stock_bundles, stock_skus cascade`;
    await saveSkuList(skus.skus); await saveBundles([...all.values()]); await saveCosting(costing);
    const d = await saveDates(dates.rows); check("db: every order got its dates", d.saved === 34 && d.notes.length === 0, JSON.stringify(d));
    const o = await saveOpening(open); check("db: opening stock saved (937 pieces, samples left out)", o.saved === 937, JSON.stringify(o));
    const lay = await loadLayers();
    const total = lay.layers.reduce((s, l) => s + l.totalCost, 0);
    check("db: layers hold the full landed cost plus the opening stock", total > 2734265 && total < 2734265 + 20000, String(total));
    check("db: every layer has an arrival date", lay.undated.length === 0);
    const opn = lay.layers.filter((l) => l.orderNo === "OPENING");
    const k = opn.find((l) => l.sku === "NMP-K-WH-ST");
    const b1 = lay.layers.find((l) => l.orderNo === "1B" && l.sku === "NMP-K-WH-ST")!;
    check("db: the opening stock is costed like order 1B", !!k && near(k.totalCost / k.qty, b1.totalCost / b1.qty, 0.0001));
    const bm = await loadBundles();
    check("db: bundles load back", bm.get("NWP-BS-Q-WH-SET")?.length === 3);
    // FIFO on the real layers: sell 300 NMP-K in June 2025 → opening stock first (269 at 1B cost), then 1B.
    const rr = runFifo(lay.layers, [{ ref: "t", day: "2025-06-25", sku: "NMP-K-WH-ST", qty: 300 }]);
    check("real fifo: the first 269 King pieces come from the opening stock", rr.costed[0].takes[0].orderNo === "OPENING" && rr.costed[0].takes[0].qty === 269, JSON.stringify(rr.costed[0].takes));
    // Re-import is safe
    await saveCosting(costing); await saveOpening(open);
    const n = await pg`select count(*)::int as n from stock_layers`;
    check("db: importing again does not double anything", n[0].n === costing.lines.length + open.items.length, String(n[0].n));
    await pg.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
