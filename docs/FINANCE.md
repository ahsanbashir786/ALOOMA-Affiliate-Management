# Finance (money released, fees, profit and loss)

Read from TikTok Shop's own settlement records (scope `seller.finance.info`), checked against TikTok's Finance API documentation (Nov 2026). Read only.

## One-time setup

1. In the TikTok Partner Center app, turn on the **Finance Information** scope (done).
2. **Connect TikTok Shop again** (Settings, Connection, Affiliate). TikTok says a new scope only works after the seller authorizes the app again. The Connection check now has a "Finance statements" line that shows whether it answers.
3. Give the people who may see money the **Finance** screen switch (Settings, User Management). Admin always has it.
4. Data Sync, Sync Now. Three new cards fill: Finance Statements, Finance Transactions, Unpaid Orders.

## What is synced

| Card | TikTok call | Holds |
|---|---|---|
| Finance Statements | `GET /finance/202309/statements` | One per day: settlement, revenue, fees, adjustments, **payment status** (PAID, PROCESSING, FAILED), payment time and ID |
| Finance Transactions | `GET /finance/202501/statements/{id}/statement_transactions` | Every order or adjustment in a statement, with the fee breakdown (TikTok commission, affiliate commission, transaction fee, SFP, GMV Max ad fee, other fees, taxes), shipping and discounts. A settled statement is read once; the newest 4 days are read again because TikTok can still add adjustments |
| Unpaid Orders | `GET /finance/202507/orders/unsettled` | Orders TikTok has not paid yet, with its estimate and the reason. A row leaves the list when it is paid |

**Get Payments is not available in Malaysia** (TikTok: "unavailable to SEA markets"), so payments are read from the statements. A statement closes at 00:00 UTC (08:00 in Malaysia); one statement is one payment, though small statements can be combined into one payment.

Amounts are kept exactly as TikTok sends them: money TikTok takes (a fee, shipping) is negative. "Other fees" is whatever is left of TikTok's own fee total after the named fees and taxes, so the lines always add up to what TikTok says.

## The screen (`/finance`)

| Tab | Shows |
|---|---|
| Money Released | Paid to you (by the day TikTok paid), settled by TikTok, on its way, not settled yet (TikTok's estimate), a failed-payment warning, a bar for each daily statement, and the statements |
| Profit And Loss | Sales before discounts, discounts, refunds, revenue, every fee, shipping, adjustments, **settlement**, ad spend, **profit before product cost**; a waterfall; a check that the lines add up to TikTok's settlement |
| Not Paid Yet | The orders TikTok has not paid, how long they have waited, why, and the estimate |

The date range works like GMV Max (default last 30 days). A statement belongs to the day it was settled.

## Ad spend: not counted twice

Each order's fee breakdown can contain `gmv_max_ad_fee_amount` (GMV Max ad money TikTok takes at settlement). If TikTok already took it, subtracting the Ads Manager spend as well would count it twice. **Automatic** does not count the Ads Manager spend when settlement fees contain a GMV Max fee, and counts it when they do not. The owner can force **Count It** or **Do Not Count**. Check this against one real day the first time.

## Not built yet

| Missing | Why |
|---|---|
| Cost of products sold | Needs a cost for each product or SKU (not in the synced data). Until then the screen says "Not set up yet" and shows **profit before product cost** |
| Other costs (salaries, rent, packaging) | To be entered by hand |
| Bank deposits | TikTok shows when it paid, not when the bank received it |
