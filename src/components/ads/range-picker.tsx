"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysISO } from "@/lib/time";
import { PRESETS, fmtDay, makeRange, presetDates, type RangeKey } from "@/lib/ads/range";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

function Month({ ym, start, end, today, onPick, className }: { ym: string; start: string | null; end: string | null; today: string; onPick: (day: string) => void; className?: string }) {
  const [y, m] = ym.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  const lo = start && end ? (start < end ? start : end) : start, hi = start && end ? (start < end ? end : start) : start;
  return (
    <div className={cn("w-[252px]", className)}>
      <p className="mb-2 text-center text-[14px] font-semibold text-ink">{MONTHS[m - 1]} {y}</p>
      <div className="grid grid-cols-7 text-center text-[12px] font-medium text-ink-3">{WEEK.map((w) => <span key={w} className="py-1.5">{w}</span>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const future = d > today, inRange = !!lo && !!hi && d >= lo && d <= hi, edge = d === lo || d === hi;
          return (
            <button key={d} type="button" disabled={future} onClick={() => onPick(d)} aria-label={fmtDay(d)} aria-pressed={edge} data-day={d}
              className={cn("relative h-9 text-[13.5px]", future ? "cursor-not-allowed text-ink-3/50" : "hover:bg-surface-2",
                inRange && !edge && "bg-brand-soft text-brand-strong", edge && "bg-brand font-semibold text-white hover:bg-brand-strong",
                d === lo && hi !== lo && "rounded-l-lg", d === hi && hi !== lo && "rounded-r-lg", d === lo && hi === lo && "rounded-lg")}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Date range for all of GMV Max: quick choices and a two-month calendar, like TikTok Ads Manager. Puts the choice in the address (?range=…&from=…&to=…). */
export function RangePicker({ today, rangeKey, from, to, label }: { today: string; rangeKey: RangeKey; from: string | null; to: string; label: string }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<RangeKey>(rangeKey);
  const [a, setA] = useState<string | null>(from), [b, setB] = useState<string | null>(from ? to : null);
  const [view, setView] = useState(() => addMonths((from ?? today).slice(0, 7) === today.slice(0, 7) ? today.slice(0, 7) : to.slice(0, 7), -1));
  const box = useRef<HTMLDivElement>(null);
  // Keep the box on the screen whether the button sits at the left or the right.
  const [place, setPlace] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    // Stay inside the page area (the menu on the left covers anything that goes under it).
    const r = box.current.getBoundingClientRect(), area = (box.current.closest("main") ?? document.body).getBoundingClientRect();
    const minL = Math.max(16, area.left + 16), maxR = Math.min(window.innerWidth - 16, area.right - 16), width = Math.min(820, maxR - minL);
    const left = Math.min(Math.max(minL, r.right - width), maxR - width);
    setPlace({ left: left - r.left, width });
  }, [open]);
  const reset = () => { setKey(rangeKey); setA(from); setB(from ? to : null); setView(addMonths(to.slice(0, 7), -1)); };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const draft = useMemo(() => {
    if (key === "lifetime") return { from: null as string | null, to: today };
    if (!a) return null;
    const x = b ?? a; return a <= x ? { from: a, to: x } : { from: x, to: a };
  }, [key, a, b, today]);
  const choose = (k: Exclude<RangeKey, "custom">) => { const p = presetDates(k, today); setKey(k); setA(p.from); setB(p.from ? p.to : null); if (p.from) setView(addMonths(p.to.slice(0, 7), -1)); };
  const pickDay = (d: string) => {
    setKey("custom");
    // First click starts a range; the second ends it; a third starts again.
    if (!a || b) { setA(d); setB(null); } else if (d < a) { setB(a); setA(d); } else { setB(d); }
  };
  const confirm = () => {
    if (!draft) return;
    const q = new URLSearchParams(params.toString());
    q.delete("from"); q.delete("to"); q.delete("range");
    if (key === "custom") { q.set("range", "custom"); q.set("from", draft.from!); q.set("to", draft.to); } else q.set("range", key);
    setOpen(false);
    router.push(`${path}?${q.toString()}`, { scroll: false });
  };
  const preview = draft ? makeRange(key, draft.from, draft.to) : null;
  const left = addMonths(view, 0), right = addMonths(view, 1);
  const nav = "grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30";
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-label="Date range" data-testid="ads-range" onClick={() => { if (!open) reset(); setOpen((o) => !o); }}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink hover:bg-surface-2">
        <CalendarRange className="size-4 text-ink-3" /><span data-testid="ads-range-label">{label}</span><ChevronDown className="size-4 text-ink-3" />
      </button>
      {open && (
        <div role="dialog" aria-label="Define data time range" data-testid="ads-range-dialog" style={place ? { left: place.left, width: place.width } : { visibility: "hidden" }} className="absolute top-11 z-30 rounded-xl border border-line-strong bg-surface text-ink shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold">Define data time range</h2>
            <p className="text-[12.5px] text-ink-3">{preview && preview.days ? `Compared with the ${preview.days} day${preview.days === 1 ? "" : "s"} before` : "Lifetime has nothing to compare with"}</p>
          </div>
          <div className="flex flex-col sm:flex-row">
            <ul className="flex max-h-[420px] flex-wrap gap-1 overflow-y-auto border-b border-line p-3 sm:w-[170px] sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
              {PRESETS.map((p) => (
                <li key={p.key}><button type="button" onClick={() => choose(p.key)} data-testid={`ads-range-${p.key}`} className={cn("w-full rounded-lg px-3 py-1.5 text-left text-[13.5px]", key === p.key ? "bg-brand-soft font-medium text-brand-strong" : "text-ink-2 hover:bg-surface-2")}>{p.label}</button></li>
              ))}
            </ul>
            <div className="min-w-0 flex-1 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex"><button type="button" aria-label="Previous year" className={nav} onClick={() => setView((v) => addMonths(v, -12))}><ChevronsLeft className="size-4" /></button><button type="button" aria-label="Previous month" className={nav} onClick={() => setView((v) => addMonths(v, -1))}><ChevronLeft className="size-4" /></button></span>
                <span className="flex"><button type="button" aria-label="Next month" className={nav} disabled={right >= today.slice(0, 7)} onClick={() => setView((v) => addMonths(v, 1))}><ChevronRight className="size-4" /></button><button type="button" aria-label="Next year" className={nav} disabled={addMonths(right, 12) > today.slice(0, 7)} onClick={() => setView((v) => addMonths(v, 12))}><ChevronsRight className="size-4" /></button></span>
              </div>
              <div className="flex justify-center gap-6 overflow-x-auto">
                <Month ym={left} start={draft?.from ?? null} end={draft?.to ?? null} today={today} onPick={pickDay} />
                <Month ym={right} start={draft?.from ?? null} end={draft?.to ?? null} today={today} onPick={pickDay} className="hidden md:block" />
              </div>
              <p className="mt-2 text-center text-[13px] text-ink-2" data-testid="ads-range-draft">{preview ? preview.label : "Click a first day, then a last day"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <span className="text-[12.5px] text-ink-3">UTC+08:00</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line-strong px-4 text-[14px] text-ink-2 hover:bg-surface-2">Cancel</button>
              <button type="button" disabled={!draft} onClick={confirm} data-testid="ads-range-confirm" className="h-9 rounded-lg bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-strong disabled:opacity-50">Confirm</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
