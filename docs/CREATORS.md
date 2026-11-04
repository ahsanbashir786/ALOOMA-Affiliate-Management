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

## Creator score (0–100)
Sales 40 + Reliability 25 + Consistency 20 + Reach 15. Gold 70+, Silver 45+, Bronze 20+, else Starter. Hover the tier badge to see the breakdown.
- Sales: where the last-28-day sales rank among everyone who sold
- Reliability: samples that ended in a post (falls back to TikTok's fulfilment %)
- Consistency: weeks with a sale out of the last 8
- Reach: followers, log scale (1k = 0, 1M = full)

## Notes
- Pending sample requests are counted ("N sample requests") but are not product lines; approving needs a write permission we do not have yet (Module 3, Samples).
- The loaded table is cached until the next sync or staff action, so pages stay fast with 100,000+ order lines.
- Old pages (Affiliate Data (old), analysis, Samples, Segments) still read uploaded files; they sit under "Earlier version" until their module is rebuilt.
- Demo data for testing only: `DATABASE_URL=…_test npx tsx scripts/seed-creators-demo.ts` (refuses any database not ending in `_test`). Tests: `npm run test:creators`.
