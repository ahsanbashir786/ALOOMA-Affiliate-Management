# Blueprint: where this system goes next

Principle: **one spine of records, many workflows on top.** New modules attach to records that already exist; they do not need another rebuild.
Three layers everywhere: *source facts* (imported, never edited), *staff facts* (entered by people, append-only with who/when, Undo keeps history), *derived results* (always recalculated).

## What exists today (built from the data we have)

| Area | Status |
|---|---|
| Affiliate management (relationships, samples, promises, content evidence, follow-ups, progress) | Built |
| Order health (cancellations, returns, reasons, payment method, products to watch, shipping and delivery speed, unusual days) | Built (from shop orders) |
| Demand planning (units per week per item, bundles broken into parts, forecast with range) | Built (from shop orders + bundle lists) |
| Command centre, creator panel, quick search | Built |
| Safe imports, versioned migrations, backups, VPS deployment | Built |

## Records that future modules attach to (already in the database)

| Record | Table(s) | Future modules that use it |
|---|---|---|
| Items, sets and their parts | `sku_items`, `sku_bom` | Inventory, purchasing, profit |
| Orders and lines (source of truth for sales, cancellations, returns) | `shop_order_lines`, `order_lines` | Returns cases, profit, leakage |
| Creators and collaboration | `creators`, `commitments`, `content_items`, `sample_sales` | Ads (creator-linked ads), profit per creator |
| Staff history | `staff_events`, `content_decisions` | Every workflow (same event pattern) |
| Imports and coverage | `uploads`, `import_conflicts` | Every new data source |

## Future modules (need data we do not have yet)

| Module | New data needed | New records | First screens |
|---|---|---|---|
| **Ads** | Ad spend export (campaign, product, daily spend) | `ad_campaigns`, `ad_spend_daily` | Spend vs orders, break-even ROAS, wasted spend, budget pacing |
| **Returns cases** | Return/refund report, return reasons | `return_cases` (status, deadline, stock outcome) | Case list with deadlines, "return accepted but not received" |
| **Inventory** | Opening stock count, receipts, damage records | `stock_movements` (ledger: in, out, return-in, damage, adjustment) | Stock per item (sets broken into parts), days of stock left, count variance |
| **Purchasing** | Suppliers, lead times, minimum orders, costs | `suppliers`, `purchase_orders`, `po_lines` | Reorder suggestions using the demand forecast, PO tracking, supplier scorecard |
| **Profit** | Product costs, shipping cost, settlement/statement export | `cost_records` (with effective dates), `settlement_lines` | Profit per order/item/creator/ad, estimated vs settled |
| **Leakage checks** | Stock counts, settlements, supplier invoices | `reconciliation_findings` | Nine reconciliations (shipped vs stock out, count vs ledger, returns vs received, payout vs expected, commission vs agreed, ads vs orders, supplier delivery vs PO, samples vs recorded, refunds without return) |

Rules for all of them: costs and prices carry effective dates; every report shows its coverage; a missing upload is never read as zero; imports are atomic and repeatable; each finding has an owner, a deadline and the money at stake.

## Suggested order

1. Returns cases (data mostly there) → 2. Inventory ledger (needs an opening count) → 3. Purchasing (uses today's demand forecast) → 4. Ads → 5. Profit → 6. Leakage engine + owner inbox.
