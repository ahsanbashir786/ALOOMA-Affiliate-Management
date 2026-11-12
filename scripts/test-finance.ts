// Finance numbers (Money Released, Profit And Loss, Not Paid Yet) on a made-up set of TikTok statements.
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { clearFinance, seedFinance, FIN_DAYS } from "./finance-demo";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 400) : "")); };
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function main() {
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  const F = await import("../src/lib/finance/data");
  const RG = await import("../src/lib/ads/range");
  const { todayKL, addDaysISO } = await import("../src/lib/time");
  const today = todayKL();
  await q(sql`delete from ads_campaign_daily`); // this test brings its own ad spend (RM 20 a day)
  await q(sql`insert into ads_campaign_daily (advertiser_id, campaign_id, day, cost, orders, gross_revenue) select 'FIN', 'FC', ${today}::date - g, 20, 5, 100 from generate_series(0, 39) g`);

  // ── with a GMV Max fee inside every order (TikTok takes the ad money at settlement) ──
  await seedFinance(q, { gmvFee: -3 });
  const all = RG.makeRange("custom", addDaysISO(today, -60), today);
  const c = await F.cashData(all);
  const sumQ = async (where: string) => Number((await q(sql.raw(`select coalesce(sum(settlement_amount), 0)::float8 as n from tt_fin_statements ${where}`)))[0].n);
  check("money released: paid, on its way and failed come from the statement status", c.hasData && near(c.paidOut, await sumQ("where payment_status = 'PAID'")) && near(c.onItsWay, await sumQ("where payment_status = 'PROCESSING'")) && near(c.failed, await sumQ("where payment_status = 'FAILED'")) && c.failedCount === 1 && c.onItsWayCount === 2, JSON.stringify([c.paidOut, c.onItsWay, c.failed]));
  check("money released: 'paid to you' is counted by the day TikTok paid, so a short range only holds what was paid in it", (await F.cashData(RG.makeRange("custom", addDaysISO(today, -10), addDaysISO(today, -5)))).paidCount === 6 && c.paidCount === FIN_DAYS - 3);
  check("money released: the daily bars and the statement list are newest-last and newest-first, one per statement", c.statements.length === FIN_DAYS && c.statements[0].day > c.statements[1].day && c.series.length === FIN_DAYS && c.series[0].day < c.series[1].day && c.series.every((x) => x.paid + x.processing + x.failed > 0));
  check("money released: what TikTok has not settled yet is the sum of its estimates", near(c.unpaid, 12 * 50 + 5 * (0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11)) && c.unpaidCount === 12, String(c.unpaid));
  const p = await F.pnlData(all, null);
  check("profit and loss: the lines add up to TikTok's settlement, and it matches the statements' own total", p.hasData && Math.abs(p.gap) < 0.05 && near(p.settlement, p.statementTotal), JSON.stringify([p.gap, p.settlement, p.statementTotal]));
  check("profit and loss: sales before discounts, discounts, revenue, shipping and fees are summed", p.orders === FIN_DAYS * 3 && p.sellerDiscounts === -10 * FIN_DAYS * 3 && p.revenue > 0 && p.shipping === -6 * FIN_DAYS * 3 && near(p.fees.find((f) => f.key === "platform")!.amount, -5 * FIN_DAYS * 3) && near(p.fees.find((f) => f.key === "affiliate")!.amount, -8 * FIN_DAYS * 3) && near(p.fees.find((f) => f.key === "other")!.amount, -1.5 * FIN_DAYS * 3));
  check("profit and loss: when TikTok already takes the GMV Max fee inside the settlement, the Ads Manager spend is not counted again (automatic)", p.adMode === "auto-out" && p.adSpendCounted === 0 && near(p.profitBeforeCost, p.settlement) && p.adSpend === 20 * 40 && near(p.gmvMaxFeeInSettlement, -3 * FIN_DAYS * 3), JSON.stringify([p.adMode, p.adSpendCounted, p.gmvMaxFeeInSettlement]));
  const forced = await F.pnlData(all, "in");
  check("profit and loss: the owner can choose to count the ad spend anyway", forced.adMode === "in" && near(forced.profitBeforeCost, p.settlement - 800));
  check("profit and loss: a range only holds the statements settled in it", (await F.pnlData(RG.makeRange("custom", addDaysISO(today, -9), today), null)).orders === 10 * 3);
  // ── with no GMV Max fee in the settlement ──
  await seedFinance(q, { gmvFee: 0 });
  const p0 = await F.pnlData(all, null);
  check("profit and loss: with no GMV Max fee inside the settlement, the Ads Manager spend is counted (automatic)", p0.adMode === "auto-in" && p0.adSpendCounted === 800 && near(p0.profitBeforeCost, p0.settlement - 800) && Math.abs(p0.gap) < 0.05, JSON.stringify([p0.adMode, p0.adSpendCounted, p0.gap]));
  const pd = await F.pendingData();
  check("not paid yet: the total, the count, the age groups and the reasons", pd.hasData && pd.count === 12 && near(pd.total, c.unpaid) && pd.buckets.reduce((a, b) => a + b.count, 0) === 12 && pd.buckets.every((b) => b.count >= 0) && pd.reasons.length === 3 && pd.reasons[0].amount >= pd.reasons[1].amount, JSON.stringify([pd.buckets, pd.reasons]));
  check("not paid yet: the oldest waiting order is first, with how many days it has waited", pd.rows.length === 12 && (pd.rows[0].ageDays ?? 0) >= (pd.rows[11].ageDays ?? 0) && pd.rows[0].ageDays === 3 * 11 + 3 - 2, JSON.stringify(pd.rows.slice(0, 2)));
  await clearFinance(q);
  const e = await F.cashData(all);
  check("nothing synced yet: the screens know there is no finance data", !e.hasData && !(await F.pnlData(all, null)).hasData && !(await F.pendingData()).hasData);
  await q(sql`delete from ads_campaign_daily`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
