// First In, First Out. Every sale takes its pieces from the oldest stock that had already arrived on the day of the sale.
// Pure (no database): the same engine costs orders, and checks the stock on hand.
import { normSku, stripFbs } from "./sku";

export type Layer = { id: number | string; orderNo: string; sortNo: number; arrival: string; sku: string; qty: number; totalCost: number };
export type Sale = { ref: string; day: string; sku: string; qty: number };
export type Take = { layerId: number | string; orderNo: string; qty: number; unitCost: number };
export type Costed = {
  ref: string;
  day: string;
  /** The single SKU the pieces came from (a bundle is already split into its parts). */
  sku: string;
  qty: number;
  takes: Take[];
  /** Pieces that had no stock on that day. They are costed at the nearest known cost and flagged. */
  shortQty: number;
  shortUnitCost: number | null;
  cost: number;
};
export type Remaining = { layerId: number | string; orderNo: string; sku: string; arrival: string; left: number; unitCost: number };

export type BundleMap = Map<string, { sku: string; qty: number }[]>;
/** A sold SKU becomes its parts. A bundle is looked up by its own code or its Fulfilled-by-Shopee code; a plain SKU is itself. */
export function explode(sku: string, qty: number, bundles: BundleMap): { sku: string; qty: number }[] {
  const s = normSku(sku);
  const parts = bundles.get(s) ?? bundles.get(stripFbs(s));
  if (!parts) return [{ sku: stripFbs(s), qty }];
  return parts.map((p) => ({ sku: p.sku, qty: p.qty * qty }));
}

export function runFifo(layers: Layer[], sales: Sale[]): { costed: Costed[]; remaining: Remaining[] } {
  const bySku = new Map<string, Layer[]>();
  for (const l of layers) {
    if (l.qty <= 0) continue;
    const a = bySku.get(l.sku) ?? [];
    a.push(l);
    bySku.set(l.sku, a);
  }
  const salesBySku = new Map<string, { sale: Sale; idx: number }[]>();
  sales.forEach((sale, idx) => {
    const a = salesBySku.get(sale.sku) ?? [];
    a.push({ sale, idx });
    salesBySku.set(sale.sku, a);
  });
  const costed: Costed[] = new Array(sales.length);
  const remaining: Remaining[] = [];

  const skus = new Set([...bySku.keys(), ...salesBySku.keys()]);
  for (const sku of skus) {
    const ls = (bySku.get(sku) ?? []).slice().sort((a, b) => (a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : a.sortNo - b.sortNo));
    const left = new Map<number | string, number>(ls.map((l) => [l.id, l.qty]));
    const ss = (salesBySku.get(sku) ?? []).slice().sort((a, b) => (a.sale.day < b.sale.day ? -1 : a.sale.day > b.sale.day ? 1 : a.idx - b.idx));
    let arrived = 0; // layers with index < arrived have arrived
    let front = 0; // first layer that may still have pieces
    for (const { sale, idx } of ss) {
      while (arrived < ls.length && ls[arrived].arrival <= sale.day) arrived++;
      const takes: Take[] = [];
      let need = sale.qty;
      let cost = 0;
      while (need > 0 && front < arrived) {
        const l = ls[front];
        const have = left.get(l.id) ?? 0;
        if (have <= 0) { front++; continue; }
        const n = Math.min(have, need);
        const unitCost = l.totalCost / l.qty;
        takes.push({ layerId: l.id, orderNo: l.orderNo, qty: n, unitCost });
        left.set(l.id, have - n);
        cost += n * unitCost;
        need -= n;
        if (have - n <= 0) front++;
      }
      let shortUnitCost: number | null = null;
      if (need > 0 && ls.length) {
        const near = arrived > 0 ? ls[arrived - 1] : ls[0];
        shortUnitCost = near.totalCost / near.qty;
        cost += need * shortUnitCost;
      }
      costed[idx] = { ref: sale.ref, day: sale.day, sku, qty: sale.qty, takes, shortQty: need, shortUnitCost, cost };
    }
    for (const l of ls) remaining.push({ layerId: l.id, orderNo: l.orderNo, sku, arrival: l.arrival, left: left.get(l.id) ?? 0, unitCost: l.totalCost / l.qty });
  }
  return { costed, remaining };
}
