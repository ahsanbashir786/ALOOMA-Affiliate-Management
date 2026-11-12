import "server-only";
import { sql as pg } from "@/db";
import { runFifo, type Costed, type Remaining } from "./fifo";
import { loadBundles, loadLayers, loadTikTokSales } from "./load";

export type SkuRow = {
  sku: string; name: string | null; family: string | null;
  received: number; free: number; sold: number; short: number; onHand: number; value: number; avgCost: number | null; oldestOrder: string | null;
};
export type OrderRow = {
  orderNo: string; kind: "opening" | "order"; purchaseDate: string | null; arrival: string | null; exact: boolean; arrivalNote: string | null;
  paid: number; free: number; productRm: number; freightRm: number; landed: number; perPiece: number | null; left: number; leftValue: number; skuCount: number;
};
export type Overview = {
  skus: SkuRow[]; orders: OrderRow[];
  tiles: { onHand: number; value: number; landed: number; orders: number; estimated: number; shortPieces: number; sales: number };
  unknown: { sku: string; pieces: number }[];
  counts: { skus: number; bundles: number; orders: number; layers: number; opening: number };
};

const f = (v: unknown) => (v == null ? 0 : Number(v));

export async function stockOverview(): Promise<Overview> {
  const [{ layers }, bundles] = await Promise.all([loadLayers(), loadBundles()]);
  const { sales } = await loadTikTokSales(bundles);
  const { costed, remaining } = runFifo(layers, sales);

  const [skuMeta, orderRows, layerRows, counts] = await Promise.all([
    pg`select sku, name, family from stock_skus`,
    pg`select order_no, kind, to_char(purchase_date, 'YYYY-MM-DD') as purchase, to_char(arrival_date, 'YYYY-MM-DD') as arrival, arrival_exact, arrival_note, product_rm::float8 as product_rm, freight_rm::float8 as freight_rm, sort_no from stock_orders order by arrival_date nulls last, sort_no`,
    pg`select order_no, count(*)::int as skus, sum(paid_qty)::int as paid, sum(free_qty)::int as free, sum(total_cost_rm)::float8 as landed from stock_layers group by order_no`,
    pg`select (select count(*)::int from stock_skus) as skus, (select count(*)::int from stock_bundles) as bundles, (select count(*)::int from stock_orders where kind = 'order') as orders, (select count(*)::int from stock_layers) as layers, (select coalesce(sum(paid_qty + free_qty), 0)::int from stock_layers where order_no = 'OPENING') as opening`,
  ]);
  const meta = new Map(skuMeta.map((r) => [String(r.sku), r]));

  const bySku = new Map<string, SkuRow>();
  const row = (sku: string): SkuRow => {
    let r = bySku.get(sku);
    if (!r) { const m = meta.get(sku); r = { sku, name: (m?.name as string) ?? null, family: (m?.family as string) ?? null, received: 0, free: 0, sold: 0, short: 0, onHand: 0, value: 0, avgCost: null, oldestOrder: null }; bySku.set(sku, r); }
    return r;
  };
  for (const l of layerRows) void l;
  const layerQty = new Map<string, { paid: number; free: number }>();
  for (const r of await pg`select sku, sum(paid_qty)::int as paid, sum(free_qty)::int as free from stock_layers group by sku`) layerQty.set(String(r.sku), { paid: f(r.paid), free: f(r.free) });
  for (const [sku, q] of layerQty) { const r = row(sku); r.received = q.paid + q.free; r.free = q.free; }
  const rem = new Map<string, Remaining[]>();
  for (const x of remaining) { const a = rem.get(x.sku) ?? []; a.push(x); rem.set(x.sku, a); }
  for (const [sku, ls] of rem) {
    const r = row(sku);
    for (const x of ls) { r.onHand += x.left; r.value += x.left * x.unitCost; }
    r.avgCost = r.onHand ? r.value / r.onHand : null;
    const o = ls.filter((x) => x.left > 0).sort((a, b) => (a.arrival < b.arrival ? -1 : 1))[0];
    r.oldestOrder = o?.orderNo ?? null;
  }
  const unknownMap = new Map<string, number>();
  let shortPieces = 0;
  for (const c of costed as Costed[]) {
    if (!c) continue;
    const r = row(c.sku);
    r.sold += c.qty;
    if (!layerQty.has(c.sku)) { unknownMap.set(c.sku, (unknownMap.get(c.sku) ?? 0) + c.qty); continue; } // no cost anywhere: listed as "not in your stock list" instead
    r.short += c.shortQty; shortPieces += c.shortQty;
  }

  const layerAgg = new Map(layerRows.map((r) => [String(r.order_no), r]));
  const leftByOrder = new Map<string, { left: number; value: number }>();
  for (const x of remaining) { const a = leftByOrder.get(x.orderNo) ?? { left: 0, value: 0 }; a.left += x.left; a.value += x.left * x.unitCost; leftByOrder.set(x.orderNo, a); }
  const orders: OrderRow[] = orderRows.map((o) => {
    const a = layerAgg.get(String(o.order_no));
    const paid = f(a?.paid), free = f(a?.free), landed = f(a?.landed);
    const lf = leftByOrder.get(String(o.order_no));
    return {
      orderNo: String(o.order_no), kind: o.kind as "opening" | "order", purchaseDate: (o.purchase as string) ?? null, arrival: (o.arrival as string) ?? null, exact: !!o.arrival_exact, arrivalNote: (o.arrival_note as string) ?? null,
      paid, free, productRm: f(o.product_rm), freightRm: f(o.freight_rm), landed, perPiece: paid + free ? landed / (paid + free) : null, left: lf?.left ?? 0, leftValue: lf?.value ?? 0, skuCount: f(a?.skus),
    };
  });

  const skus = [...bySku.values()].sort((a, b) => b.value - a.value || a.sku.localeCompare(b.sku));
  return {
    skus, orders,
    tiles: {
      onHand: skus.reduce((s, r) => s + r.onHand, 0),
      value: skus.reduce((s, r) => s + r.value, 0),
      landed: orders.reduce((s, o) => s + o.landed, 0),
      orders: orders.filter((o) => o.kind === "order").length,
      estimated: orders.filter((o) => o.kind === "order" && !o.exact).length,
      shortPieces,
      sales: sales.length,
    },
    unknown: [...unknownMap.entries()].map(([sku, pieces]) => ({ sku, pieces })).sort((a, b) => b.pieces - a.pieces).slice(0, 30),
    counts: { skus: f(counts[0].skus), bundles: f(counts[0].bundles), orders: f(counts[0].orders), layers: f(counts[0].layers), opening: f(counts[0].opening) },
  };
}

