"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User } from "lucide-react";
import { useCreatorPanel } from "@/components/creator/creator-panel";
import { cn } from "@/lib/utils";

type Hit = { kind: "page" | "creator"; label: string; href?: string };

/** Ctrl/⌘+K: jump to any page or open any creator's panel from anywhere. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [cur, setCur] = useState(0);
  const router = useRouter();
  const panel = useCreatorPanel();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { pages: { label: string; href: string }[]; creators: string[] }) => {
          if (!alive) return;
          setHits([...d.pages.map((p) => ({ kind: "page" as const, label: p.label, href: p.href })), ...d.creators.map((c) => ({ kind: "creator" as const, label: c }))]);
          setCur(0);
        })
        .catch(() => undefined);
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    if (h.kind === "page" && h.href) router.push(h.href);
    else panel.open(h.label);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="hidden h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink-3 hover:bg-surface-2 sm:flex" aria-label="Search">
        <Search className="size-4" /> Search <kbd className="rounded border border-line px-1.5 text-[12px]">Ctrl K</kbd>
      </button>
      <button onClick={() => setOpen(true)} className="flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 sm:hidden" aria-label="Search"><Search className="size-5" /></button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
          <button className="absolute inset-0 bg-black/40" aria-label="Close search" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-xl">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-ink-3" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
                  if (e.key === "Enter" && hits[cur]) go(hits[cur]);
                }}
                placeholder="Go to a page or find a creator…"
                aria-label="Search pages and creators"
                className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
              {hits.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-ink-3">Nothing found.</li>}
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.label}`}>
                  <button role="option" aria-selected={i === cur} onMouseEnter={() => setCur(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px]", i === cur ? "bg-surface-2" : "")}>
                    {h.kind === "creator" ? <User className="size-4 text-ink-3" /> : <span className="size-4 text-ink-3">→</span>}
                    <span className="flex-1 text-ink">{h.kind === "creator" ? `@${h.label}` : h.label}</span>
                    <span className="text-[12.5px] text-ink-3">{h.kind === "creator" ? "Creator" : "Page"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
