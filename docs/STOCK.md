# Stock And Costing

The first step of the profit system: what every piece really cost, and how much stock is left. Menu: **Profit → Stock And Costing** (its own permission, "Stock And Costing").

## What it holds

| Data | Where it comes from |
|---|---|
| SKU list (name of every SKU) | `A. List of SKU Single Items` |
| Bundles and their parts | the three `Set SKU / BOM` files. A part listed twice counts twice. The FBS (Fulfilled by Shopee) code of a bundle has the same parts |
| Every stock-in order, every delivery date, the pieces and the landed cost per piece, free pieces included | `ALOOMA Total Inventory Data` (one file, two sheets: `Inbound Costing` and `Free Units by Date`). It replaces the old order costing, order dates and opening stock files |

Import them in the order above on the **Import Files** tab. Importing a file again replaces its own rows only; nothing is counted twice. The inventory file replaces everything that came from an earlier inventory file; orders added in the app (31 onward) are kept. A file that is not the right kind is refused and nothing is saved.

## Rules

- **Landed cost per piece** = the "Landed RM / pc" of the row in the file (product price in RM + freight, freight counted on **paid pieces only**). Free pieces cost RM 0 and are part of the stock: they are used oldest first like every other piece.
- **One layer per delivery**: a SKU of one order can arrive on several days (one column per delivery in the file). Each filled cell is its own layer, with its own date.
- **Not counted**: free pieces the file lists as *Undated* (no receipt date yet) and pieces marked *Order 29 exclusion*. The import result says how many.
- **No opening stock or closing date is needed.** The file starts at the very first delivery, so FIFO starts there too: costing begins on the day the first stock arrived.
- **Freight** is split by paid pieces. Extras that were disputed or pending in the costing file are left out.
- **FIFO**: a sale takes its pieces from the oldest stock that had already arrived on the day of the sale. Two orders that arrived on the same day are used in order-number order.
- **Bundles** sell as one order with one price. In the background each part is taken from stock separately.
- **No stock found**: a sale on a day when no stock had arrived yet is flagged, and costed at the nearest known cost so profit is not blank. A SKU that is in no stock-in order at all is listed under "TikTok SKUs That Are Not In Your Stock List" and has no cost.
- SKU codes are matched without caring about upper or lower case, and a few known spelling pairs are joined (`src/lib/stock/sku.ts`).

## What is not counted yet

Stock on hand is **after TikTok sales only**. Shopee and FBS sales, returns and the warehouse's own count come with the next steps (order profit, Shopee connection).

## Files

`migrations/0034_stock.sql` · `migrations/0038_inventory_file.sql` · `src/lib/stock/{parse,fifo,save,load,overview,sku}.ts` · `src/app/actions/stock.ts` · `src/app/(app)/stock/` · `src/components/stock/import-board.tsx` · `scripts/test-stock.ts` (set `STOCK_FILES` to a folder with the real files) · `scripts/e2e-stock.js`

Some Excel programs write every tag with a prefix (`<x:sheet>`), which the Excel reader library cannot read. `parse.ts` strips the prefix and retries, so those files load too.
