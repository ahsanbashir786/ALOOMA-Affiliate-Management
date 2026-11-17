// Turns Shopee's answers into the rows we keep. Pure: no database, no network, so it can be tested on its own.

const n = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const when = (sec: unknown): string | null => { const x = n(sec); return x && x > 0 ? new Date(x * 1000).toISOString() : null; };

export type ShopeeItem = { sku: string; qty: number; name: string | null; price: number | null };
export type ShopeeOrderRow = {
  orderSn: string; status: string | null; createdAt: string; paidAt: string | null; updatedAt: string | null;
  totalAmount: number | null; currency: string | null; isFbs: boolean; items: ShopeeItem[]; pieces: number;
};

/** One order from get_order_detail. The seller SKU of the variation (model_sku) is used; if the listing has no variations, the listing's SKU. */
export function mapShopeeOrder(d: Record<string, unknown>): ShopeeOrderRow | null {
  const orderSn = String(d.order_sn ?? "").trim();
  const createdAt = when(d.create_time);
  if (!orderSn || !createdAt) return null;
  const items: ShopeeItem[] = [];
  for (const raw of Array.isArray(d.item_list) ? d.item_list : []) {
    const i = obj(raw);
    const sku = String(i.model_sku || i.item_sku || "").trim();
    const qty = Math.max(0, Math.round(n(i.model_quantity_purchased) ?? n(i.quantity) ?? 0));
    if (!qty) continue;
    items.push({ sku, qty, name: (i.item_name as string) ?? null, price: n(i.model_discounted_price) ?? n(i.model_original_price) });
  }
  return {
    orderSn, status: d.order_status ? String(d.order_status).toUpperCase() : null, createdAt, paidAt: when(d.pay_time), updatedAt: when(d.update_time),
    totalAmount: n(d.total_amount), currency: (d.currency as string) ?? null,
    isFbs: String(d.fulfillment_flag ?? "").toLowerCase() === "fulfilled_by_shopee", items, pieces: items.reduce((s, i) => s + i.qty, 0),
  };
}

export type ShopeeEscrowRow = {
  orderSn: string; escrowAmount: number | null; originalPrice: number | null; sellerDiscount: number | null; voucherSeller: number | null;
  commissionFee: number | null; serviceFee: number | null; transactionFee: number | null; amsFee: number | null;
  actualShippingFee: number | null; buyerShippingFee: number | null; shippingRebate: number | null; reverseShippingFee: number | null;
  refundAmount: number | null; compensation: number | null; raw: Record<string, unknown>;
};

/** One entry of get_escrow_detail_batch: the payment breakdown of an order. The buyer's name is never kept. */
export function mapShopeeEscrow(entry: Record<string, unknown>): ShopeeEscrowRow | null {
  const detail = obj(entry.escrow_detail ?? entry);
  const orderSn = String(detail.order_sn ?? entry.order_sn ?? "").trim();
  if (!orderSn) return null;
  const inc = obj(detail.order_income);
  if (!Object.keys(inc).length) return null; // Shopee has no payment figures for this order yet
  const { buyer_user_name: _name, ...safe } = detail; void _name;
  const pick = (...k: string[]) => { for (const key of k) { const v = n(inc[key]); if (v != null) return v; } return null; };
  return {
    orderSn,
    escrowAmount: pick("escrow_amount"), originalPrice: pick("original_price"), sellerDiscount: pick("seller_discount"), voucherSeller: pick("voucher_from_seller"),
    commissionFee: pick("commission_fee"), serviceFee: pick("service_fee"), transactionFee: pick("seller_transaction_fee"), amsFee: pick("ams_commission_fee", "campaign_fee"),
    actualShippingFee: pick("actual_shipping_fee"), buyerShippingFee: pick("buyer_paid_shipping_fee"), shippingRebate: pick("shopee_shipping_rebate"), reverseShippingFee: pick("reverse_shipping_fee"),
    refundAmount: pick("seller_return_refund", "drc_adjustable_refund"), compensation: pick("seller_lost_compensation"),
    raw: safe,
  };
}

/** Orders that count as sales (costing and profit): everything except these. Written out in src/lib/stock/costing.ts. */
export const SHOPEE_NOT_A_SALE = ["UNPAID", "CANCELLED", "IN_CANCEL"] as const;

// ───────── Returns ─────────
export type ShopeeReturnRow = { returnSn: string; orderSn: string; status: string | null; reason: string | null; createdAt: string | null; updatedAt: string | null; refundAmount: number | null; currency: string | null; items: { sku: string; qty: number; name: string | null; refund: number | null }[]; pieces: number };

