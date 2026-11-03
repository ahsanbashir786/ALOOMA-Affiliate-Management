# Minimum upload guide

Checked against the real exports (all 15 files in this project were imported and re-imported in an isolated database).

## Every week (about 5 minutes)

| File | Why it cannot be dropped |
|---|---|
| **Affiliate orders** | Sales, LIVE evidence, first-sale dates |
| **All shop orders** | Sample deliveries, cancellations/returns (the source of truth for valid sales) |
| **Video analysis** | Video posting dates – the evidence that a promise or sample was fulfilled |

Then press **Refresh recommendations** on Today's Work. In **Data hub** you can drop all files at once; each is detected automatically and shows
*added · updated · unchanged · skipped (older) · to review · rejected*, the period it covers, and any warning.

## Setup data (upload once, again only when it changes)

SKU lists / bundle mappings, WhatsApp numbers (contact list or staff sheet, or type them in the app).

## Optional

Creator list (followers → recruitment ideas), Transaction analysis (exact posting counts), Sample analysis (extra uncertain evidence), Product list (names also come from orders).
Today's Work works without them; the screens say honestly what is unavailable.

## Safety rules (all files)

* Each file is imported in one transaction – on failure nothing changes.
* Same or overlapping files never duplicate lines. Order lines are keyed by order + SKU.
* Each line is judged by **its own** dates, never by the file's latest date or the upload time. A line with older dates never replaces newer data.
  Same dates but different values are **kept as stored and listed in Data hub → "to review"** for you to keep or replace.
  A new return/refund/cancellation is accepted; one that disappears is listed for review.
* Accepting a correction also updates the linked sample and recalculates matching, deadlines, promise progress and sales attribution.
* **Gaps matter:** Progress compares sales only where uploaded files fully cover both periods and shows the effective dates. Missing files are never read as zero.
