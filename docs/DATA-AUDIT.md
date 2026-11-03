# Data audit – what each feature needs

Checked by removing one export type at a time from a copy of the real data (`scripts/audit-probe.ts`) and
comparing every screen's numbers, then re-checked after the change below.

## Feature → fields → authoritative source

| Feature | Fields used | Authoritative source | Optional / backup source |
|---|---|---|---|
| Today's Work: promises, follow-ups, pauses | staff actions + dates | **Staff actions in the app** (not an upload) | – |
| Sample status (shipped / delivered / cancelled) | order id, SKU, status, shipped / delivered / cancelled time, masked buyer | **All shop orders** (RM 0 lines with no payment method = free samples) | – |
| Who received the sample | masked buyer + creator names | All shop orders + creator names seen in the other files | Staff pick the username once (Samples → Creator unknown) |
| Content evidence (posted video) | creator, video id, post date, product ids, link | **Video analysis** | Affiliate orders (a *new* video already selling the sampled product) |
| Content evidence (LIVE) | creator, content type = Livestream, product, date | **Affiliate orders** | – |
| Sales from sampled products | payment amount, status, creator, product, content id, order date | **Affiliate orders**, valid/cancelled from All shop orders | – |
| Creator sales, trend, segments | same | Affiliate orders (+ All shop orders for cancellations) | – |
| Videos / week, views | video id, post date, views | **Video analysis** | Transaction analysis (only when present) |
| Followers (ideas for non-sellers) | followers | Creator list | none – ideas for non-sellers need it |
| TikTok's own "posted with samples" flag | videos / LIVE with samples | Sample analysis | used only as *uncertain* evidence |
| Product names | product id, name | Affiliate orders | Product list |
| Bundle contents, product names of SKUs | SKU, set → parts | SKU lists (setup) | – |
| WhatsApp numbers | username, phone | Contact list / Staff sheet / typed in the app (setup) | – |
| Progress page | staff actions, commitments, content, orders | the records above | – |

## Minimum recurring uploads

| Upload | How often | Why it cannot be dropped |
|---|---|---|
| **Affiliate orders** | weekly | sales, LIVE evidence, first-sale dates |
| **All shop orders** | weekly | sample deliveries and cancellations |
| **Video analysis** | weekly | video evidence, videos per week |

The three candidates are enough **because** Transaction analysis is no longer required: videos/week and views are now
derived from Video analysis when no Transaction analysis exists (Video analysis must cover ≥ 50% of the period).

Optional (screens still work without them, with less detail): **Creator list** (followers → "untapped" ideas),
**Sample analysis** (extra uncertain evidence), **Transaction analysis** (more exact posting counts),
**Product list** (names come from orders anyway – can be dropped).

Setup data (upload once, again only when it changes): **SKU lists / bundles**, **WhatsApp numbers**.

No importer was removed: every field of the optional files is either still used or documented above as superseded.

## Import rules (all importers)

* **Atomic** – each file is imported in one database transaction. If anything fails, nothing is changed (no partial replacements).
* **No duplicates** – order lines are keyed by order id + SKU; re-uploading the same or an overlapping file updates in place.
* **Old files cannot overwrite newer information** – each line remembers the latest activity time of the file it came from; a line is only replaced by a file that is at least as recent. Counted as "skipped (older)".
* **Snapshots vs order data** – order lines are stored per order and never summed across files. Report snapshots (Video, Creator…) replace the previous snapshot for the same period and are never added together.
* **Staff work is untouched** – staff actions, promises, pauses and content decisions live in separate tables that imports never write.
* After each import the screen shows: added · updated · skipped (older) · rejected (with reasons) · period covered · warnings (older file, overlapping period, replaced earlier upload).

## Attribution rule (samples)

* A sample's sales = valid orders of the **same creator**, the **same product** (all sizes of a product count as one), on a **new video or LIVE posted after delivery**.
* Sales are counted **once per creator and product**, however many samples of that product were sent (so repeated samples do not multiply sales).
* Distinct measures are kept separate: sample orders, product lines, physical units, creators, unique content pieces.
* A video of another product, or a video posted before delivery, never completes a sample.
* *Confirmed* = same creator + product + after delivery (or a link staff verified). *Uncertain* = plausible but unproven (video without a product listed, a LIVE selling other products, TikTok's report only) → "Needs review" queue.
* Post-by date = delivery + the default days (Settings, 7) unless a creator promised a date, which replaces it.