/** One SKU: its layers and how much of each is left after the TikTok sales so far. */
export async function skuDetail(sku: string) {
  const [{ layers }, bundles] = await Promise.all([loadLayers(), loadBundles()]);
  const { sales } = await loadTikTokSales(bundles);
  const { costed, remaining } = runFifo(layers, sales);
  const mine = layers.filter((l) => l.sku === sku);
  const left = new Map(remaining.filter((r) => r.sku === sku).map((r) => [r.layerId, r.left]));
  const [meta] = await pg`select sku, name, family from stock_skus where sku = ${sku}`;
  const used = costed.filter((c) => c && c.sku === sku);
  return {
    sku, name: (meta?.name as string) ?? null, family: (meta?.family as string) ?? null,
    layers: mine.sort((a, b) => (a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : a.sortNo - b.sortNo)).map((l) => ({ orderNo: l.orderNo, arrival: l.arrival, qty: l.qty, unitCost: l.totalCost / l.qty, left: left.get(l.id) ?? 0 })),
    sold: used.reduce((s, c) => s + c.qty, 0), short: used.reduce((s, c) => s + c.shortQty, 0), costOfSold: used.reduce((s, c) => s + c.cost, 0),
  };
}

export async function bundleList() {
  const rows = await pg`select b.set_sku, b.name, b.fbs_sku, p.part_sku, p.qty::int as qty from stock_bundles b left join stock_bundle_parts p on p.set_sku = b.set_sku order by b.set_sku, p.part_sku`;
  const out = new Map<string, { setSku: string; name: string | null; fbsSku: string | null; parts: { sku: string; qty: number }[] }>();
  for (const r of rows) {
    const k = String(r.set_sku);
    const b = out.get(k) ?? { setSku: k, name: (r.name as string) ?? null, fbsSku: (r.fbs_sku as string) ?? null, parts: [] };
    if (r.part_sku) b.parts.push({ sku: String(r.part_sku), qty: Number(r.qty) });
    out.set(k, b);
  }
  return [...out.values()];
}
