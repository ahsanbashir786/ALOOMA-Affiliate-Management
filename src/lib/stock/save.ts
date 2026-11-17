import "server-only";
import { sql as pg } from "@/db";
import type { BundleRow, InventoryFile, SkuRow } from "./parse";
import { orderSort } from "./parse";
import { normSku } from "./sku";

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

/**
 * The inventory file is the whole stock history, so importing it again replaces everything that came from a file
 * (orders added in the app, 31 onward, are kept unless the file has the same order number).
 * One layer is saved per delivery: pieces of one SKU arriving on one day at one cost.
 */
export async function saveInventoryFile(file: InventoryFile): Promise<SaveResult> {
  const notes: string[] = [...file.warnings];
  const nos = file.orders.map((o) => o.orderNo);
  await pg.begin(async (tx) => {
    const clash = await tx`select order_no from stock_orders where source = 'app' and order_no = any(${nos})`;
    if (clash.length) notes.push(`Orders ${clash.map((r) => r.order_no).join(", ")} were added in the app and are also in the file: the file's version is used.`);
    await tx`delete from stock_orders where source = 'file' or kind = 'opening' or order_no = any(${nos})`; // layers go with them
    for (const o of file.orders) {
      const parts = o.deliveries === 1 ? "One delivery" : `${o.deliveries} deliveries, ${o.firstArrival} to ${o.lastArrival}`;
      await tx`insert into stock_orders (order_no, sort_no, kind, supplier_file, arrival_date, arrival_exact, arrival_note, product_rm, freight_rm, source, note)
        values (${o.orderNo}, ${orderSort(o.orderNo)}, 'order', ${"Total inventory file"}, ${o.firstArrival}, true, ${parts}, ${o.productRm}, ${o.freightRm}, 'file', ${o.free ? `${o.free} free pieces at RM 0` : null})`;
    }
    for (const c of file.chunks) {
      await tx`insert into stock_layers (order_no, sku, paid_qty, free_qty, unit_rmb, rmb_per_rm, unit_rm, freight_per_paid, total_cost_rm, arrival_date, receipt, chunk)
        values (${c.orderNo}, ${c.sku}, ${c.free ? 0 : c.qty}, ${c.free ? c.qty : 0}, ${c.unitRmb}, ${c.rmbPerRm}, ${c.unitRm}, ${c.freightRm}, ${c.qty * c.unitRm}, ${c.arrival}, ${c.receipt}, ${c.chunk})`;
    }
    for (const [sku, name] of file.names) await tx`insert into stock_skus (sku, name) values (${sku}, ${name}) on conflict (sku) do update set name = coalesce(stock_skus.name, excluded.name)`;
  });
  const undated = file.undatedFree.reduce((n, x) => n + x.qty, 0);
  if (undated) notes.push(`${undated} free pieces in the file have no receipt date yet (${[...new Set(file.undatedFree.map((x) => x.orderNo))].join(", ")}). They are not counted until they get a date.`);
  const out = file.excluded.reduce((n, x) => n + x.qty, 0);
  if (out) notes.push(`${out} pieces are marked as excluded in the file (${[...new Set(file.excluded.map((x) => x.orderNo))].map((x) => `order ${x}`).join(", ")}) and are not counted.`);
  return { saved: file.orders.length, notes };
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
        on conflict (order_no, sku, chunk) do update set paid_qty = stock_layers.paid_qty + excluded.paid_qty, free_qty = stock_layers.free_qty + excluded.free_qty, total_cost_rm = stock_layers.total_cost_rm + excluded.total_cost_rm`;
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
