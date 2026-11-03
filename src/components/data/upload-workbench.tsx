"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { regenerateActions } from "@/app/actions/actions";
import { cn, fmtDate, fmtInt } from "@/lib/utils";

type Inspect = {
  token: string;
  filename: string;
  kind: string | null;
  kindLabel: string | null;
  rows: number;
  needsPeriod: boolean;
  suggestedStart: string | null;
  suggestedEnd: string | null;
  periodSource: "filename" | "data" | null;
  existing: { periodStart: string | null; periodEnd: string | null; rowCount: number }[];
  warnings: string[];
};
type Result = {
  imported: number;
  skipped: number;
  replacedUploads: number;
  notes: string[];
  added?: number;
  updated?: number;
  skippedOlder?: number;
  rejected?: Record<string, number>;
  warnings?: string[];
  coverage?: { start: string | null; end: string | null };
};
type Item = {
  key: string;
  file: File;
  phase: "inspecting" | "ready" | "importing" | "done" | "error";
  info?: Inspect;
  start: string;
  end: string;
  error?: string;
  result?: Result;
};

// Import order: orders first so later periods resolve against the data window.
// SKU lists first (product names for samples); the staff sheet last (it matches against everything else).
const ORDER = ["sku_catalog", "affiliate_orders", "all_orders", "product_list", "creator_list", "creator_transactions", "video_list", "sample_analysis", "staff_sheet", "contact_list"];

