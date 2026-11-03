# Upgrading safely (existing data stays)

`npm run db:push` is **only for a brand-new, empty database**. It compares the code to the database and can offer to drop things.
For a database that already has your data, use the versioned migrations. They are additive: they never delete or rewrite your
orders, staff history, promises or content decisions.

```bash
# 1. Back up first (any Postgres tool works; this is the simplest)
pg_dump "$DATABASE_URL" -Fc -f backup-before-upgrade.dump
```

```bash
# 2. Get the new code and packages
git pull origin claude/focused-noether-wfixvh
npm install
```

```bash
# 3. Apply the migrations (safe to run twice – it says "Database is up to date")
npm run db:migrate
```

```bash
# 4. Start the app, then press "Refresh recommendations" once on Today's Work
npm run dev
```

If a migration fails, **nothing from that file is applied** (each file runs in one transaction). Send me the message it prints; your
backup is untouched. To go back: `pg_restore --clean -d "$DATABASE_URL" backup-before-upgrade.dump`.

## What the migrations do to existing records

| Migration | Effect |
|---|---|
| `0001_workflow_foundation` | Adds the Today's Work tables (staff events, promises, recommendations, content decisions). |
| `0002_commitments_content_attribution` | Adds promise details (type, quantity), reschedule history, the general content table, the single sales-attribution table and the import-conflicts table. Existing promises keep their date; their product is filled in only when all their samples were one product. Order lines get a per-line freshness stamp (their own latest timestamp). |
| `0003_legacy_actions` | **The old Action centre is kept exactly as it was** (notes, assignees, statuses – readable on each creator's timeline, labelled "Earlier Action centre"). Only actions marked **Sent** that have a recorded completion time become one "Contacted" event, at that recorded time and by the recorded person, flagged *legacy*: they show as past contacts but never create reminders or count toward follow-up performance. "Done", "dismissed", "in progress" and "open" items do **not** become events – they do not prove a message was sent. No date or contact is invented. |
| `0004_pending_conflict_uniqueness` | Import conflicts: only **pending** conflicts must be unique per line, so one line can be conflicted and resolved any number of times. All resolved history is kept untouched. |

## What is rebuilt after an upgrade (and is safe to rebuild)

The content table, promise progress, sample results and sales attribution are *derived* – "Refresh recommendations" (or any upload)
recalculates them from your files. Staff decisions (verified / rejected content), promises, reschedules, pauses and contacts are **never**
rebuilt or deleted by uploads or refreshes.

Expected small differences the first time: a sample that was "posted" only because an undated video was selling may move to
**Needs review**; "sample content sales" may be lower, and the extra amount is shown as "also sold since delivery".
