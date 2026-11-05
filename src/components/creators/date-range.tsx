"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysISO, fmtDayLabel } from "@/lib/time";
import { RANGE_PRESETS } from "@/lib/creators/params";

/** Date range for the Orders, Videos, GMV and Total GMV numbers: quick choices, or any From and To day. Empty = all time. */
export function DateRange({ from, to, today, onApply }: { from: string; to: string; /** Today in Malaysia, from the server. */ today: string; onApply: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const label = from || to ? `${fmtDayLabel(from || "2020-01-01")} – ${fmtDayLabel(to || today)}` : "All time";
  const presets = RANGE_PRESETS.map((p) => ({ l: p.label, from: addDaysISO(today, -(p.days - 1)), to: today }));
  const valid = (!f && !t) || ((!f || f <= today) && (!t || t <= today) && (!f || !t || f <= t));
  const apply = (a: string, b: string) => { onApply(a, b); setOpen(false); };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label="Date range" aria-expanded={open} onClick={() => { setF(from); setT(to); setOpen((o) => !o); }} data-testid="date-range"
        className={cn("inline-flex h-9 items-center gap-2 rounded-lg border bg-surface px-3 text-[14px] hover:bg-surface-2", from || to ? "border-brand text-brand" : "border-line-strong text-ink-2")}>
        <CalendarRange className="size-4" /> {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose dates" className="absolute top-11 right-0 z-30 w-[320px] rounded-xl border border-line-strong bg-surface p-4 text-ink shadow-lg">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Quick choice</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.l} type="button" onClick={() => apply(p.from, p.to)} className={cn("rounded-full border px-3 py-1 text-[13px]", from === p.from && to === p.to ? "border-brand bg-brand-soft text-brand" : "border-line-strong hover:bg-surface-2")}>{p.l}</button>
            ))}
            <button type="button" onClick={() => apply("", "")} className={cn("rounded-full border px-3 py-1 text-[13px]", !from && !to ? "border-brand bg-brand-soft text-brand" : "border-line-strong hover:bg-surface-2")}>All time</button>
          </div>
          <p className="mt-4 mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Or choose dates</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12.5px] text-ink-3">From<input type="date" aria-label="From date" value={f} max={today} onChange={(e) => setF(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-[14px] text-ink" /></label>
            <label className="text-[12.5px] text-ink-3">To<input type="date" aria-label="To date" value={t} min={f || undefined} max={today} onChange={(e) => setT(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-[14px] text-ink" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-[14px] text-ink-2 hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={!valid} onClick={() => apply(f, t)} className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
