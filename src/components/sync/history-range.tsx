"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const back = (months: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - months); return iso(d); };

/** A date-range picker for the history to load: quick choices, or any From and To day ("up to today" by default). */
export function HistoryRange({ from, to, canEdit, onSave }: { from: string; to: string; canEdit: boolean; onSave: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const box = useRef<HTMLDivElement>(null);
  const today = iso(new Date());
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const presets: { l: string; from: string; to: string }[] = [
    { l: "Last 3 months", from: back(3), to: "" },
    { l: "Last 6 months", from: back(6), to: "" },
    { l: "Last 12 months", from: back(12), to: "" },
    { l: "Since 1 Mar 2025", from: "2025-03-01", to: "" },
    { l: "Since 1 Jan 2024", from: "2024-01-01", to: "" },
  ];
  const valid = f && f >= "2023-01-01" && f <= today && (!t || (t >= f && t <= today));
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label="History range" aria-expanded={open} onClick={() => canEdit && setOpen((o) => !o)} className={cn("inline-flex h-9 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 text-[13.5px] text-white", canEdit ? "hover:bg-white/15" : "cursor-default")} data-testid="history-range">
        <CalendarRange className="size-4" /> {label(from)} – {to ? label(to) : "Today"}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose history range" className="absolute top-11 left-0 z-30 w-[320px] rounded-xl border border-line-strong bg-surface p-4 text-ink shadow-lg">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Quick choice</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.l} type="button" onClick={() => { setF(p.from); setT(p.to); }} className={cn("rounded-full border px-3 py-1 text-[13px]", f === p.from && t === p.to ? "border-brand bg-brand-soft text-brand" : "border-line-strong hover:bg-surface-2")}>{p.l}</button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-[12.5px] text-ink-3">From<input type="date" value={f} min="2023-01-01" max={today} onChange={(e) => setF(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-[14px] text-ink" /></label>
            <label className="text-[12.5px] text-ink-3">To<input type="date" value={t} min={f || undefined} max={today} onChange={(e) => setT(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-[14px] text-ink" /></label>
          </div>
          <button type="button" onClick={() => setT("")} className={cn("mt-2 inline-flex items-center gap-1.5 text-[13px]", t === "" ? "font-medium text-brand" : "text-ink-3 hover:text-ink")}><Check className={cn("size-3.5", t !== "" && "opacity-0")} /> Up to today</button>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-[14px] text-ink-2 hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={!valid} onClick={() => { onSave(f, t); setOpen(false); }} className="h-9 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
