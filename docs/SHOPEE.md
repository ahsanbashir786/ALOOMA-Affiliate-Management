# Shopee connection

Settings → Connection → **Shopee**. This step only **connects** the shop and checks the connection. Orders and payouts are not synced yet (that is the next step).

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
