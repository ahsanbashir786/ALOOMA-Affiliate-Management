"use client";

import { useActionState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, TriangleAlert, Upload } from "lucide-react";
import { importStockFile, type ImportState } from "@/app/actions/stock";
import { Button, Card, Badge } from "@/components/ui/primitives";

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

export function ImportBoard({ cards }: { cards: ImportCardInfo[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-ink-2">Import the files in this order. Each file can be imported again later; nothing is counted twice.</p>
      {cards.map((c) => <ImportCard key={c.kind} info={c} />)}
    </div>
  );
}
