# Affiliate HQ

A web app for managing a TikTok Shop affiliate programme: see which creators perform and which don't,
find sellers who deserve more investment, and turn that into ready-to-send instructions the team can track.

## What it does

| Area | What you get |
|---|---|
| **Overview** | Affiliate GMV, orders, AOV, commission cost, cancellations – each vs. the previous period. Sales by source (creator video, creator LIVE, showcase, external traffic, **brand LIVE**, organic) across the whole shop, plus auto-written key findings. |
| **Opportunities** | Creators grouped by what they need next (see below) with the reasoning, an estimated uplift and a copy-ready message. |
| **Action centre** | Work queue ranked by priority: assign, mark sent/done/dismissed, add notes. Re-generated from fresh data after every import; work already done is never overwritten. |
| **Content** | How old are the videos that sell (evergreen dependence), evergreen winners, best posting times, hashtags that convert, top videos. |
| **Samples** | **Tracker**: every free sample as a creator card – shipped → delivered → posted timeline, SKU (bundles broken into their items), videos posted, LIVEs, views and sales from the new content – plus a "what to do next" queue with estimated value: *chase*, *posted but not selling*, *performing – ask for more content*, *send more samples*, *old content still selling*, *stop samples*. WhatsApp links with a ready message. **Scorecard**: compare creators (every column sortable). A date filter at the top limits the Samples pages to samples approved in that range, and a bar shows which files they need and how fresh they are. **Products**: which sampled SKUs convert. Plus TikTok's own sample report. |
| **Affiliates Overview** | One table with every affiliate found in your files: TikTok link, WhatsApp, Video or LIVE, every SKU received as a sample with its own orders, GMV and source (Video / LIVE / Both), total GMV, result segment and the action to take (more content, more samples, chase…) plus samples to offer. A "Comes from Data" box shows which file feeds what and how many affiliates have a WhatsApp number. Open a row for the per-SKU details. **Export to Excel** gives three sheets: affiliates, sales by SKU and samples. |
| **Products / Orders** | Product performance and under-promoted products; shop-wide cancellations (COD vs. online), payments, states, delivery. |
| **Data hub** | Drag-and-drop the TikTok exports, your SKU / bundle lists and the staff sheet. File type is detected automatically; period is read from the filename. |
| **Settings** (admin) | Team and roles, recommendation thresholds, brand-owned accounts. |

Roles: **admin** (everything), **affiliate manager** (upload data, work actions), **viewer** (read-only). WhatsApp numbers are personal data: only admins and users an admin ticks "Can edit WhatsApp" in Settings can edit or upload them.

### Segments

`Star` · `Winner, posts too little` · `Rising` · `New seller` · `Steady` · `Views, few sales` · `Slipping` · `Gone quiet` ·
`Sample, no content` · `Untapped reach`. Thresholds are percentile-based and editable in Settings.

### Free samples – how the tracker works

TikTok has no sample export, but free samples appear in the **All orders** export as RM 0 orders with no payment method,
including shipped/delivered times and tracking. **Samples come only from there** – nothing is typed in by hand.

1. **Creator** – TikTok masks the receiver (`p***ha_love`). The visible first letter and ending are matched against known
   creators (those TikTok says received samples first). Only a single match is accepted; otherwise the sample shows under
   *Receiver not matched* and staff type the TikTok username once (it applies to every sample from that receiver).
2. **Posting check** – a sample counts as *posted* if, after delivery, the creator has a video with that product (Video analysis –
   it lists videos even with zero sales), a new video already selling in orders, LIVE sales, or TikTok's sample analysis reports
   content with samples. Until delivery + 7 days (Settings) it is *waiting*; after that with no content it is *not posted – chase*.
3. **Posted vs selling** – a posted sample with no orders is shown as *Posted – no orders yet*, so "no content" and "no sales" are
   never confused. Sales only count content made after the sample arrived.
4. **Next steps** – each creator gets one verdict (chase, coach, ask for more content, send more samples, fresh video, stop) with a
   cautious value estimate and a WhatsApp message; the same items appear in the Action centre.
5. **The one manual step**: add each creator's WhatsApp number (inline in the tracker or on the creator's page). The staff sheet can
   bring in existing numbers, notes and LIVE/video approach – it is not used for samples.

### Files to upload

| File | Where | How often |
|---|---|---|
| Affiliate orders, All shop orders | Seller Center → Orders | weekly |
| Creator list, Transaction analysis, Video analysis, Sample analysis, Product list | Affiliate Center | weekly / monthly (period in the filename) |
| SKU list + bundle (SET) lists | your own workbooks | when SKUs change |
| Staff affiliate sheet | your own sheet (.xlsx) | once, to bring in WhatsApp numbers |
| WhatsApp numbers | simple file: Username + WhatsApp (download the "affiliates without a number" file in the Data hub, fill it in, upload it back) | when you add numbers – only empty numbers are filled, saved numbers are kept |

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

Report files may carry the year in the name (e.g. `1st_mar_2025_to_31_mar_2025`); without a year the app guesses it from your latest orders and warns you.

After pulling a new version, run `npm install` and `npm run db:push -- --force` (adds new columns; hand-logged and staff-sheet samples from older versions are removed) before `npm run dev`.

## Notes and limits

- Insights come from TikTok's own exports; attribution windows mean creator totals differ slightly from order totals.
- Uplift figures are **conservative estimates** (extra videos × the creator's historic GMV per selling video × a confidence factor). They are for prioritising, not forecasting.
- The app doesn't send messages; it writes them. Copy them into TikTok or WhatsApp, then mark the action sent.
- Phase 2 ideas: before/after impact tracking per action, TikTok Shop API sync, AI-personalised messages, alerts.

## Daily workflow (Today's Work)

The Action centre was replaced by **Today's Work**: staff press *Contacted*, *Promised date*, *Needs help* or *Pause*;
follow-ups are scheduled automatically (Settings → Daily workflow; defaults 3 days after contact, the day after a promised date).
Staff actions are an append-only log (`staff_events`) – undo only marks them reverted. Promises live in `commitments`,
system suggestions in `recommendations`; neither imports nor "Refresh recommendations" touch staff work.
Guides: `docs/STAFF-GUIDE.md`, `docs/OWNER-GUIDE.md`, `docs/UPLOAD-GUIDE.md`; rules in `docs/DATA-AUDIT.md`; upgrading in `docs/UPGRADE.md`; redesign report in `docs/REDESIGN.md`.

### Tests

```bash
createdb affiliate_test
DATABASE_URL=postgres://…/affiliate_test npx drizzle-kit push --force
DATABASE_URL=postgres://…/affiliate_test npm run test:workflow
DATABASE_URL=postgres://…/affiliate_test npm run test:regressions   # run against a freshly created test database
DATABASE_URL=postgres://…/affiliate_real npm run test:real -- /path/to/real/exports   # isolated DB ending _test or _real
```

Upgrading a database that already has data: see `docs/UPGRADE.md` (`npm run db:migrate`, never `db:push`).

The script refuses to run unless the database name ends in `_test` (it wipes it) and only creates clearly labelled
synthetic records (`zz_test_*`). Never point it at production.
