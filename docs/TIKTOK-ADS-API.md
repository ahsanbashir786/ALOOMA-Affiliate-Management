# TikTok Ads (GMV Max) connection

Reads your **GMV Max** campaigns, creatives and daily results from **TikTok API for Business** (the "Marketing API"). It is a different service from TikTok Shop: its own portal, its own app, its own keys and its own login. For now it is **read-only**; the system cannot change anything in your ads.

## One-time setup

1. **App** in business-api.tiktok.com/portal → *My Apps*. Permissions (scope): Ad account information, Ads management (Campaign, Ad group, Ad, Change log, GMV Max…), Reporting, TikTok Shop, and the Creative management parts you asked for.
2. **Redirect URL** in the app: `http://localhost:3000/api/tiktok-ads/callback` for your PC. On the server use `https://YOUR-DOMAIN/api/tiktok-ads/callback`. **Settings → Connection → Ad Management → Redirect address** shows the exact address the system will send; it must be identical (no extra slash).
3. **Private settings.** Add these to the `.env` file (never paste the secret in chat, email or GitHub), then restart the app:
   ```
   TIKTOK_ADS_APP_ID=your app ID
   TIKTOK_ADS_APP_SECRET=your app secret
   ```
   `TIKTOK_ADS_REDIRECT_URI` is only needed if the address must differ from the website's own.
4. **Settings → Connection → Ad Management (GMV Max) → Connect TikTok Ads.** Log in with the TikTok For Business account that owns the ads and tick your ad account.
5. Press **Check Connection**. It asks TikTok for the ad accounts, the GMV Max shops, the campaigns and one week of results, and shows **which fields came back and what the first record looks like**. Nothing is saved.
6. Open **Data Sync → Ads Management** and press **Sync Now**.

Your TikTok Shop must be linked to the ad account in TikTok Ads Manager, otherwise GMV Max returns no shop and there is nothing to read.

## What is synced (Data Sync → Ads Management)

| Card | What it holds | Table |
|---|---|---|
| Ad Accounts | Name, currency, time zone, status of each ad account the login covers | `ads_advertisers` |
| Shops | The TikTok Shop(s) linked to each ad account for GMV Max | `ads_stores` |
| GMV Max Campaigns | Name, status, type (product / LIVE), budget, ROAS target, dates | `ads_campaigns` |
| Campaign Results | One row per campaign per day: cost, net cost, orders, sales (gross revenue), ROI, cost per order | `ads_campaign_daily` |
| Creative Results | One row per creative (video) per day: cost, orders, sales, ROI, title, account | `ads_creative_daily` |
| Product Results | One row per product per day: cost, orders, sales, ROI | `ads_product_daily` |

Every row also keeps **TikTok's full answer** (`raw` column), so a field we did not map yet is never lost and can be added later without a new sync. The card's **What TikTok sent** shows the first record of the last good run.

## How the sync stays correct

| Point | How it works |
|---|---|
| Schedule | Off, every 30 min, 1 hour, 3 hours, 12 hours or daily (owner sets it). Runs inside the app. |
| Never duplicates | Rows are inserted or updated by their key; identical rows are left alone. Running twice changes nothing. |
| Restated numbers | TikTok adjusts ad numbers after the day ends. Every sync reads the **last 14 days** again, and once a day the **last 60 days**, so a corrected day is picked up. |
| First sync | Reads history back 180 days in 30-day pieces, newest first, and stops after three empty months in a row. **Re-Read History** repeats it. If TikTok refuses a window as too old, the note says where its history stops. |
| Steps in order | Accounts → shops → campaigns → results. If an early step fails (for example the login is refused), the later steps are skipped, not run on stale data. |
| One account failing | If TikTok refuses one ad account for its own reasons, the others still sync and the card says which was skipped. |
| Rate limit | The sync waits when TikTok says "too many requests" and tries again (up to six times); TikTok's own hiccups are retried three times. Sign-in problems are never retried. |
| Unreadable data | If TikTok sends result lines but none of the numbers can be read (a renamed field), the dataset **fails with the field names it saw** instead of saving empty rows. |
| Dimensions | For creative and product results the system tries TikTok's allowed dimension and metric choices in order and remembers the first that works; the card says which one it used. |
| Safe restarts | A restart marks any run left "running" as interrupted, so nothing waits forever. Already-saved data is untouched. |
| Time zone | Days are the days in the ad account's own time zone, as TikTok reports them. |
| Privacy | Ad data only. No customer data is involved. |

## Safety

| Point | How |
|---|---|
| Login | Stored encrypted in the database; the key is made from the app secret, so a copy of the database alone cannot use it. TikTok Ads logins do not expire; if TikTok stops accepting it, the screen says **Reconnect**. |
| Read-only | The system only reads. (Creating boosts from the app is a later step, with a spending limit and a confirm box.) |
| Who | Only roles with **Settings: Connection** can connect, check or disconnect. Roles with **Data Sync** can press Sync Now. |
| Off switch | **Disconnect** deletes the login. Synced data stays. |

## If something fails

| Message | Meaning / what to do |
|---|---|
| "Access token is invalid…" | TikTok no longer accepts the login. Press **Reconnect** in Settings. |
| "auth_code is invalid" | The connect link expired or was used twice. Press **Connect** again. |
| Redirect address mismatch on TikTok's page | The address in the TikTok app differs from the one shown in Settings. Make them identical. |
| "No GMV Max shop is linked…" | Link the TikTok Shop to the ad account in TikTok Ads Manager. |
| "none of the numbers … could be read. Fields sent: …" | TikTok renamed a field. Send the field names; the mapping is one line to change in `src/lib/tiktok-ads/map.ts`. |
| "Invalid dimension / metric" on creative or product results | TikTok does not allow that combination for your account. The sync tries the next one; if all fail the message is shown. |

Test: `npm run test:ads` (a pretend TikTok and a `*_test` database). Browser check: `node scripts/fake-ads-api.js`, start the app with the `TIKTOK_ADS_*` variables shown at the top of that file, then `node scripts/e2e-ads.js`.

## Not verified yet

The field and endpoint names for GMV Max were taken from TikTok's public documentation and developer libraries, not from a live account. **Check Connection** and the **What TikTok sent** boxes show the real answers on first use; if anything differs, only the small mapping in `src/lib/tiktok-ads/map.ts` and the endpoint list in `src/lib/tiktok-ads/sync.ts` need a change.
