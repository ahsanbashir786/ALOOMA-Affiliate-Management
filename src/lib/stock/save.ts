import "server-only";
import { sql as pg } from "@/db";
import type { BundleRow, CostingFile, DatesRow, OpeningFile, SkuRow } from "./parse";
import { orderSort } from "./parse";
import { normSku } from "./sku";

export const OPENING_ORDER = "OPENING";

export type SaveResult = { saved: number; notes: string[] };

export async function saveSkuList(skus: SkuRow[]): Promise<SaveResult> {
  if (!skus.length) return { saved: 0, notes: [] };
  await pg.begin(async (tx) => {
    for (const s of skus) {
      await tx`insert into stock_skus (sku, name, family) values (${s.sku}, ${s.name}, ${s.family})
        on conflict (sku) do update set name = coalesce(excluded.name, stock_skus.name), family = coalesce(excluded.family, stock_skus.family)`;
    }
  });
  return { saved: skus.length, notes: [] };
}

export async function saveBundles(bundles: BundleRow[]): Promise<SaveResult> {
  await pg.begin(async (tx) => {
    for (const b of bundles) {
      await tx`insert into stock_bundles (set_sku, name, fbs_sku) values (${b.setSku}, ${b.name}, ${b.fbsSku})
        on conflict (set_sku) do update set name = excluded.name, fbs_sku = coalesce(excluded.fbs_sku, stock_bundles.fbs_sku)`;
      await tx`delete from stock_bundle_parts where set_sku = ${b.setSku}`;
      for (const p of b.parts) await tx`insert into stock_bundle_parts (set_sku, part_sku, qty) values (${b.setSku}, ${p.sku}, ${p.qty})`;
    }
  });
  return { saved: bundles.length, notes: [] };
}

/** The costing file: one row per order, one layer per SKU. Dates already saved for an order are kept. */
export async function saveCosting(file: CostingFile): Promise<SaveResult> {
  await pg.begin(async (tx) => {
    for (const o of file.orders) {
      await tx`insert into stock_orders (order_no, sort_no, kind, supplier_file, product_rmb, product_rm, freight_rm)
        values (${o.orderNo}, ${orderSort(o.orderNo)}, 'order', ${o.file}, ${o.productRmb}, ${o.productRm}, ${o.freightRm})
        on conflict (order_no) do update set sort_no = excluded.sort_no, supplier_file = excluded.supplier_file, product_rmb = excluded.product_rmb, product_rm = excluded.product_rm, freight_rm = excluded.freight_rm`;
      await tx`delete from stock_layers where order_no = ${o.orderNo}`;
    }
    for (const l of file.lines) {
      await tx`insert into stock_layers (order_no, sku, paid_qty, free_qty, unit_rmb, rmb_per_rm, unit_rm, freight_per_paid, total_cost_rm)
        values (${l.orderNo}, ${l.sku}, ${l.paid}, ${l.free}, ${l.unitRmb}, ${l.rmbPerRm}, ${l.unitRm}, ${l.freightPerPaid}, ${l.totalCostRm})
        on conflict (order_no, sku) do update set paid_qty = excluded.paid_qty, free_qty = excluded.free_qty, unit_rmb = excluded.unit_rmb, rmb_per_rm = excluded.rmb_per_rm, unit_rm = excluded.unit_rm, freight_per_paid = excluded.freight_per_paid, total_cost_rm = excluded.total_cost_rm`;
      await tx`insert into stock_skus (sku, name) values (${l.sku}, ${l.name}) on conflict (sku) do update set name = coalesce(stock_skus.name, excluded.name)`;
    }
  });
  return { saved: file.orders.length, notes: file.warnings };
}

/** Purchase and arrival dates. Orders that are not in the costing file yet are reported, not created. */
export async function saveDates(rows: DatesRow[]): Promise<SaveResult> {
  const notes: string[] = [];
  let saved = 0;
  await pg.begin(async (tx) => {
    for (const r of rows) {
      const res = await tx`update stock_orders set purchase_date = ${r.purchaseDate}, invoice_refs = ${r.invoiceRefs}, arrival_date = ${r.arrivalDate}, arrival_exact = ${r.arrivalExact}, arrival_note = ${r.arrivalNote}
        where order_no = ${r.orderNo} returning order_no`;
      if (res.length) saved++; else notes.push(`Order ${r.orderNo} is in the dates file but not in the costing file yet (import the costing file first).`);
    }
  });
  return { saved, notes };
}

