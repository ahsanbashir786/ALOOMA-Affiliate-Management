# TikTok Shop connection

Lets the app read orders, products, returns and shipping straight from TikTok (read-only). Uploads keep working as a backup.

## One-time setup

1. **Partner Center app** (already created): Custom app, category *TikTok Shop Seller*, market Malaysia, API enabled. The app must be **On** and the scopes approved.
2. **Redirect URL** in the app: `http://localhost:3000/api/tiktok/callback` for your PC. On the VPS change it to `https://YOUR-DOMAIN/api/tiktok/callback`.
3. **Private settings.** Add these three lines to the `.env` file next to `docker-compose.yml` (VPS) or to `.env` in the project folder (your PC). Never paste the secret in chat, email or GitHub.
   ```
   TIKTOK_APP_KEY=your app key
   TIKTOK_APP_SECRET=your app secret
   TIKTOK_SERVICE_ID=your app ID (the long number shown at the top of the app page)
   ```
   Restart the app after saving.
4. In the app go to **Settings → TikTok Shop connection → Connect TikTok Shop**, log in to the seller account and approve.
5. Press **Run connection test**. It asks TikTok for the shop, one order and one product and lists which **field names** come back (never the values).

## How it stays safe

| Point | How |
|---|---|
| Tokens | Stored encrypted in the database; the key is made from the app secret, so a copy of the database alone cannot use them |
| Renewal | The access token is renewed automatically before it ends |
| Read-only | Only read scopes are requested; the app never changes the shop |
| Customer data | The *Customer Service* scope is not requested |
| Who | Only the owner (admin) can connect, test or disconnect |
| Off switch | **Disconnect** deletes the tokens. Uploaded data is untouched. |

## What the test tells us
If **Orders** returns fields such as the creator and the content/video ID, affiliate orders can sync without uploads. If not, keep uploading the *Affiliate orders* file and use the API for orders, status, products, returns and shipping.

## Data Sync (module 0)
**Administration → Data Sync** pulls eight datasets from TikTok into the `tt_*` tables: products and stock, affiliate orders, sample requests, videos, LIVE sessions, returns, cancellations and daily shop performance.

| Point | How it works |
|---|---|
| Schedule | Off, every 30 min, 1 hour, 3 hours, 12 hours or daily (owner sets it). Runs inside the app; nothing else to install. |
| Sync now | Any manager can press it, for everything or for one dataset |
| Safe | Rows are inserted or updated; identical rows are left alone, so running twice never duplicates. TikTok data is never written by staff, and our own data is never overwritten. |
| Rate limits | The sync paces itself, waits when TikTok says "too many requests", and uses a smaller page size if TikTok refuses one |
| Failures | A failed dataset is shown in red with TikTok's message; the others still run |
| Trust check | Compares the last 28 days of affiliate sales from the API with the uploaded files so you can see they agree before you stop uploading |
| Privacy | Only whitelisted fields are read; customer names, phones, emails and addresses never reach the database |

Test: `npm run test:sync` (uses a pretend TikTok and a `*_test` database).
