# Speed and load

## What makes the screens fast

- **Prepared order lines (`tt_aff_lines`, migration 0044).** Each affiliate order line with its Malaysian day, content type, value and "counts"
  flag (not returned, not cancelled) is worked out once after new data arrives, instead of on every view. `ensureAffLines()` (src/lib/creators/aff-lines.ts)
  keeps it in step with `tt_affiliate_order_lines` and `tt_cancellations`: a tiny check when nothing changed, a rebuild of a second or two after a sync
  (one at a time across processes, by advisory lock). The product (one of the 13) is still joined live, so a mapping change shows at once.
  Every screen that reads `TL` calls it first. Date filters use the indexed `day` column (`kd("tl.created_at")` → `tl.day`).
- **Orders counted in one pass.** The two creator queries roll lines up per order and then count, instead of one `count(distinct)` sort per figure.
- **Only the date-dependent parts are rebuilt.** On Creators, 10 of the 14 queries do not depend on the chosen dates; they are kept while the data
  has not changed, so a new date range re-runs only 4.
- **Memory cache keeps the last 40 results per screen** (least recently used goes first; it no longer empties everything).
- **Database connection:** JIT off and 16 MB sort memory per connection (src/db/index.ts). JIT alone doubled short report queries.
- **No timer rebuilds.** The warm-up rebuilds the heavy screens only when new data has arrived. Product names are re-checked only when listings,
  orders, sample requests or the product map change.
- **No chart or animation libraries.** One small SVG bar chart (`components/viz/bar-chart.tsx`) and CSS animations replace recharts and framer-motion.
- **Visible loading.** Any date or filter change shows the top bar at once and fades the page until the new one arrives.

## Server layout (docker-compose)

- `app` (APP_ROLE=web): the screens, the alert checks and the warm-up.
- `worker` (APP_ROLE=worker, same image): TikTok Shop, TikTok Ads and Shopee syncs, and preparing the order lines right after each sync.
  Without APP_ROLE (one container, local development) one process does both.
- `db`: PostgreSQL tuned for a 2–4 GB server (shared_buffers 256MB, effective_cache_size 1GB, work_mem 16MB, jit off, random_page_cost 1.1).

## Measuring

`DATABASE_URL=… SWR_OFF=1 npx tsx --conditions=react-server scripts/perf-data.ts` times the heavy loaders without the cache.
On a 210,000-line copy of the demo data: Creators for a date range 2.0 s → 0.3–0.5 s (a range seen before: 0.002 s), Command 2.9 s → 0.7 s,
Content 2.5 s → 0.7 s, Products 0.8 s → 0.3 s. Results were compared creator by creator, product by product: identical.
