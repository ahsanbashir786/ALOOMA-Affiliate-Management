# Profit And Loss

Menu: **Profit → Profit And Loss** (its own permission, "Profit And Loss"). Four tabs: Order Profit, Monthly Profit And Loss, Claim Back, Fulfilment Cost. It uses the TikTok finance records that Data Sync already collects, and the stock costs from [Stock And Costing](STOCK.md).

## The rules

| Question | Rule |
|---|---|
| Which month does an order belong to? | The month it was **placed** (Kuala Lumpur time). Orders TikTok has not paid yet use TikTok's own estimate and are marked "Estimate". They become exact when TikTok settles them. |
| What is "Settlement"? | What TikTok pays for the order: sales, less commission, affiliate commission, the ads top-up, the seller shipping fee, other fees, plus reimbursements, less deductions. The columns always add up to it; whatever TikTok takes that has no column of its own goes into "TikTok Fees". |
| Seller shipping fee | Shown on its own ("Shipping Deducted"): what the platform deducts after what the buyer paid and the platform's discount. The order page shows the three parts. |
| Ads | Profit uses the **real ad spend** (GMV Max, per day). The ad fee TikTok takes from each order's money (a top-up) is shown in its own column and is added back, so ads are never counted twice. |
| Product cost | First In, First Out from Stock And Costing. Bundles are split into their parts. |
| Returns | When the goods come back (a return type of "return", not refund only) the pieces go back into stock on that day at the cost they left with, and the order's product cost goes down. A refund without the goods coming back keeps the cost. |
| Samples | Sample orders are a cost only: the pieces and the fulfilment, no sales. |
| Fulfilment | Per physical piece: RM 1.20 until you set another rate. When you type the real 3PL invoice of a month, that month's cost is the invoice, spread over the pieces sent that month. |
| Cancelled orders | Left out. |
| No money data yet | A new order TikTok has given no money for is listed but **not counted** in the totals (the page says how many). |
| Net profit | Profit before ads, less the real ad spend of the same period. |

## Claim Back

Lists money that may be worth claiming:

- **Platform Deduction** - an adjustment TikTok took off an order (for example a shipping fee adjustment). Ads-related adjustments and reimbursements are not listed.
- **Shipping Fee Higher Than Usual** - the seller shipping fee is more than twice the usual (needs at least 20 paid orders to know the usual).

Each item has a status (To Claim, Claimed, Recovered, Not Claiming) and a note, saved for everyone. Reimbursements TikTok already paid are added up separately. The "All Adjustment Types" table shows every kind of adjustment TikTok has made, so new kinds can be recognised.

## Adding a new stock-in order (order 31 onward)

**Stock And Costing → Import Files → Add A New Stock-In Order.** Give the order number, the exchange rate (RMB for RM 1), the freight total in RM, the arrival day and the supplier's order file. The file's header names are found automatically (SKU, Paid Qty or Qty, Free Qty, Unit Price in RMB, optional RMB Per RM for a SKU with its own rate); a template can be downloaded. Cost per piece = unit price ÷ rate + freight ÷ total paid pieces. A mistake can be removed (orders added in the app only).

## What is not included yet

- Shopee orders, payouts and ads (the table has a platform field ready).
- Business costs other than product, fulfilment and ads (salaries, rent, packaging, tax).
- For an estimate, the ad fee is read from TikTok's estimate breakdown when it is there; if TikTok does not give it, the estimate's fees are shown as TikTok Fees and the ad top-up as RM 0.

## Files

`migrations/0035_profit.sql` · `src/lib/profit/{data,claims,monthly,period,format}.ts` · `src/lib/stock/{costing,neworder}.ts` · `src/app/(app)/profit/` · `src/app/api/profit/export` · `src/app/actions/{profit,stock}.ts` · `scripts/test-profit.ts` (41 checks) · `scripts/e2e-profit.js` (run `test-profit` first)
