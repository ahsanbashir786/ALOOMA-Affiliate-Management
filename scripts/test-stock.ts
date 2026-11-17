process.env.SWR_OFF = "1";
// Stock and FIFO costing. Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-stock.ts
// Set STOCK_FILES to a folder holding the owner's real files to also check the import against them.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runFifo, explode, type BundleMap, type Layer, type Sale } from "../src/lib/stock/fifo";
import ExcelJS from "exceljs";
import { orderSort, parseBundles, parseInventoryFile, parseSkuList } from "../src/lib/stock/parse";
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

  // ── The inventory file (built here, so this part always runs)
  const wb = new ExcelJS.Workbook();
  const head = ["Product name", "Variation", "SKU", "Order", "Price source", "Unit price (RMB)", "RMB per RM", "Product RM / pc", "Freight RM / pc", "Landed RM / pc"];
  const bought = wb.addWorksheet("Inbound Costing");
  for (let i = 1; i <= 6; i++) bought.addRow([i === 1 ? "Flexship inbound costing" : null]);
  bought.addRow([...Array(10).fill(null), new Date(Date.UTC(2025, 1, 8)), new Date(Date.UTC(2025, 2, 24)), null, null]);
  bought.addRow([...head, "PDF #1", "PDF #2", "Total pieces", "Total landed RM"]);
  bought.addRow(["Protector", "Single", "nmp-s-wh-st", "A", "Order price", 14, 1.6, 8, 2, 10, 100, 50, 150, 1500]);
  bought.addRow(["Protector", "Queen", "NMP-Q-WH-ST", "1A", "Order price", 14, 1.6, 8, 2, 12, null, 40, 40, 480]);
  bought.addRow(["Grand total", null, null, null, null, null, null, null, null, null, 100, 90, 190, 1980]);
  const freeWs = wb.addWorksheet("Free Units by Date");
  for (let i = 1; i <= 6; i++) freeWs.addRow([null]);
  freeWs.addRow([...Array(10).fill(null), new Date(Date.UTC(2025, 1, 8)), null, null, null]);
  freeWs.addRow([...head.slice(0, 4), "Status", ...head.slice(5), "PDF #1", "Undated", "Total pieces", "Total landed RM"]);
  freeWs.addRow(["Protector", "Single", "NMP-S-WH-ST", "A", "Free units", 0, null, 0, 0, 0, 5, null, 5, 0]);
  freeWs.addRow(["Protector", "Queen", "NMP-Q-WH-ST", "1A", "Free units", 0, null, 0, 0, 0, null, 3, 3, 0]);
  freeWs.addRow(["Protector", "Queen", "NMP-Q-WH-ST", "29", "Order 29 exclusion", 0, null, 0, 0, 0, 2, null, 2, 0]);
  freeWs.addRow(["Grand total"]);
  const inv = await parseInventoryFile(Buffer.from(await wb.xlsx.writeBuffer()));
  const chunk = (o: string, k: string, d: string) => inv.chunks.find((c) => c.orderNo === o && c.sku === k && c.arrival === d);
  check("inventory: one layer per delivery (A has 100 on 8 Feb and 50 on 24 Mar)", chunk("A", "NMP-S-WH-ST", "2025-02-08")?.qty === 100 && chunk("A", "NMP-S-WH-ST", "2025-03-24")?.qty === 50, JSON.stringify(inv.chunks));
  check("inventory: the cost is the landed RM per piece of the row", chunk("A", "NMP-S-WH-ST", "2025-02-08")?.unitRm === 10 && chunk("1A", "NMP-Q-WH-ST", "2025-03-24")?.unitRm === 12);
  check("inventory: SKUs are matched in capitals", inv.chunks.every((c) => c.sku === c.sku.toUpperCase()));
  check("inventory: free pieces are layers at RM 0 on their delivery date", chunk("A", "NMP-S-WH-ST", "2025-02-08") !== undefined && inv.chunks.some((c) => c.free && c.qty === 5 && c.unitRm === 0 && c.arrival === "2025-02-08"));
  check("inventory: a free paid column and free column of the same day do not collide", new Set(inv.chunks.map((c) => `${c.orderNo}|${c.sku}|${c.chunk}`)).size === inv.chunks.length);
  check("inventory: undated free pieces and excluded pieces are listed, not counted", inv.undatedFree.reduce((n, x) => n + x.qty, 0) === 3 && inv.excluded.reduce((n, x) => n + x.qty, 0) === 2 && inv.pieces === 195, `${inv.pieces}`);
  check("inventory: totals (190 bought + 5 free pieces, landed RM 1,980)", inv.pieces === 195 && inv.freePieces === 5 && near(inv.landedRm, 1980), `${inv.pieces} ${inv.landedRm}`);
  check("inventory: orders know their first and last delivery", inv.orders.find((o) => o.orderNo === "A")?.firstArrival === "2025-02-08" && inv.orders.find((o) => o.orderNo === "A")?.lastArrival === "2025-03-24" && inv.orders.find((o) => o.orderNo === "A")?.deliveries === 3);
  check("inventory: order A sorts before order 1A", orderSort("A") < orderSort("1A") && orderSort("1A") < orderSort("1B") && orderSort("1B") < orderSort("2A"));
  check("inventory: no warnings when every row adds up", inv.warnings.length === 0, inv.warnings.join("; "));
  bought.getRow(9).getCell(13).value = 149;
  const bad = await parseInventoryFile(Buffer.from(await wb.xlsx.writeBuffer()));
  check("inventory: a row whose deliveries do not add up gets a warning", bad.warnings.length === 1 && /149/.test(bad.warnings[0]), bad.warnings.join("; "));
  const noSheet = new ExcelJS.Workbook(); noSheet.addWorksheet("Other").addRow(["x"]);
  check("inventory: a file without the delivery columns reads as empty with a reason", (await parseInventoryFile(Buffer.from(await noSheet.xlsx.writeBuffer()))).chunks.length === 0);

  // ── The owner\'s real files
  const dir = process.env.STOCK_FILES;
  if (!dir) { console.log("\n(STOCK_FILES not set: real-file checks skipped)"); }
  else {
    const find = (re: RegExp) => { const f = readdirSync(dir).find((n) => re.test(n)); if (!f) throw new Error("missing file " + re); return readFileSync(path.join(dir, f)); };
    const inv2 = await parseInventoryFile(find(/Total_Inventory_Data\.xlsx$/));
    check("real inventory: 35 orders", inv2.orders.length === 35, String(inv2.orders.length));
    check("real inventory: 242,307 pieces, 302 of them free", inv2.pieces === 242307 && inv2.freePieces === 302, `${inv2.pieces}/${inv2.freePieces}`);
    check("real inventory: landed cost about RM 2,806,610", near(inv2.landedRm, 2806610, 5), String(inv2.landedRm));
    check("real inventory: 52 undated free pieces and 15 excluded", inv2.undatedFree.reduce((n, x) => n + x.qty, 0) === 52 && inv2.excluded.reduce((n, x) => n + x.qty, 0) === 15);
    check("real inventory: first delivery 8 Feb 2025, last 5 Nov 2026", inv2.chunks.map((c) => c.arrival).sort()[0] === "2025-02-08" && inv2.chunks.map((c) => c.arrival).sort().at(-1) === "2026-11-05");
    check("real inventory: no warnings", inv2.warnings.length === 0, inv2.warnings.join("; "));

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
    const costSkus = new Set(inv2.chunks.map((c) => c.sku));
    const catalogue = new Set(skus.skus.map((x) => x.sku));
    const missing = [...costSkus].filter((x) => !catalogue.has(x));
    console.log(`INFO  inventory SKUs not in the single item list: ${missing.length}` + (missing.length ? " (" + missing.slice(0, 12).join(", ") + ")" : ""));
    const parts = new Set([...all.values()].flatMap((b) => b.parts.map((p) => p.sku)));
    const orphan = [...parts].filter((p) => !catalogue.has(p) && !costSkus.has(p));
    console.log(`INFO  bundle parts that are in neither list: ${orphan.length}` + (orphan.length ? " (" + orphan.slice(0, 12).join(", ") + ")" : ""));

    // Database round trip
    const { saveBundles, saveInventoryFile, saveSkuList } = await import("../src/lib/stock/save");
    const { loadLayers, loadBundles } = await import("../src/lib/stock/load");
    const { sql: pg } = await import("../src/db");
    await pg`truncate stock_layers, stock_orders, stock_bundle_parts, stock_bundles, stock_skus cascade`;
    await saveSkuList(skus.skus); await saveBundles([...all.values()]);
    const sv = await saveInventoryFile(inv2);
    check("db: 35 orders saved", sv.saved === 35, JSON.stringify(sv));
    const lay = await loadLayers();
    const total = lay.layers.reduce((s, l) => s + l.totalCost, 0);
    check("db: layers hold the full landed cost", near(total, 2806610, 5), String(total));
    check("db: every layer has an arrival date and the pieces add up", lay.undated.length === 0 && lay.layers.reduce((s, l) => s + l.qty, 0) === 242307);
    const bm = await loadBundles();
    check("db: bundles load back", bm.get("NWP-BS-Q-WH-SET")?.length === 3);
    // FIFO on the real layers: the oldest delivery of a SKU is used first
    const nmp = lay.layers.filter((l) => l.sku === "NMP-S-WH-ST").sort((a, b) => (a.arrival < b.arrival ? -1 : 1));
    const first = nmp[0];
    const rr = runFifo(lay.layers, [{ ref: "t", day: "2026-11-30", sku: "NMP-S-WH-ST", qty: first.qty + 1 }]);
    check("real fifo: the first sale takes the oldest delivery, then the next one", rr.costed[0].takes[0].qty === first.qty && rr.costed[0].takes[0].orderNo === first.orderNo && rr.costed[0].takes.length === 2, JSON.stringify(rr.costed[0].takes));
    // Re-import is safe
    await saveInventoryFile(inv2);
    const n = await pg`select count(*)::int as n from stock_layers`;
    check("db: importing again does not double anything", n[0].n === inv2.chunks.length, String(n[0].n));
    // An order added in the app (31) is kept by a re-import, and the file wins if it has the same order number
    await pg`insert into stock_orders (order_no, sort_no, kind, arrival_date, source) values ('31', 310, 'order', '2026-11-20', 'app')`;
    await pg`insert into stock_layers (order_no, sku, paid_qty, total_cost_rm) values ('31', 'NMP-S-WH-ST', 10, 100)`;
    await saveInventoryFile(inv2);
    check("db: an order added in the app survives a re-import", (await pg`select 1 from stock_layers where order_no = '31'`).length === 1);
    await pg`delete from stock_orders where order_no = '31'`;
    await pg.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
