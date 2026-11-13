"use client";

import { useActionState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, PackagePlus, TriangleAlert, Upload } from "lucide-react";
import { addStockOrder, importStockFile, type ImportState } from "@/app/actions/stock";
import { Button, Card, Badge, Input, Label } from "@/components/ui/primitives";

export type ImportCardInfo = { kind: string; step: number; title: string; help: string; accept: string; multiple?: boolean; status: string | null };

function ImportCard({ info }: { info: ImportCardInfo }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importStockFile, null);
  const mine = state && state.kind === info.kind ? state : null;
  return (
    <Card className="p-4" data-testid={`import-${info.kind}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[14px] font-semibold text-brand">{info.step}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{info.title}</h3>
            {info.status ? <Badge tone="good"><CheckCircle2 className="size-3.5" />{info.status}</Badge> : <Badge>Not Imported Yet</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{info.help}</p>
          <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="kind" value={info.kind} />
            <label className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-strong bg-surface-2 px-3 text-[13.5px] text-ink-2 hover:border-brand">
              <FileSpreadsheet className="size-4 shrink-0 text-ink-3" />
              <input type="file" name="file" accept={info.accept} multiple={info.multiple} required className="min-w-0 flex-1 text-[13px] file:mr-3 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-brand" />
            </label>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{pending ? "Importing…" : "Import"}</Button>
          </form>
          {mine && (
            <div data-testid={`import-result-${info.kind}`} className={`mt-3 rounded-md border p-3 text-[13px] ${mine.ok ? "border-transparent bg-good-soft text-ink" : "border-transparent bg-critical-soft text-ink"}`}>
              <p className="flex items-center gap-1.5 font-medium">{mine.ok ? <CheckCircle2 className="size-4 text-good" /> : <TriangleAlert className="size-4 text-critical" />}{mine.title}</p>
              {mine.lines.length > 0 && <ul className="mt-1 list-inside list-disc text-ink-2">{mine.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {mine.notes.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-ink-2">{mine.notes.length} note{mine.notes.length === 1 ? "" : "s"}</summary><ul className="mt-1 list-inside list-disc text-ink-2">{mine.notes.slice(0, 40).map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Order 31 onward: the supplier's order lines, the rate and the freight amount. The app works out the cost per piece. */
function NewOrderCard({ suggest }: { suggest: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(addStockOrder, null);
  const mine = state && state.kind === "new-order" ? state : null;
  return (
    <Card className="p-4" data-testid="new-order">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-good-soft text-good"><PackagePlus className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink">Add A New Stock-In Order</h3>
          <p className="mt-1 text-[13px] text-ink-2">For every new order (31 onward). Give the final order file, the exchange rate and the freight amount. The cost per piece is worked out for you: product price in RM plus freight shared over the paid pieces.</p>
          <p className="mt-1 text-[13px] text-ink-2">The file needs columns named SKU, Paid Qty and Unit Price RMB (Free Qty is optional). <a href="/api/stock/template" className="inline-flex items-center gap-1 font-medium text-brand hover:underline"><Download className="size-3.5" />Download a template</a></p>
          <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label htmlFor="no-order">Order Number</Label><Input id="no-order" name="orderNo" defaultValue={suggest} required /></div>
            <div><Label htmlFor="no-rate">RMB Per RM 1 (Exchange Rate)</Label><Input id="no-rate" name="rate" inputMode="decimal" placeholder="1.65" required /></div>
            <div><Label htmlFor="no-freight">Freight Total (RM)</Label><Input id="no-freight" name="freight" inputMode="decimal" placeholder="25000" required /></div>
            <div><Label htmlFor="no-purchase">Purchase Date</Label><Input id="no-purchase" name="purchase" type="date" /></div>
            <div><Label htmlFor="no-arrival">Arrived In Warehouse</Label><Input id="no-arrival" name="arrival" type="date" required /></div>
            <div><Label htmlFor="no-file">Order File (.xlsx)</Label><input id="no-file" type="file" name="file" accept=".xlsx" required className="block h-9 w-full rounded-md border border-dashed border-line-strong bg-surface-2 px-2 py-1.5 text-[13px] file:mr-3 file:border-0 file:bg-transparent file:font-medium file:text-brand" /></div>
            <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" variant="primary" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}{pending ? "Adding…" : "Add Order"}</Button></div>
          </form>
          {mine && (
            <div data-testid="new-order-result" className={`mt-3 rounded-md border border-transparent p-3 text-[13px] ${mine.ok ? "bg-good-soft" : "bg-critical-soft"}`}>
              <p className="flex items-center gap-1.5 font-medium">{mine.ok ? <CheckCircle2 className="size-4 text-good" /> : <TriangleAlert className="size-4 text-critical" />}{mine.title}</p>
              {mine.lines.length > 0 && <ul className="mt-1 list-inside list-disc text-ink-2">{mine.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {mine.notes.length > 0 && <ul className="mt-1 list-inside list-disc text-ink-2">{mine.notes.slice(0, 20).map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ImportBoard({ cards, nextOrder }: { cards: ImportCardInfo[]; nextOrder: string }) {
  return (
    <div className="space-y-3">
      <NewOrderCard suggest={nextOrder} />
      <p className="pt-2 text-[13.5px] font-medium text-ink">First-Time Files (Orders 1 To 30)</p>
      <p className="text-[13.5px] text-ink-2">Import these in order. Each file can be imported again later; nothing is counted twice.</p>
      {cards.map((c) => <ImportCard key={c.kind} info={c} />)}
    </div>
  );
}
