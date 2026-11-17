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
