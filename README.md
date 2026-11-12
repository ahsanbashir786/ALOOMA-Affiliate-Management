# ALOOMA Affiliate Management

A web app for running a TikTok Shop affiliate programme. Everything comes from the TikTok Shop API (read-only); nothing is uploaded by hand.

## The five screens

| Menu | What it does |
|---|---|
| **Execution Plan** | Actions written from the product numbers: win back creators who went quiet, ask for new videos, chase unposted samples, push LIVE, and more. Assign people, set dates, tick creators off, see team progress. |
| **Affiliate Data** | Every creator with a line per product, status and action, owner, and contacted tracking. Creator profile and side panel. Excel export. |
| **Product Analysis** | Is each of the 13 products growing or slipping, and why (new, recent or old content, LIVE, creators, samples, returns). |
| **GMV Max** | Eight tabs. **Ads Today** (spend, sales, orders, ROI, alerts). **Boost Picks**: every video that was ever part of your ads, judged on all of its history, so golden videos that GMV Max stopped or never started are found. **Batch Planner** (the list for a Seller Center batch, or Boost All through the app). **Boost Log** (what happened after you boosted). **Campaign Health**, **Product Performance**, **Creator Scoreboard**, and a page for each video. Reads only, except **Boost From The App**: the owner can create and stop a creative boost for one video (off until switched on in Settings, with spending limits, a confirm box and a log). Batch boosts are still made in TikTok Ads Manager. |
| **Data Sync** | Two tabs. **Affiliate** pulls orders, products, videos, LIVEs, sample requests and returns from TikTok Shop. **Ads Management** pulls GMV Max campaigns, creatives and daily results from TikTok Ads. Both run on a schedule and show what is fresh and what failed. |
| **Settings** | **Connection** (two tabs: Affiliate / TikTok Shop, and Ad Management / GMV Max), **User Management** (people, roles and which screens each role can open; Admin always has everything; screens without permission stay in the menu with a lock and show a Permission Denied page), **Storage** and **System Alerts** (coming later). |

Roles are made in the app (Settings → User Management). The only built-in role is **Admin**, which always opens every screen. For any other role you choose which of the six screens it can open; that is the only permission.

More: [System map](docs/SYSTEM-MAP.md) · [Execution Plan](docs/EXECUTION-PLAN.md) · [Affiliate Data](docs/CREATORS.md) · [Product Analysis](docs/PRODUCTS.md) · [Profit And Loss](docs/PROFIT.md) · [Stock And Costing](docs/STOCK.md) · [TikTok connection](docs/TIKTOK-API.md) · [Deploy](docs/DEPLOY.md)

## Run it

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env        # set DATABASE_URL and the TikTok app keys
npm install
npm run db:migrate          # creates or upgrades the tables
npm run dev                 # http://localhost:3000, create the first admin on /setup
```

Then open **Settings → Connection**, connect TikTok Shop (and TikTok Ads, see [docs/TIKTOK-ADS-API.md](docs/TIKTOK-ADS-API.md)), and press **Sync Now** in **Data Sync**.

Production: `npm run build && npm start` (behind HTTPS). On a VPS see [docs/DEPLOY.md](docs/DEPLOY.md). Always take a backup before `db:migrate` (`scripts/backup.sh`).

## Tests

Use a throw-away database whose name ends in `_test`.

```bash
createdb affiliate_test
DATABASE_URL=postgres://…/affiliate_test npm run db:migrate
DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/seed-creators-demo.ts   # demo data
DATABASE_URL=postgres://…/affiliate_test npm run test:creators      # also test:products, test:execution, test:sync, test:tiktok, test:status
node scripts/e2e-execution.js    # browser checks, app running on :3100 (also e2e-products.js, perf-pages.js)
```

Tests wipe their database. Never point them at production.
