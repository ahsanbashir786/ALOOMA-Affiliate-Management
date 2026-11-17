# Shopee connection

Settings → Connection → **Shopee**. Connects the shop, reads its **orders** and the **payments** Shopee makes for them, and puts them into **Profit And Loss** next to TikTok.

## One-time setup

1. **Shopee Open Platform Console** → your app (Seller In House System). While it says **Developing**, only Shopee's sandbox works. After Shopee approves the app (Go Live) you get a **live** Partner ID and Partner Key.
2. **Redirect domain** in the app: `https://app.alooma.my` (the domain only, no path). The page Settings → Connection → Shopee → *Addresses for the Shopee app* shows it.
3. **Server settings** (private `.env` next to `docker-compose.yml`, or the project `.env` on your PC):
   ```
   SHOPEE_PARTNER_ID=1253192
   SHOPEE_PARTNER_KEY=the partner key (secret; type it only here)
   SHOPEE_ENV=sandbox        # or: live
   ```
   Restart the app (`docker compose up -d`).
4. For the live app, add the server's IP address (`103.233.2.249`) to the app's allowed IP list in the console.
5. In the app: **Connect Shopee**, log in with the seller account, approve. Press **Check Connection**.

## How it works

| Point | How |
|---|---|
| Signing | Every call is signed with the partner key (HMAC-SHA256). Sign-in and token calls sign `partner_id + path + timestamp`; shop calls add `access_token + shop_id` |
| Sign-in | Shopee returns to `/api/shopee/callback?code=…&shop_id=…`. The code lasts 10 minutes and works once. A short-lived cookie proves the sign-in started in this browser |
| Login | Access token 4 hours, refresh token 30 days. Both are stored **encrypted** (the key is made from the partner key). The access token is renewed automatically before it ends; the refresh token changes every time and is never used by two callers at once. Using the app keeps the 30 days rolling |
| Safe | Read-only checks only: shop details and one recent order. The check shows field names, never customer or order details |
| Environments | A sandbox login is never used for the live shop (and the other way round): press Connect again after changing `SHOPEE_ENV` |
| Disconnect | Deletes the stored login. Nothing changes in Shopee |

## Files

`src/lib/shopee/{client,checks}.ts` · `src/app/api/shopee/{connect,callback,test}/route.ts` · `src/components/settings/shopee-card.tsx` · `scripts/test-shopee.ts` (27 checks) · `scripts/e2e-shopee.js` with `scripts/fake-shopee-api.js` (a pretend Shopee)

## What is read (Data Sync → Shopee)

The connection (Settings) and the reading (Data Sync) are separate: Settings only connects; **Data Sync → Shopee** shows every part, when it last ran, and any error, with **Sync Now**, **Load History** and **Check What Shopee Allows**.

| Part | Shopee call | Used for |
|---|---|---|
| Orders | `order/get_order_list`, `get_order_detail` | Sales, SKUs, FBS flag |
| Payments | `payment/get_escrow_detail_batch` | Fees, shipping, payout per order |
| Payment Release Dates | `payment/get_escrow_list` | The day the money was released (an order is Paid from then) |
| Returns | `returns/get_return_list` | Accepted returns put the pieces back into stock; refunds shown as deductions |
| Shopee Ads | `ads/get_all_cpc_ads_daily_performance` | Real Shopee ad spend per day, in Profit And Loss |
| Wallet | `payment/get_wallet_transaction_list` | Money in and withdrawals (last-30-days summary) |
| Stock (FBS) | `product/get_item_list`, `get_item_base_info`, `get_model_list` | Stock in Shopee's warehouse per SKU, in Stock And Costing |
| Affiliate (AMS) | probe only (`ams/…`) | Shopee's affiliate programme is often a separate access; the Shopee AMS commission already comes in each order's payment (`ams_commission_fee`) |

**Important:** these calls follow Shopee's v2 documentation but have not yet been run against your live shop. If a part says *"Shopee has not given this app access to …"*, add that API group to the app in the Open Platform Console and press Reconnect. If a part fails with another message, send it: each part is separate, so the others still work.

## Orders and payments (the sync)

| What | How |
|---|---|
| Orders | `get_order_list` by the time an order was last changed, in windows of 14 days (Shopee allows 15), 100 per page; then `get_order_detail` for 50 at a time. We keep the status, dates, fulfilled-by-Shopee flag and each item's seller SKU and quantity. No buyer or address details are asked for or kept |
| Payments | `get_escrow_detail_batch` (50 at a time) for every order that has none yet or changed since: what Shopee pays out (escrow) and the fees: commission, service fee, transaction fee, shipping, vouchers, refunds. The buyer's name is dropped |
| When | Every 30 minutes once Shopee is connected; **Sync Now** in the card; **Load History** reads further back (the first sync reads 180 days) |
| Safe to repeat | Orders and payments are saved by order number, so nothing is doubled. An order is read again for 2 days back so a late status change is never missed |
| Limits | A rate limit from Shopee is waited out and tried again (up to 4 times) |
| Where it is stored | tables `shopee_orders`, `shopee_escrow` (migration 0039); progress in `tt_sync_state` (`shopee_orders`, `shopee_escrow`) |

### In Profit And Loss

- **Channel switch** (All Channels, TikTok, Shopee) on Order Profit and Monthly; the monthly view also has a **By Channel** table: TikTok, Shopee and both together.
- **Cost** is FIFO from the same stock file, exactly like TikTok. A Shopee item counts as its quantity; the FBS prefix is ignored. Unpaid and cancelled orders are left out.
- **Money**: sales = original price − seller discount; commission and Shopee ad-commission (AMS) are negative; **shipping deducted** = actual shipping − what the buyer paid − Shopee's rebate; **settlement** = Shopee's escrow amount; other fees (service, transaction fee, vouchers) are what is left, so the columns always add up. An order is **Paid** once it is *Completed* (that is when Shopee releases the money), otherwise **Estimate**.
- **Fulfilment cost**: orders Shopee packs itself (FBS) have none; the 3PL invoice is spread over the other pieces.
- **Returns** (accepted, closed or processing) put the pieces back into stock at the cost they left with. A refund without the goods coming back would restock wrongly; check the first live returns.
- **Real ad spend** is TikTok GMV Max plus Shopee Ads; each channel's line has its own.

### Going live

1. Server `.env`: `SHOPEE_PARTNER_ID=2053717`, `SHOPEE_PARTNER_KEY=` the **live** key (type it only on the server), `SHOPEE_ENV=live`. Then `docker compose up -d`.
2. In Settings → Connection → Shopee press **Connect Shopee** (the sandbox login is not used for live) and sign in with the real seller account.
3. Press **Sync Now**. The first sync reads 180 days; use **Load History** for more.

`src/lib/shopee/{map,sync,checks}.ts` · `src/components/sync/shopee-sync-board.tsx` · `migrations/0039_shopee_orders.sql`, `0040_shopee_more.sql` · `scripts/test-shopee-sync.ts` (43 checks) · `scripts/e2e-shopee.js` (33, with `scripts/fake-shopee-api.js`)
