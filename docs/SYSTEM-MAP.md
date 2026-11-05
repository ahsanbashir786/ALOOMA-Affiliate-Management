# System map

Five screens, all built on the TikTok Data Sync. No uploaded files.

| Menu | Address | What it is | Doc |
|---|---|---|---|
| Execution Plan | `/execution` | The daily work: actions written from the product numbers, assigned and ticked off | [EXECUTION-PLAN.md](EXECUTION-PLAN.md) |
| Affiliate Data | `/creators`, `/creators/<name>` | Every creator, a line per product, status and action, owner, contacted; creator profile and side panel | [CREATORS.md](CREATORS.md) |
| Product Analysis | `/products`, `/products/<key>` | Is each of the 13 products growing or slipping, and why | [PRODUCTS.md](PRODUCTS.md) |
| Data Sync | `/sync` | Pulls orders, products, videos, LIVEs, samples, returns from TikTok; schedule and health | [TIKTOK-API.md](TIKTOK-API.md) |
| Users & Roles | `/users` | People, roles and the permission matrix (dynamic, stored in `roles` / `role_permissions`) | `users` |
| Settings | `/settings` | TikTok connection and test | `settings` |

## How the data flows
TikTok API → `tt_*` tables (Data Sync) → product analysis (`lib/products`) and creator rows (`lib/creators`) → Execution Plan rules (`lib/execution`) → tasks in `ep_*` tables.
The plan is written after every sync; opening a screen only reads.

## Code layout
- `src/app/(app)/<screen>` the five screens; `src/app/actions` server actions; `src/app/api` exports, search, TikTok callbacks
- `src/lib/creators` creator rows, status engine, profile; `src/lib/creators/workflow` contacted/promised events and the side panel data
- `src/lib/products` product analysis and rules; `src/lib/execution` action rules, history, plan writer
- `src/lib/tiktok` API client, sync engine, scheduler
- Tests: `scripts/test-*.ts` (database) and `scripts/e2e-*.js` (browser); `scripts/perf-pages.js` times the screens
