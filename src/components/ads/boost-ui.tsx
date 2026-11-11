"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small visual building blocks of the Boost Studio. */

export const rmShort = (n: number) => `RM ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** − [RM 5] +  and quick amounts. */
export function BudgetStepper({ value, onChange, max, min = 1, chips = [5, 10, 15, 20], disabled, testId, compact }: { value: string; onChange: (v: string) => void; max: number; min?: number; chips?: number[]; disabled?: boolean; testId?: string; compact?: boolean }) {
  const n = Number(value);
  const step = (d: number) => onChange(String(Math.max(min, Math.min(max, (Number.isFinite(n) ? n : 0) + d))));
  const over = n > max || n < min;
  return (
    <div className={cn("flex flex-col gap-1.5", disabled && "opacity-50")}>
      <div className={cn("inline-flex items-center rounded-full border bg-surface-2/60 p-1", over ? "border-critical/50" : "border-line-strong")}>
        <button type="button" onClick={() => step(-1)} disabled={disabled} aria-label="Less" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface"><Minus className="size-4" /></button>
        <label className="flex items-baseline justify-center gap-1 px-1">
          <span className="text-[12px] font-medium text-ink-3">RM</span>
          <input type="number" inputMode="decimal" min={min} max={max} step={0.5} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label="Daily budget in RM"
            className={cn("tnum bg-transparent text-center font-semibold text-ink focus:outline-none", compact ? "w-12 text-[16px]" : "w-16 text-[20px]")} />
        </label>
        <button type="button" onClick={() => step(1)} disabled={disabled} aria-label="More" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface"><Plus className="size-4" /></button>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.filter((c) => c <= max).map((c) => <button key={c} type="button" disabled={disabled} onClick={() => onChange(String(c))} className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium", n === c ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:bg-brand-soft hover:text-brand-strong")}>{c}</button>)}
      </div>
    </div>
  );
}

/** Half-circle gauge: what is already running, what this launch adds, and what is left under your daily limit. */
export function SpendGauge({ running, adding, cap, size = 220 }: { running: number; adding: number; cap: number; size?: number }) {
  const r = size / 2 - 16, cx = size / 2, cy = size / 2, C = Math.PI * r;
  const total = running + adding, over = total > cap;
  const frac = (x: number) => Math.min(1, Math.max(0, x / Math.max(cap, 1)));
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const tone = over ? "var(--critical)" : total / cap > 0.8 ? "var(--warn)" : "var(--brand)";
  return (
    <div className="relative mx-auto" style={{ width: size, height: size / 2 + 34 }} role="img" aria-label={`Daily spend RM ${total} of RM ${cap}`} data-testid="boost-gauge" data-over={over ? "1" : "0"}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={arc} fill="none" stroke="var(--line)" strokeWidth={16} strokeLinecap="round" />
        <path d={arc} fill="none" stroke={tone} strokeWidth={16} strokeLinecap="round" strokeDasharray={`${C * frac(total)} ${C}`} style={{ transition: "stroke-dasharray .5s cubic-bezier(.2,.8,.2,1)" }} />
        {running > 0 && <path d={arc} fill="none" stroke="var(--ink-3)" strokeOpacity={0.6} strokeWidth={16} strokeLinecap="round" strokeDasharray={`${C * frac(running)} ${C}`} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="tnum text-[30px] leading-none font-semibold text-ink">{rmShort(total)}</p>
        <p className={cn("mt-1 text-[12.5px]", over ? "font-medium text-critical" : "text-ink-3")}>{over ? `over your RM ${cap} limit` : `of RM ${cap} a day`}</p>
      </div>
    </div>
  );
}

/** Press and hold to launch: a deliberate action for something that spends money. Mouse, touch and keyboard (hold Enter or Space). */
export function HoldToLaunch({ onDone, label, doneLabel = "Launching…", disabled, busy, ms = 1200, testId, hint }: { onDone: () => void; label: string; doneLabel?: string; disabled?: boolean; busy?: boolean; ms?: number; testId?: string; hint?: string }) {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null), t0 = useRef(0), fired = useRef(false);
  const stop = useCallback(() => { if (raf.current != null) cancelAnimationFrame(raf.current); raf.current = null; if (!fired.current) setP(0); }, []);
  const start = useCallback(() => {
    if (disabled || busy || raf.current != null) return;
    fired.current = false; t0.current = performance.now();
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / ms);
      setP(v);
      if (v >= 1) { fired.current = true; raf.current = null; onDone(); setTimeout(() => { fired.current = false; setP(0); }, 400); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [disabled, busy, ms, onDone]);
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);
  const on = p > 0 || busy;
  return (
    <div>
      <button type="button" disabled={disabled} data-testid={testId} data-progress={Math.round(p * 100)} aria-label={`${label} (press and hold)`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
        className={cn("relative flex h-14 w-full touch-none items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand text-[16px] font-semibold text-white select-none", "disabled:cursor-not-allowed disabled:opacity-45", !disabled && !on && "hover:bg-brand-strong")}>
        <span aria-hidden className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${p * 100}%` }} />
        {!disabled && !on && <span aria-hidden className="bx-shine absolute inset-0" />}
        <span className="relative inline-flex items-center gap-2"><Rocket className={cn("size-5", on && "animate-pulse")} />{busy || p >= 1 ? doneLabel : label}</span>
      </button>
      <p className="mt-1.5 text-center text-[12px] text-ink-3">{hint ?? "Press and hold"}</p>
    </div>
  );
}