export function UploadWorkbench() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.xlsx$/i.test(f.name));
    const fresh: Item[] = list.map((f) => ({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, file: f, phase: "inspecting", start: "", end: "" }));
    if (!fresh.length) return;
    setItems((xs) => [...xs, ...fresh]);
    for (const it of fresh) {
      try {
        const fd = new FormData();
        fd.append("file", it.file);
        const res = await fetch("/api/uploads/inspect", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't read the file.");
        const info = json as Inspect;
        patch(it.key, {
          phase: info.kind ? "ready" : "error",
          info,
          start: info.suggestedStart ?? "",
          end: info.suggestedEnd ?? "",
          error: info.kind ? undefined : info.warnings[0],
        });
      } catch (e) {
        patch(it.key, { phase: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
  }, []);

  const ready = items.filter((i) => i.phase === "ready");
  const invalid = ready.some((i) => i.info?.needsPeriod && (!i.start || !i.end || i.start > i.end));

  async function importAll() {
    setBusy(true);
    setStatus(null);
    const queue = [...ready].sort((a, b) => ORDER.indexOf(a.info!.kind!) - ORDER.indexOf(b.info!.kind!));
    let ok = 0;
    for (const it of queue) {
      patch(it.key, { phase: "importing" });
      try {
        const res = await fetch("/api/uploads/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: it.info!.token,
            filename: it.file.name,
            kind: it.info!.kind,
            periodStart: it.start || null,
            periodEnd: it.end || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Import failed.");
        patch(it.key, { phase: "done", result: json as Result });
        ok++;
      } catch (e) {
        patch(it.key, { phase: "error", error: e instanceof Error ? e.message : "Import failed." });
      }
    }
    if (ok > 0) {
      setStatus("Updating recommendations…");
      try {
        const r = await regenerateActions();
        setStatus(`Imported ${ok} file${ok === 1 ? "" : "s"}. ${r.created} new recommendation${r.created === 1 ? "" : "s"} generated.`);
      } catch {
        setStatus(`Imported ${ok} file${ok === 1 ? "" : "s"}.`);
      }
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <Card>
      <div className="p-5">
        <label
          htmlFor="file-input"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand hover:bg-surface-2",
          )}
        >
          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
            <UploadCloud className="size-5" />
          </span>
          <span className="text-[15px] font-semibold text-ink">Drop your TikTok exports here</span>
          <span className="mt-1 text-[13px] text-ink-3">or click to browse · .xlsx · several files at once is fine – each type is detected automatically (TikTok exports, your SKU lists and the staff sheet)</span>
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            accept=".xlsx"
            multiple
            className="sr-only"
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>

      {items.length > 0 && (
        <ul className="border-t border-line">
          {items.map((it) => (
            <li key={it.key} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-start">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-ink">{it.file.name}</span>
                  {it.info?.kindLabel && <Badge tone="brand">{it.info.kindLabel}</Badge>}
                  {it.info && it.info.kind && <span className="tnum text-[12.5px] text-ink-3">{fmtInt(it.info.rows)} rows</span>}
                </div>

                {it.phase === "inspecting" && (
                  <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-3"><Loader2 className="size-3.5 animate-spin" /> Reading file…</p>
                )}
                {it.phase === "importing" && (
                  <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-3"><Loader2 className="size-3.5 animate-spin" /> Importing – large files can take up to a minute…</p>
                )}
                {it.phase === "error" && (
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-critical"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {it.error}</p>
                )}
                {it.phase === "done" && it.result && (
                  <div className="mt-1 space-y-0.5 text-[13px]">
                    <p className="flex items-start gap-1.5 text-good">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <b>{fmtInt(it.result.added ?? it.result.imported)}</b> added · <b>{fmtInt(it.result.updated ?? 0)}</b> updated
                        {it.result.skippedOlder ? <> · <b>{fmtInt(it.result.skippedOlder)}</b> skipped (older than what is already known)</> : null}
                        {Object.values(it.result.rejected ?? {}).reduce((a, b) => a + b, 0) > 0 ? <> · <b>{fmtInt(Object.values(it.result.rejected ?? {}).reduce((a, b) => a + b, 0))}</b> rejected</> : null}
                        {it.result.coverage?.start ? <span className="text-ink-3"> · covers {fmtDate(it.result.coverage.start)} – {fmtDate(it.result.coverage.end)}</span> : null}
                      </span>
                    </p>
                    {Object.entries(it.result.rejected ?? {}).map(([why, n]) => (
                      <p key={why} className="pl-[22px] text-[12.5px] text-ink-2">Rejected: {n} × {why}</p>
                    ))}
                    {(it.result.warnings ?? []).map((w) => (
                      <p key={w} className="flex items-start gap-1.5 pl-[22px] text-[12.5px] text-warn"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {w}</p>
                    ))}
                  </div>
                )}
                {it.phase === "done" && it.result && it.result.notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-[22px] text-[12.5px] text-ink-2">
                    {it.result.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}

                {it.phase === "ready" && it.info && (
                  <div className="mt-2.5 space-y-2.5">
                    {it.info.needsPeriod ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <span className="mb-1 block text-[12px] text-ink-3">Report period start</span>
                          <Input type="date" value={it.start} onChange={(e) => patch(it.key, { start: e.target.value })} className="h-8 w-[150px] text-[13px]" />
                        </div>
                        <div>
                          <span className="mb-1 block text-[12px] text-ink-3">end</span>
                          <Input type="date" value={it.end} onChange={(e) => patch(it.key, { end: e.target.value })} className="h-8 w-[150px] text-[13px]" />
                        </div>
                        {it.info.periodSource === "filename" && <span className="pb-1.5 text-[12px] text-ink-3">read from filename – please check</span>}
                      </div>
                    ) : it.info.kind === "sku_catalog" ? (
                      <p className="text-[13px] text-ink-2">SKU list – single items and bundle contents are added or updated. Upload every SKU workbook you have.</p>
                    ) : it.info.kind === "contact_list" ? (
                      <p className="text-[13px] text-ink-2">WhatsApp numbers – only affiliates without a number are filled; numbers already saved are kept.</p>
                    ) : it.info.kind === "staff_sheet" ? (
                      <p className="text-[13px] text-ink-2">
                        Staff sheet – WhatsApp numbers, notes and LIVE/video approach only. Contact details edited in the app are kept.
                      </p>
                    ) : (
                      <p className="text-[13px] text-ink-2">
                        Orders {it.start ? `${fmtDate(it.start)} – ${fmtDate(it.end)}` : ""}. Existing orders are updated in place, so you can re-upload overlapping ranges safely.
                        {it.info.kind === "all_orders" ? " Free-sample orders (RM 0) go to the sample tracker." : ""}
                      </p>
                    )}
                    {it.info.needsPeriod && it.info.existing.length > 0 && (
                      <p className="text-[12.5px] text-ink-3">
                        Already loaded: {it.info.existing.map((e) => `${fmtDate(e.periodStart)} – ${fmtDate(e.periodEnd)}`).join(" · ")}. The same period is replaced.
                      </p>
                    )}
                    {it.info.warnings.map((w) => (
                      <p key={w} className="text-[12.5px] text-warn">{w}</p>
                    ))}
                  </div>
                )}
              </div>
              {(it.phase === "ready" || it.phase === "error") && (
                <button
                  aria-label={`Remove ${it.file.name}`}
                  onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
                  className="self-start rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(ready.length > 0 || status) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[13.5px] text-ink-2" aria-live="polite">{status}</p>
          {ready.length > 0 && (
            <Button variant="primary" disabled={busy || invalid} onClick={importAll}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Import {ready.length} file{ready.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
