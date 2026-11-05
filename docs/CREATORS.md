# Module 1 – Creators

Everyone who sells or is sampled for ALOOMA, built only from the TikTok Data Sync (no uploaded files).

## Screens
| Screen | Address | What it does |
|---|---|---|
| Creators table | `/creators` | One row per creator, one line per product (sampled, or sold in the last 90 days). Instant filters, sorts, period (28 days / 90 days / 1 year / all), Excel export |
| Creator profile | `/creators/<username>` | Header (tier, score, followers, owner, WhatsApp, TikTok), 6 key numbers, weekly sales chart (video vs LIVE), score breakdown, products with status and action, samples, latest videos, LIVE sessions and orders |
| Side panel | click a name, or "Message / Record Action" | Messages to send, record what happened, history. Its numbers now come from the same synced data |
| Menu | left | Grouped (Overview, Affiliates, Shop operations, Reports, Earlier version, System); can shrink to icons |

## Where each number comes from
| Number | Source |
|---|---|
| Sales (GMV) | `tt_affiliate_order_lines`: unit price × quantity. **Not counted:** lines fully returned, or whose order has a successful cancellation |
| Orders, V/L split | distinct valid orders by content type (video / LIVE) |
| Videos per product | `tt_videos` whose product list contains the product |
| Followers, creator GMV, fulfilment % | newest `tt_sample_requests` row of the creator (TikTok's own figures) |
| Sample sent | request with an order, not rejected/expired/cancelled |
| Sample delivered | `tt_orders.delivered_at` (or delivered/completed status) |
| Sample result | **Posted** = a video of that product, or a sale of it, after delivery; **Not posted** = nothing 14 days after delivery; otherwise **Waiting** |
| Status and action | the one shared rule set (`creatorStatus`) – unchanged |
| Owner | table `creator_owners` (managers can change; latest wins) |

## Filters, dates and bulk actions
- Filters (all inline, instant): Product, Status, Owner, All Tiers, All Content Types, All Samples Type, Follow-up Type (Contacted / Not Contacted), Contact Source (WhatsApp / No WhatsApp), Action chips, sort.
- **Date range** (button, right of the Action chips): Last 7 days, Last 1 month, Last 3 months, All time, or any From and To day. It changes only **Orders, Videos, GMV and Total GMV** (and sorting by them). Creators are not hidden; status, action, tier, score and the five top boxes always use the latest 28 days.
- **Top boxes** show the change as a percentage and a number ("▲ 2% (+5)"). Creators shows "+N new" (first order, video or LIVE in the last 28 days). To do and Not owned are saved once a day (`creator_daily_counts`), so their change appears from the day after the first visit and compares with 28 days ago once there is that much history.
- **Bulk actions** (managers): tick creators (or the whole page, then "Select all N matching") → Assign owner (asks to confirm the number, one Undo) or Mark contacted (up to 200 at a time, one Undo).
- Steady creators who post fewer than 2 videos in 28 days get the action **Push**.

## Creator score (0–100)
Sales 35 + Posting 25 + Reliability 15 + Consistency 15 + Reach 10. Gold 70+, Silver 45+, Bronze 20+, else Starter. Hover the tier badge to see the breakdown.
- Sales: where the last-28-day sales rank among everyone who sold
- Posting: videos plus LIVE sessions in the last 28 days (8 = full 25 points)
- Reliability: samples that ended in a post (falls back to TikTok's fulfilment %)
- Consistency: weeks with a sale out of the last 8
- Reach: followers, log scale (1k = 0, 1M = full)

## Notes
- Pending sample requests are counted ("N sample requests") but are not product lines; approving needs a write permission we do not have yet (Module 3, Samples).
- The loaded table is cached until the next sync or staff action, so pages stay fast with 100,000+ order lines.
- Old pages (Affiliate Data (old), analysis, Samples, Segments) still read uploaded files; they sit under "Earlier version" until their module is rebuilt.
- Demo data for testing only: `DATABASE_URL=…_test npx tsx scripts/seed-creators-demo.ts` (refuses any database not ending in `_test`). Tests: `npm run test:creators`.

## Products (the 13) and SKU Sampled
Every list in the Creators module uses ALOOMA's 13 products in the owner's order, never TikTok's long titles:
Mattress Protector Non-Waterproof, Waterproof, Quilt Comforter, Pillows, Bedsheet Non-Waterproof / Waterproof (single), Bedsheet Non-Waterproof / Waterproof (set), Cotton Towel, Coral Fleece Towel, Mattress Protector Non-Waterproof / Waterproof (Exclusive), Pillow Protectors.

- **Automatic, no screen.** Which product a TikTok listing is comes from its title and from what it mostly sells (`src/lib/products/suggest.ts`), refreshed whenever the Creators data is rebuilt. Not-ALOOMA listings (toys) are left out everywhere. A listing that cannot be recognised shows as "Unmapped product" at the end of the list.
- **SKU Sampled column.** It lists only the SKUs that were sent to her as samples for that product, each with the date it was given (delivered date; "shipped" when it has not arrived). The same SKU sent twice shows `×2` with both dates; two different SKUs of one listing are listed one under the other. A product she only sells (no sample) shows "–". The SKU comes from the sample request's SKU ID (which says which listing it belongs to), so it lands on the right product; a SKU the catalogue no longer knows shows the variation name from the request.
- **There is no "Sample sent / Sells without a sample" label.** A creator can use one sample while also promoting another listing, so the screen shows the facts (which SKU, when) instead of a verdict. Status and Action still use the sample requests (shipped, posted or not) as before.
- **Overdue samples.** TikTok's `UNFULFILL_CANCELLED` (portal: Overdue) is a shipped sample. Posted = her video linking the product, or her sales of it, after delivery (orders reach back further than the video list); otherwise Not posted.
- **Samples tally.** A sample order never names the creator (its Buyer Username is not her creator handle), so only a sample request links a creator to a sample order. Data Health shows "N of M sample orders belong to a creator"; the rest were sent without a request or TikTok did not return the request.

## Videos that sold
- **Videos** = TikTok's video list plus every video that produced a sale (from the order lines, which reach back to March 2025). The extra ones show as "+N from sales". Old videos that sold nothing may still be missing. The 28-day posting count used by status and score still uses only videos from the list (it needs a posting date).
