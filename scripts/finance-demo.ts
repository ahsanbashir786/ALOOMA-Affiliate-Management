// A small, made-up set of TikTok finance records (statements, orders inside them, unpaid orders) for tests and screenshots. Never touches real data tables other than the tt_fin_* ones.
import { sql } from "drizzle-orm";

type Q = (s: ReturnType<typeof sql>) => Promise<unknown>;
const iso = (d: Date) => d.toISOString();
export const FIN_DAYS = 40;

export async function clearFinance(q: Q) {
  await q(sql`delete from tt_fin_transactions`); await q(sql`delete from tt_fin_statements`); await q(sql`delete from tt_fin_unsettled`);
}

/** 40 daily statements (the newest two still being paid, one payment that failed), three orders in each, and 12 unpaid orders. `gmvFee` is the GMV Max fee TikTok takes inside each order. */
export async function seedFinance(q: Q, opts: { gmvFee?: number } = {}) {
  const gmv = opts.gmvFee ?? -3;
  await clearFinance(q);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < FIN_DAYS; i++) {
    const t = new Date(today.getTime() - i * 86400_000);
    const id = "FS" + String(i).padStart(3, "0");
    const status = i <= 1 ? "PROCESSING" : i === 20 ? "FAILED" : "PAID";
    let rev = 0, fee = 0, ship = 0, adj = 0;
    const tx: Record<string, unknown>[] = [];
    for (let k = 0; k < 3; k++) {
      const r = 100 + k * 50 + (i % 5), s = -6, f = -(5 + 8 + 2 + 1 + 1.5 + 0.5) + gmv * 1 - (gmv ? 0 : 0);
      // fee_tax_amount = platform -5, affiliate -8, transaction -2, sfp -1, gmv_max (given), other -1.5, tax -0.5
      const feeTax = -5 - 8 - 2 - 1 + gmv - 1.5 - 0.5;
      const a = k === 2 && i % 7 === 0 ? -4 : 0;
      rev += r; fee += feeTax; ship += s; adj += a;
      tx.push({ id: `${id}-T${k}`, type: "ORDER", oid: `ORD-${i}-${k}`, r, s, feeTax, a, set: r + s + feeTax + a, sub: r + 10 });
      void f;
    }
    const set = rev + ship + fee + adj;
    await q(sql`insert into tt_fin_statements (id, statement_time, settlement_amount, currency, revenue_amount, fee_amount, adjustment_amount, shipping_cost_amount, payment_status, payment_id, payment_time, payable_amount, reserve_amount, tx_loaded)
      values (${id}, ${iso(t)}::timestamptz, ${set}, 'MYR', ${rev}, ${fee}, ${adj}, ${ship}, ${status}, ${status === "PAID" ? "PAY" + id : null}, ${status === "PAID" ? iso(new Date(t.getTime() + 86400_000)) : null}::timestamptz, ${set}, 0, true)`);
    for (const x of tx) {
      await q(sql`insert into tt_fin_transactions (statement_id, id, type, order_id, order_create_time, settlement_amount, revenue_amount, shipping_cost_amount, fee_tax_amount, adjustment_amount, subtotal_before_discount, seller_discount, platform_commission, affiliate_commission, transaction_fee, sfp_service_fee, gmv_max_ad_fee, other_fees, tax_amount, actual_shipping_fee)
        values (${id}, ${String(x.id)}, 'ORDER', ${String(x.oid)}, ${iso(new Date(t.getTime() - 5 * 86400_000))}::timestamptz, ${Number(x.set)}, ${Number(x.r)}, ${Number(x.s)}, ${Number(x.feeTax)}, ${Number(x.a)}, ${Number(x.sub)}, -10, -5, -8, -2, -1, ${gmv}, -1.5, -0.5, ${Number(x.s)})`);
    }
  }
  for (let u = 0; u < 12; u++) {
    const created = new Date(today.getTime() - (3 + u * 3) * 86400_000), delivered = new Date(created.getTime() + 2 * 86400_000);
    await q(sql`insert into tt_fin_unsettled (id, type, order_id, order_create_time, order_delivery_time, status, unsettled_reason, currency, est_settlement_amount, est_revenue_amount)
      values (${"U" + u}, 'ORDER', ${"UO" + u}, ${iso(created)}::timestamptz, ${iso(delivered)}::timestamptz, 'UNSETTLED', ${u % 3 === 0 ? "Waiting for the return period to end" : u % 3 === 1 ? "Order is not delivered yet" : "Under review"}, 'MYR', ${50 + u * 5}, ${70 + u * 5})`);
  }
}