/** One return from get_return_list. The buyer's details are never read. */
export function mapShopeeReturn(d: Record<string, unknown>): ShopeeReturnRow | null {
  const returnSn = String(d.return_sn ?? "").trim(), orderSn = String(d.order_sn ?? "").trim();
  if (!returnSn || !orderSn) return null;
  const items: ShopeeReturnRow["items"] = [];
  for (const raw of Array.isArray(d.item) ? d.item : Array.isArray(d.item_list) ? d.item_list : []) {
    const i = obj(raw);
    const qty = Math.max(0, Math.round(n(i.amount) ?? n(i.quantity) ?? 0));
    if (!qty) continue;
    items.push({ sku: String(i.variation_sku || i.model_sku || i.item_sku || "").trim(), qty, name: (i.name as string) ?? (i.item_name as string) ?? null, refund: n(i.refund_amount) });
  }
  return { returnSn, orderSn, status: d.status ? String(d.status).toUpperCase() : null, reason: (d.reason as string) ?? null, createdAt: when(d.create_time), updatedAt: when(d.update_time), refundAmount: n(d.refund_amount), currency: (d.currency as string) ?? null, items, pieces: items.reduce((s, x) => s + x.qty, 0) };
}

/** A return whose goods are on their way back or arrived and accepted. Cancelled, rejected and still-asking returns put nothing back into stock. */
export const SHOPEE_RETURN_RESTOCKS = ["ACCEPTED", "CLOSED", "COMPLETED", "REFUND_PAID", "PROCESSING"] as const;

// ───────── Ads ─────────
export type ShopeeAdsDay = { day: string; impressions: number | null; clicks: number | null; expense: number; orders: number | null; gmv: number | null; raw: Record<string, unknown> };

/** One day of get_all_cpc_ads_daily_performance. Shopee writes the date as DD-MM-YYYY. `expense` is RM spent. */
export function mapShopeeAdsDay(d: Record<string, unknown>): ShopeeAdsDay | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(d.date ?? "").trim());
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? "")) ? String(d.date) : null;
  if (!iso) return null;
  return { day: iso, impressions: n(d.impression), clicks: n(d.clicks), expense: n(d.expense) ?? 0, orders: n(d.broad_order) ?? n(d.direct_order), gmv: n(d.broad_gmv) ?? n(d.direct_gmv), raw: d };
}

// ───────── Wallet ─────────
export type ShopeeWalletRow = { key: string; createdAt: string; type: string | null; flow: string | null; amount: number; balance: number | null; status: string | null; orderSn: string | null; withdrawalId: string | null; description: string | null };

/** One line of get_wallet_transaction_list. Money out is stored negative. The buyer's name is dropped. */
export function mapShopeeWallet(d: Record<string, unknown>): ShopeeWalletRow | null {
  const createdAt = when(d.create_time);
  const raw = n(d.amount);
  if (!createdAt || raw == null) return null;
  const flow = d.money_flow ? String(d.money_flow).toUpperCase() : null;
  const amount = flow === "MONEY_OUT" ? -Math.abs(raw) : raw;
  const orderSn = (d.order_sn as string) || null, withdrawalId = d.withdrawal_id != null && d.withdrawal_id !== "" ? String(d.withdrawal_id) : null;
  const type = d.transaction_type ? String(d.transaction_type) : null;
  return { key: [d.create_time, type ?? "", amount, orderSn ?? "", withdrawalId ?? "", d.current_balance ?? ""].join("|"), createdAt, type, flow, amount, balance: n(d.current_balance), status: (d.status as string) ?? null, orderSn, withdrawalId, description: (d.description as string) ?? (d.reason as string) ?? null };
}

// ───────── Escrow release dates ─────────
export type ShopeeReleaseRow = { orderSn: string; releasedAt: string; payoutAmount: number | null };
export function mapShopeeRelease(d: Record<string, unknown>): ShopeeReleaseRow | null {
  const orderSn = String(d.order_sn ?? "").trim(), releasedAt = when(d.escrow_release_time);
  return orderSn && releasedAt ? { orderSn, releasedAt, payoutAmount: n(d.payout_amount) } : null;
}

// ───────── Stock at Shopee (FBS) ─────────
export type ShopeeStockRow = { itemId: number; modelId: number; sku: string | null; name: string | null; sellerStock: number; shopeeStock: number; reserved: number };
const sum = (v: unknown, key: string) => (Array.isArray(v) ? v.reduce((s: number, x) => s + (n(obj(x)[key]) ?? 0), 0) : 0);

/** The stock of one listing (no variations) or one variation: your own warehouse, Shopee's warehouse (FBS), and what is reserved. */
export function mapShopeeStock(itemId: number, modelId: number, sku: string | null, name: string | null, stockInfo: unknown): ShopeeStockRow {
  const s = obj(stockInfo), sum2 = obj(s.summary_info);
  return { itemId, modelId, sku: sku?.trim() || null, name, sellerStock: Math.round(sum(s.seller_stock, "stock")), shopeeStock: Math.round(sum(s.shopee_stock, "stock")), reserved: Math.round(n(sum2.total_reserved_stock) ?? 0) };
}
