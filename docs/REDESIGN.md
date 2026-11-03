# Redesign: working plan, implementation and validation

## Safety first (done before any change)

* Code backup: git tag `backup/pre-redesign-20261103` and branch `backup/pre-redesign` (both at the commit before this work; restore with `git checkout backup/pre-redesign`).
* Data backup: `backups/affiliate-pre-redesign.dump` (pg_dump -Fc of the existing database, kept out of git). Restore: `pg_restore --clean -d "$DATABASE_URL" backups/affiliate-pre-redesign.dump`.
* All schema changes are additive, versioned migrations (`npm run db:migrate`). No existing record is reset.

## Inventory of what existed (and was reused)

Next.js 16 / React 19 / Drizzle / Postgres app (≈14.6k lines): importers for 7 TikTok exports plus SKU and contact setup files, an event-sourced staff workflow
(`staff_events`, `commitments`, `content_decisions`, `recommendations`), sample tracker, content layer, sales attribution, Progress, versioned migrations and
two test suites. Real exports available in this session: 15 files (orders, affiliate orders, creator list, transactions ×2, video ×2, sample analysis ×2,
product list, SKU lists ×4, staff sheet) – used for import validation.

## Working plan

1. Verify the four known defects and the earlier improvements against the code (regression suite).
2. Add what the new brief needs on top of that foundation: a derived **relationship status** (separate from sample, task and commitment status), **new-creator outreach** (add a creator by hand),
   a compact graphical **daily workspace** (who / why now / action / deadline, obligations listed per creator, timelines, 1/2 indicators, expandable detail),
   **content-to-verify** and **sample-exception** queues, an **owner view** with drill-down on every figure, trends, and "decisions needing you".
3. Validate with synthetic labelled cases and the real exports in isolated databases; run type check, lint, production build and browser walkthroughs.
4. Document: staff guide, owner guide, minimum-upload guide, this report.

## What was built (on top of the existing foundation)

| Area | Result |
|---|---|
| Connected records | Creator + platform account (`creators.platform`, `source`), contacts, event-sourced outreach history, samples, commitments, content + verification evidence, per-obligation reminders, import sources and coverage. Relationship status is **derived** and separate from sample status, task status and commitment fulfilment (`workflow/relationship.ts`, limits configurable in Settings). |
| Daily workspace | Compact rows: who · relationship · colour chips · one line of evidence · every promise as its own pill with `1/2` bar and lateness · sample delivery timeline · deadline chip · quick actions · expandable details. Tabs: Today, Due, **To verify**, Samples, **Opportunities** (recruit / develop / reactivate), Scheduled, Paused. Sample exceptions are clickable chips. |
| New creators | *Add creator* (username, optional number, optional "already contacted") – no sample or export row needed. |
| Follow-up continuity | 3 days after Contacted; the day after each promise's deadline; review/pause suggested after 3 recorded contacts without a promise or new content (never claims no reply). Reminders are per obligation; pausing/rescheduling earns no credit; content resolves the obligation. |
| Owner view | Progress with "Needs your decision", stacked outcome bars (every segment links to its records), relationship distribution, 8-week trend, per-person table, honest sales-movement coverage. `/progress/records` lists the records behind any figure with the same rules. |
| Uploads | Unchanged multi-file auto-detected atomic imports with per-line freshness, conflicts and correction path; robust xlsx reading (a real flaky-reader failure found while importing the real exports now falls back to a safe reader). |
| Migrations | `0001`–`0005`, additive and versioned (`npm run db:migrate`; see `UPGRADE.md`). |

## The four known defects, re-verified

All four were reproduced on the earlier code and are covered by regression checks 13–16 (per-obligation reminders; latest valid decision wins with Undo; accepted
shop-order correction synchronises the sample before recalculation; conflict uniqueness only for pending rows with several resolved records kept).
Earlier improvements are retained and re-verified by checks 1–12 (commitments without samples, two distinct videos, reschedule history, no cross-commitment reuse,
unknown posting dates stay uncertain, verification time ≠ posting time, unrelated products do not fulfil, repeated samples do not multiply sales, coverage gaps, legacy history).

## Validation actually executed

| Check | Result |
|---|---|
| Regression suite `npm run test:regressions` (isolated `_test` DB; synthetic `zz_test_*` records) | 100 / 100 passed |
| Acceptance suite `npm run test:workflow` | 34 / 34 passed |
| Real exports `npm run test:real` (15 real files; DB built from an older schema, then migrated) | 24 / 24 passed: all files imported, re-upload added nothing, no conflicts, totals unchanged after repeat uploads and refreshes, sales attribution reconciled, recommendations not duplicated, screens build on real data |
| Browser walkthrough (owner, manager, viewer) | 40 / 40 passed: daily actions, Undo, structured promise, reschedule, pause/resume, add creator, drill-down, conflict correction, permissions, redirects |
| Migrations | Applied to a database built from the pre-workflow schema (with legacy actions) and to the real-data database; `drizzle-kit push` afterwards showed only cosmetic default-quoting differences |
| Type check, lint, production build | clean |
| Failed-import recovery | A failure after partial writes leaves no upload record, lines or products; a retry then succeeds (check 22) |

Not tested / limitations: WhatsApp/TikTok apps are only linked (not driven); the browser tests ran on Chromium only; real-data screens were reviewed visually
but the real exports contain no staff history, so promise/follow-up flows on real data use synthetic labelled records; GMV/profit/cost modules are intentionally not built
(`creators`, `content_items`, `sample_sales` and `orders` give them stable records to attach to); permissions are verified in the browser walkthrough, not in the script suite.

## Interface declutter (latest change)

Today's Work rows show creator · one primary action · short reason · deadline chip · completion count · **Message** and **Update** only. The creator side panel
(`components/creator/creator-panel.tsx`, data from `/api/creators/[username]/panel`) holds commitments, samples, evidence and history and is reused by the new
**Affiliates** directory. The previous detailed affiliate page moved to **Affiliate analysis** (Analysis group). Progress is grouped into *Needs your decision*,
*Staff execution* and *Affiliate output*, with supporting tables, sales movement and definitions expandable. Navigation: Work (4 items) first; Analysis and Administration are collapsed groups.
Screenshots of populated screens (desktop 1366px and mobile 390px, real-data database with clearly synthetic staff work) are in `docs/screenshots/`.
Verification executed: 100/100 regression checks, 37/37 browser checks at desktop and mobile widths (including find overdue creator → Message → Update → Contacted → history in the side panel without leaving Today's Work), type check, lint, production build.
Found and fixed while testing: the Undo message disappeared when the last row left the list.
