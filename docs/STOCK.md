# Stock And Costing

The first step of the profit system: what every piece really cost, and how much stock is left. Menu: **Profit → Stock And Costing** (its own permission, "Stock And Costing").

## What it holds

| Data | Where it comes from |
|---|---|
| SKU list (name of every SKU) | `A. List of SKU Single Items` |
| Bundles and their parts | the three `Set SKU / BOM` files. A part listed twice counts twice. The FBS (Fulfilled by Shopee) code of a bundle has the same parts |
| Stock-in orders: pieces and landed cost per piece | `ALOOMA All Order Costing` |
| Purchase date and arrival date of every order | `Order Inbound and Purchase Dates` |
| Opening stock | the warehouse inventory report for the last month before the first costed order arrived (May 2025). Costed like the same SKU in order 1B. Sample pieces are not counted. Stock is kept as single pieces: a bundle in the report is split into its parts (so import the Bundle Lists first) and a Shopee FBS code counts as the plain SKU |

Import them in the order above on the **Import Files** tab. Importing a file again replaces its own rows only; nothing is counted twice. A file that is not the right kind is refused and nothing is saved.

## Rules

- **Landed cost per piece** = product price in RM + freight, freight counted on **paid pieces only**. Free pieces cost RM 0 and are part of the stock, so they lower the average cost of their order.
- **Freight** is split by paid pieces. Extras that were disputed or pending in the costing file are left out.
- **FIFO**: a sale takes its pieces from the oldest stock that had already arrived on the day of the sale. Two orders that arrived on the same day are used in order-number order.
- **Arrival dates**: exact only where the warehouse gave a day (orders 29 and 30). Otherwise only the month is known: the 15th of that month is used (the 25th for "Late …"), and the order is marked **Estimated**.
- **Bundles** sell as one order with one price. In the background each part is taken from stock separately.
- **No stock found**: a sale on a day when no stock had arrived yet is flagged, and costed at the nearest known cost so profit is not blank. A SKU that is in no stock-in order at all is listed under "TikTok SKUs That Are Not In Your Stock List" and has no cost.
- SKU codes are matched without caring about upper or lower case, and a few known spelling pairs are joined (`src/lib/stock/sku.ts`).

## What is not counted yet

Stock on hand is **after TikTok sales only**. Shopee and FBS sales, returns and the warehouse's own count come with the next steps (order profit, Shopee connection).

## Files

`migrations/0034_stock.sql` · `src/lib/stock/{parse,fifo,save,load,overview,sku}.ts` · `src/app/actions/stock.ts` · `src/app/(app)/stock/` · `src/components/stock/import-board.tsx` · `scripts/test-stock.ts` (set `STOCK_FILES` to a folder with the real files) · `scripts/e2e-stock.js`

Some Excel programs write every tag with a prefix (`<x:sheet>`), which the Excel reader library cannot read. `parse.ts` strips the prefix and retries, so those files load too.
