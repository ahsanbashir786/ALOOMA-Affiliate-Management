"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small info icon. The explanation shows when you hover, focus or tap it, so the screen can stay clean.
 * It floats above everything (it is never cut off by a table or card) and stays inside the screen.
 */
export function InfoTip({ children, label = "More information", className, side = "bottom" }: { children: React.ReactNode; label?: string; className?: string; side?: "bottom" | "top" }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 120); };

  useEffect(() => {
    if (!open || !btn.current) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    setPos({ top: side === "top" ? r.top - 8 : r.bottom + 8, left });
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e.target instanceof Node && (btn.current?.contains(e.target) || box.current?.contains(e.target))) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const scroll = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", scroll, true); };
  }, [open]);

  return (
    <span className={cn("inline-flex align-middle", className)}>
      <button ref={btn} type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} data-testid="info-tip"
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex size-[18px] items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-brand-soft hover:text-brand focus-visible:text-brand">
        <Info className="size-[15px]" />
      </button>
      {open && (
        <span ref={box} id={id} role="tooltip" data-testid="info-tip-text" onMouseEnter={show} onMouseLeave={hide}
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: "max-content", maxWidth: Math.min(320, typeof window === "undefined" ? 320 : window.innerWidth - 24), transform: side === "top" ? "translateY(-100%)" : undefined, visibility: pos ? "visible" : "hidden" }}
          className="z-[60] rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-[13px] leading-snug font-normal text-ink-2 shadow-pop">
          {children}
        </span>
      )}
    </span>
  );
}
