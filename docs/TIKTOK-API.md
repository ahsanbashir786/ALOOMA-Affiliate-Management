# TikTok Shop connection

Lets the app read orders, products, returns and shipping straight from TikTok (read-only). 

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
| Off switch | **Disconnect** deletes the tokens. Synced data is untouched. |

## What the test tells us
## Data Sync (module 0)
**Administration → Data Sync** pulls eleven datasets from TikTok into the `tt_*` tables: products and stock, affiliate orders, sample requests, **shop orders** (every order, reduced to status, dates, totals and line prices; no customer data), **sample orders** (shipping status and delivery dates of the orders behind sample requests; no customer data), **collaborations** (commission offered, stock, creators joined), videos, LIVE sessions, returns, cancellations and daily shop performance.

| Point | How it works |
|---|---|
| Schedule | Off, every 30 min, 1 hour, 3 hours, 12 hours or daily (owner sets it). Runs inside the app; nothing else to install. |
| Sync now | Any manager can press it, for everything or for one dataset |
| Safe | Rows are inserted or updated; identical rows are left alone, so running twice never duplicates. TikTok data is never written by staff, and our own data is never overwritten. |
| Speed | The first sync reads history in 30-day date windows, three at a time, and stops after three empty windows. Later syncs read only the last few days (a full re-read happens once a day to catch status changes). Before using date windows the sync checks that TikTok really applies the filter; if TikTok ignores or rejects it, a slower safe scan is used instead. Up to three datasets run side by side. |
| History | The very first sync reads the whole history back to 1 Mar 2025 (orders, affiliate orders, returns and cancellations in 30-day windows; videos, LIVE and shop performance in 28-day windows, as far back as TikTok allows, about 6 months). After that **Sync now** and the auto-sync read only what is new since the last sync (plus 2 days), or the last 90 days when the last sync is more than a day old. There is no history picker on the screen any more; each card also has its own small sync button for just that dataset |
| Rate limits | The sync paces itself, waits when TikTok says "too many requests", and uses a smaller page size if TikTok refuses one |
| Failures | A failed dataset is shown in red with TikTok's message; the others still run |
| Privacy | Only whitelisted fields are read; customer names, phones, emails and addresses never reach the database |

Test: `npm run test:sync` (uses a pretend TikTok and a `*_test` database).

## Data Sync cards (names and what they hold)
| Card | What it holds |
|---|---|
| Products | Your listings (the big number counts products; the number of SKUs is under it). Stock is not shown: the same item sits in several listings and sets are made from singles, so a sum would double count. Real stock comes with Demand planning, from the single items and the set recipes |
| Total Orders | Every shop order: status, dates, totals, shipping (no buyer data) |
| Affiliate Orders | Sales made through creators, one row per order line, with the video or LIVE ID |
| Affiliate Samples Issued | The shipments behind approved sample requests: delivery status and dates. Counts only those orders, not all orders |
| Promotion Videos | Videos that promoted your products (from Shop Analytics), with views, sales, linked products |
| Promotion LIVE Sessions | LIVE streams that promoted your products |
| Open Collaboration | Open collaboration offers: commission, period, creators joined, stock |
| Affiliate Sample Requests | Creators' requests for free samples (status, creator, product, SKU) |
| Return Orders / Cancelled Orders | Return and refund requests / cancellations |
| Shop Performance | Shop totals, one row per day (sales, orders, buyers, units, refunds, page views) |

## Data Sync screen: history and health
- **Sync history** groups the runs: one line per sync (Full sync, or the one dataset a card's button synced), who started it (Automatic or a name), when, how long it took, and the result (records updated, skipped, failed). Open a line to see every dataset in it.
- **Data health** says whether any dataset failed or is over a day old, how far the order data reaches, whether TikTok skipped records, and whether auto-sync is on.

## Finance data (synced, no screen)

The Finance screen was removed. The settlement data behind it is still synced from TikTok Shop (scope `seller.finance.info`; connect TikTok Shop again after switching the scope on). Three Data Sync cards: **Finance Statements** (`GET /finance/202309/statements`: one per day with settlement, fees, payment status and payment time), **Finance Transactions** (`GET /finance/202501/statements/{id}/statement_transactions`: every order or adjustment with its fee breakdown) and **Unpaid Orders** (`GET /finance/202507/orders/unsettled`). Tables `tt_fin_statements`, `tt_fin_transactions`, `tt_fin_unsettled`. Get Payments is not available in Malaysia. Amounts keep TikTok's signs (a fee is negative). A new profit screen will be designed from these.

## API versions that changed

TikTok moves some calls to a newer version and stops serving the old one ("Invalid API version", code 36009004). Current versions used: Search Sample Applications `/affiliate_seller/202508/sample_applications/search` and Search Open Collaborations `/affiliate_seller/202412/open_collaborations/search` (both found in TikTok's own API reference). Sample applications now allow at most 50 per page; the sync already steps down from 100 to 50 by itself.

## Affiliate Seller APIs for Creator Outreach (read from TikTok's own API reference)
Checked in TikTok's Partner Center docs (API Reference → Affiliate seller). Paths are on `open-api.tiktokglobalshop.com`; the app's current connection asks for read scopes only.

| What we want | TikTok API | Method and path | Scope the app needs |
|---|---|---|---|
| See sample requests (already synced) | Search Sample Applications | `POST /affiliate_seller/202508/sample_applications/search` | `seller.affiliate_collaboration.read` (already used) |
| **Approve or reject a sample request** | Review a Sample Application | `POST /affiliate_seller/202507/sample_applications/{application_id}/review` with `review_result` APPROVE or REJECT, and `reject_reason` (NOT_MATCH, OFFLINE, OUT_OF_STOCK, OTHER) when rejecting | `seller.affiliate_collaboration.write` (**new, write**) |
| Follow delivery of approved samples | Search Sample Application Fulfillments | `POST /affiliate_seller/202409/sample_application_fulfillments/search` (version per the docs page) | read |
| **Find new creators** | Search Creators in Creator Marketplace | `POST /affiliate_seller/202608/marketplace_creators/search` (keyword, GMV range, units sold range, category, follower demographics, content performance; data is for the last 30 days) | `seller.creator_marketplace.read` (**new, read only**) |
| Invite a creator to sell a product | Create Target Collaboration | `POST /affiliate_seller/202508/target_collaborations` (name, message, end time, up to 100 products with commission rate, up to 50 creators by open ID, seller contact, free sample rule) | `seller.affiliate_collaboration.write` (**new, write**) |
| Check the weekly invitation allowance | Get Weekly Creator Outreach Quota / Check Creator Outreach Eligibility | `GET /affiliate_seller/202607/creator_outreach/quota`, `POST /affiliate_seller/202610/creator_outreach/eligibility/check` | read |
| Message a creator | Get or Create Creator Conversation, Send IM Message | `POST /affiliate_seller/202508/conversations`, `POST /affiliate_seller/202412/conversations/{conversation_id}/messages` | `seller.affiliate_messages.write` (**new, write**) |

Notes: a sample request can only be approved or rejected while it is PENDING, and the API says "in an open collaboration". An approval cannot be undone through the API. The docs pages do not show per-country availability without choosing a region, so **Malaysia support must be confirmed by calling the read-only search once the scope is on**.
