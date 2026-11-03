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
* **Snapshots vs order data** – order lines are stored per order and never summed across files. Report snapshots (Video, Creator…) replace the previous snapshot for the same period and are never added together.
* **Staff work is untouched** – staff actions, promises, pauses and content decisions live in separate tables that imports never write.
* After each import the screen shows: added · updated · unchanged · skipped (older) · to review · rejected (with reasons) · period covered · warnings.

### Freshness – what is actually guaranteed

The exports contain **no "exported at" time and no "last updated" time per row**. They do contain lifecycle timestamps (created, paid,
shipped, delivered, cancelled, commission paid). So each order line's freshness stamp is **the latest of its own lifecycle timestamps**
(never the upload time, and no longer one stamp for the whole file). For a line that is already stored:

| The file's line… | Result |
|---|---|
| is not stored yet | added |
| is identical | unchanged |
| has a **newer** stamp | replaces the stored line |
| has an **older** stamp | skipped (stored line kept) |
| has the **same** stamp but different values | **kept as stored and listed in Data hub → "to review"** (nothing proves which is newer) |
| same stamp, but only fills a value that was empty | applied |
| same stamp, but a **new** cancellation / return / refund appears | applied – these carry no timestamp of their own, and statuses do not move in a straight line (a delivered order can be returned later) |
| same stamp, but a stored cancellation / return / refund **disappears** | **not** applied – listed to review |

*Deliberate correction:* accepting a shop-order correction also updates the linked sample (delivery, status), then recalculates content matching, deadlines, promise progress and sales attribution; staff notes, promises and decisions are untouched. In Data hub, "Keep what is stored" or "The file is newer – use its version" resolves the listed lines; who
decided and when is recorded. *Limitation:* if two exports differ only in a way that has no timestamp and is not a cancellation/return/refund,
the stored version wins until a person decides. Report snapshots (video/creator files) are replaced per report period, newest upload wins.

## One attribution rule for sample sales

* **Every qualifying sale line (order + SKU) is credited to exactly one sample** – the creator's most recent sample of that product delivered before the content was posted (or before the order, for LIVEs and undated content). Repeated samples therefore never multiply sales. All screens, totals, the product breakdown and exports read this one record (`sample_sales`).
* Only the **same product** counts. If a sample's product cannot be identified, nothing is credited to it.
* **Content sales** = from a LIVE after delivery, from a video with a **known posting date** on/after delivery, or from content staff verified. **Also sold since delivery** = sales of the product from older or **undated** content – shown separately, never mixed in.
* A video **absent from Video analysis has an unknown posting date**. It is evidence only (needs review); it never completes a sample or a promise by itself. A LIVE is dated by its sales (it was on air when the order was placed).
* Dates: date-only exports are compared by **calendar day**; a video dated the delivery day counts (cannot be proven earlier), a video dated the day before does not. There is no one-day allowance.
* Distinct measures stay separate: sample orders, product lines, physical units, creators, unique content pieces.

## Promises (commitments)

* A promise belongs to a creator and exists **without any sample**. Optional, structured: content type (video/LIVE), product, quantity. Free text is kept for reading and is **never** parsed for quantities or products.
* Fulfilled = the required number of **distinct** pieces of the right type and product, with a **known posting date** on/after the day the promise was recorded – or confirmed by staff. No agreed product ⇒ the system only suggests matches (review).
* Each content piece counts once and is used by one promise unless staff deliberately record shared use. Duplicate imports and repeated verification never count twice.
* **Reminders are per promise.** A later promise never hides, completes or replaces an earlier promise's reminder; creators are only grouped for display. A contact answers the reminders that are due, not promises still to come.
* **Latest decision wins.** For the same content and scope, the latest non-undone verify/reject decides; earlier ones stay in the history, and undoing the latest restores the previous one. Samples, promises and Progress all follow it.
* Moving a date is a **reschedule** (original kept, change recorded, only the current deadline drives reminders); it is not a new promise. Sample deadlines and the daily queue both use the **earliest outstanding current deadline**.

## Reporting periods

Progress uses the **recorded period of each uploaded order file** (not the earliest order date) for both Affiliate orders and All shop orders.
Equal-length periods are compared only when both are completely covered; if current data ends early both periods are shortened equally
(at least 7 days) and the effective dates are shown; any gap withholds the comparison. Missing uploads are never read as zero sales.
"Newly selling" / "reactivated" need the 28 days before the period fully covered and are labelled **first observed sale**.
