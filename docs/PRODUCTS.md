# Products Module

Shows, for each of the 13 products (owner's order), whether it is growing or lagging and **why**.
Built only on synced TikTok data (`tt_affiliate_order_lines`, `tt_videos`, `tt_video_windows`, `tt_sample_requests`, returns/cancellations).

## Period
Default: last 28 days against the 28 days before. Same date picker as Creators (`?from=&to=`).

## Content age (when the sale happened vs when the video was posted)
New video: 14 days or less. Recent: 15–30. Old: 31+. Also LIVE and Product Cards.
Posting date comes from the TikTok video list; where the video list does not reach back, the first sale of that content is used and shown as "est.".

## Tags (`src/lib/products/diagnose.ts`)
Growing +15% or more · Steady · Slipping −15% or worse · Dying −50% or worse, or no new videos with falling sales · No Sales.
**Fragile**: more than 70% of video and LIVE sales come from videos older than 30 days. Otherwise Steady shows **Healthy**.
Converting video: 3 or more orders of the product within 14 days of posting (only videos posted at least 14 days before the period end are judged).

## Pages
- `/products` – cards, tag filters, sort, KPI strip.
- `/products/[key]` – why it moved, where the change came from, content freshness, new-video conversion, creators (dependency, new, nearly stopped), samples funnel, video vs LIVE, quality (returns and reasons), top content.

## Tests
`npx tsx scripts/test-products.ts` (rules and data) · `node scripts/e2e-products.js` (browser, app on :3100).
