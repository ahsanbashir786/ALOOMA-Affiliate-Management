# Affiliate HQ

A web app for managing a TikTok Shop affiliate programme: see which creators perform and which don't,
find sellers who deserve more investment, and turn that into ready-to-send instructions the team can track.

## What it does

| Area | What you get |
|---|---|
| **Overview** | Affiliate GMV, orders, AOV, commission cost, cancellations – each vs. the previous period. Sales by source (creator video, creator LIVE, showcase, external traffic, **brand LIVE**, organic) across the whole shop, plus auto-written key findings. |
| **Creators** | Every creator with segment, GMV trend, posting rhythm, cancellations, followers; profile page with sales over time, products, top videos, samples, notes and history. |
| **Opportunities** | Creators grouped by what they need next (see below) with the reasoning, an estimated uplift and a copy-ready message. |
| **Action centre** | Work queue ranked by priority: assign, mark sent/done/dismissed, add notes. Re-generated from fresh data after every import; work already done is never overwritten. |
| **Content** | How old are the videos that sell (evergreen dependence), evergreen winners, best posting times, hashtags that convert, top videos. |
| **Products / Samples / Orders** | Product performance and under-promoted products; sample funnel and ROI; shop-wide cancellations (COD vs. online), payments, states, delivery. |
| **Data hub** | Drag-and-drop the TikTok exports. File type is detected automatically; period is read from the filename. |
| **Settings** (admin) | Team and roles, recommendation thresholds, brand-owned accounts. |

Roles: **admin** (everything), **affiliate manager** (upload data, work actions), **viewer** (read-only).

### Segments

`Star` · `Winner, posts too little` · `Rising` · `New seller` · `Steady` · `Views, few sales` · `Slipping` · `Gone quiet` ·
`Sample, no content` · `Untapped reach`. Thresholds are percentile-based and editable in Settings.

## Data model in one paragraph

Order exports are **transactional** (upserted by order + SKU, so overlapping weekly uploads are safe and trends are exact).
Report exports (creator list, transaction analysis, video analysis, sample analysis, product list) are **dated snapshots**; a snapshot
for the same type and period replaces the previous one. Analytics pick the snapshot that overlaps the selected period the most.
"Valid" sales exclude cancelled and returned lines using the shop-wide order status; cash-on-delivery that hasn't been collected yet
(TikTok's "Unpaid by customer") still counts as a sale.

## Run it

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npm run db:push               # creates the tables
npm run dev                   # http://localhost:3000 → create the first admin on /setup
```

Then open **Data hub** and upload your exports. For a quick start with a folder of exports:
`npm run import:sample -- ./path/to/exports`.

Production: `npm run build && npm start` (set `DATABASE_URL`; put it behind HTTPS).

## Notes and limits

- Insights come from TikTok's own exports; attribution windows mean creator totals differ slightly from order totals.
- Uplift figures are **conservative estimates** (extra videos × the creator's historic GMV per selling video × a confidence factor). They are for prioritising, not forecasting.
- The app doesn't send messages; it writes them. Copy them into TikTok or WhatsApp, then mark the action sent.
- Phase 2 ideas: before/after impact tracking per action, TikTok Shop API sync, AI-personalised messages, alerts.