/** Stock on hand before the first costed order arrived. It is costed like the same SKU in order 1B (the nearest known cost). */
export async function saveOpening(file: OpeningFile, costFromOrder = "1B"): Promise<SaveResult> {
  const notes: string[] = [...file.warnings];
  if (!file.asOf) return { saved: 0, notes };
  const costs = new Map<string, number>();
  for (const r of await pg`select sku, total_cost_rm::float8 as total, (paid_qty + free_qty)::int as qty from stock_layers where order_no = ${costFromOrder}`) costs.set(String(r.sku), Number(r.total) / Number(r.qty));
  if (!costs.size) notes.push(`Order ${costFromOrder} is not imported yet, so the opening stock has no cost. Import the costing file, then this report again.`);
  let total = 0;
  await pg.begin(async (tx) => {
    await tx`insert into stock_orders (order_no, sort_no, kind, supplier_file, arrival_date, arrival_exact, arrival_note, note)
      values (${OPENING_ORDER}, 0, 'opening', ${"Warehouse inventory report"}, ${file.asOf}, true, ${"Closing stock on " + file.asOf}, ${`Costed like order ${costFromOrder}. ${file.samples} sample pieces are not counted.`})
      on conflict (order_no) do update set arrival_date = excluded.arrival_date, arrival_note = excluded.arrival_note, note = excluded.note`;
    await tx`delete from stock_layers where order_no = ${OPENING_ORDER}`;
    for (const i of file.items) {
      const unit = costs.get(i.sku) ?? 0;
      if (!costs.has(i.sku)) notes.push(`${i.sku}: ${i.closing} pieces have no cost in order ${costFromOrder}, so they are counted at RM 0.`);
      await tx`insert into stock_layers (order_no, sku, paid_qty, free_qty, unit_rm, total_cost_rm) values (${OPENING_ORDER}, ${i.sku}, ${i.closing}, 0, ${unit}, ${unit * i.closing})`;
      await tx`insert into stock_skus (sku) values (${i.sku}) on conflict do nothing`;
      total += i.closing;
    }
  });
  return { saved: total, notes };
}

export { normSku };

/** A stock-in order added later in the app (order 31 onward). */
export async function saveNewOrder(o: { orderNo: string; purchaseDate: string | null; arrivalDate: string; file: string; freightRm: number; priced: ReturnType<typeof import("./neworder").priceOrder> }): Promise<SaveResult> {
  const notes: string[] = [];
  const exists = await pg`select 1 from stock_orders where order_no = ${o.orderNo}`;
  if (exists.length) return { saved: 0, notes: [`Order ${o.orderNo} already exists. Use another order number, or remove the old one first.`] };
  const [{ next }] = await pg`select coalesce(max(sort_no) filter (where kind = 'order'), 0)::int + 1 as next from stock_orders`;
  const known = new Set((await pg`select sku from stock_skus`).map((r) => String(r.sku)));
  await pg.begin(async (tx) => {
    await tx`insert into stock_orders (order_no, sort_no, kind, supplier_file, purchase_date, arrival_date, arrival_exact, arrival_note, product_rmb, product_rm, freight_rm, source, note)
      values (${o.orderNo}, ${Math.max(next, orderSortNumber(o.orderNo))}, 'order', ${o.file}, ${o.purchaseDate}, ${o.arrivalDate}, true, ${"Added in the app"}, ${o.priced.productRmb}, ${o.priced.productRm}, ${o.freightRm}, 'app', ${"Freight shared over paid pieces"})`;
    for (const l of o.priced.lines) {
      await tx`insert into stock_layers (order_no, sku, paid_qty, free_qty, unit_rmb, rmb_per_rm, unit_rm, freight_per_paid, total_cost_rm)
        values (${o.orderNo}, ${l.sku}, ${l.paid}, ${l.free}, ${l.unitRmb}, ${l.rmbPerRm}, ${l.unitRm}, ${l.freightPerPaid}, ${l.totalCostRm})
        on conflict (order_no, sku) do update set paid_qty = stock_layers.paid_qty + excluded.paid_qty, free_qty = stock_layers.free_qty + excluded.free_qty, total_cost_rm = stock_layers.total_cost_rm + excluded.total_cost_rm`;
      await tx`insert into stock_skus (sku) values (${l.sku}) on conflict do nothing`;
      if (!known.has(l.sku)) notes.push(`${l.sku} is a new SKU (it was not in the SKU list).`);
    }
  });
  return { saved: o.priced.lines.length, notes };
}

function orderSortNumber(orderNo: string): number { const m = /^(\d+)/.exec(orderNo); return m ? Number(m[1]) * 10 : 0; }

/** Only orders added in the app can be removed here. The first 30 orders come from the costing file. */
export async function removeAppOrder(orderNo: string): Promise<boolean> {
  const r = await pg`delete from stock_orders where order_no = ${orderNo} and source = 'app' returning order_no`;
  return r.length > 0;
}
