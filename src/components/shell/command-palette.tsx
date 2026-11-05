"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, CornerDownLeft, Loader2, Lock, Package, Search, Sparkles, Users, X } from "lucide-react";
import { useCreatorPanel } from "@/components/creators/creator-panel";
import { Person } from "@/components/execution/ui";
import { NAV } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

type Hit =
  | { kind: "page"; label: string; href: string; help: string; locked: boolean }
  | { kind: "product"; label: string; href: string }
  | { kind: "creator"; label: string };
type Reply = { pages: { label: string; href: string; help: string; locked: boolean }[]; products: { key: string; name: string }[]; creators: string[] };

const ICON = new Map(NAV.flatMap((g) => g.items).map((i) => [i.href, i.icon]));
const GROUPS: { kind: Hit["kind"]; title: string }[] = [{ kind: "page", title: "Jump To" }, { kind: "product", title: "Products" }, { kind: "creator", title: "Creators" }];
const RECENT_KEY = "alooma.search.recent";

const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };
const saveRecent = (u: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([u, ...readRecent().filter((x) => x !== u)].slice(0, 5))); } catch { /* private window */ } };

function Mark({ text, q }: { text: string; q: string }) {
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  const i = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-[4px] bg-brand-soft px-0.5 font-semibold text-brand-strong">{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}

/** Ctrl/⌘+K: jump to any screen, open a product, or open any creator's panel from anywhere. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [cur, setCur] = useState(0);
  const router = useRouter();
  const panel = useCreatorPanel();
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = () => { setOpen(false); setQ(""); };
  const show = () => { setRecent(readRecent()); setOpen(true); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => { if (!o) setRecent(readRecent()); return !o; }); }
      if (e.key === "Escape") { setOpen(false); setQ(""); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    let alive = true;
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Reply) => { if (alive) { setReply(d); setCur(0); } })
        .catch(() => undefined)
        .finally(() => { if (alive) setBusy(false); });
    }, q ? 110 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);

  const hits: Hit[] = useMemo(() => {
    if (!reply) return [];
    const recents: Hit[] = !q ? recent.map((c) => ({ kind: "creator" as const, label: c })) : [];
    const all: Hit[] = [
      ...reply.pages.map((p) => ({ kind: "page" as const, ...p })),
      ...reply.products.map((p) => ({ kind: "product" as const, label: p.name, href: `/products/${p.key}` })),
      ...reply.creators.map((c) => ({ kind: "creator" as const, label: c })),
      ...recents,
    ];
    const seen = new Set<string>();
    return all.filter((h) => { const k = `${h.kind}-${h.label}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [reply, recent, q]);

  useEffect(() => { listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest" }); }, [cur]);

  const go = (h: Hit) => {
    close();
    if (h.kind === "creator") { saveRecent(h.label); panel.open(h.label); }
    else router.push(h.href);
  };

  return (
    <>
      <button onClick={show} className="hidden h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink-3 transition-colors hover:border-brand/40 hover:bg-surface-2 sm:flex" aria-label="Search">
        <Search className="size-4" /> Search <kbd className="rounded border border-line px-1.5 text-[12px]">Ctrl K</kbd>
      </button>
      <button onClick={show} className="flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 sm:hidden" aria-label="Search"><Search className="size-5" /></button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[9vh] sm:px-4" role="dialog" aria-modal="true" aria-label="Search" data-testid="search-palette">
          <button className="absolute inset-0 bg-ink/30 backdrop-blur-[3px]" aria-label="Close search" onClick={close} />
          <div className="pal-pop relative w-full max-w-2xl overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-[0_30px_80px_-20px_rgba(20,30,70,0.45)]">
            <div aria-hidden className="pal-glow h-1 bg-gradient-to-r from-[var(--s1)] via-[var(--s7)] to-[var(--s5)]" />
            <div className="relative flex items-center gap-3 px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">{busy ? <Loader2 className="size-[18px] animate-spin" /> : <Search className="size-[18px]" />}</span>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
                  if (e.key === "Enter" && hits[cur]) go(hits[cur]);
                }}
                placeholder="Search screens, products or creators…"
                aria-label="Search screens, products and creators"
                autoComplete="off"
                spellCheck={false}
                style={{ outline: "none", boxShadow: "none" }} className="h-16 min-w-0 flex-1 bg-transparent text-[18px] text-ink placeholder:text-ink-3"
              />
              {q
                ? <button onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear" className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
                : <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-3">Esc</kbd>}
            </div>
            <ul ref={listRef} className="max-h-[52vh] overflow-y-auto border-t border-line px-3 pt-2 pb-3" role="listbox">
              {reply && hits.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-3"><Sparkles className="size-6" /></span>
                  <p className="text-[15px] font-medium text-ink">Nothing found for “{q}”</p>
                  <p className="text-[13px] text-ink-3">Try a creator username, a product name or a screen name.</p>
                </li>
              )}
              {GROUPS.map((g) => {
                const items = hits.map((h, i) => ({ h, i })).filter((x) => x.h.kind === g.kind);
                if (!items.length) return null;
                return (
                  <Fragment key={g.kind}>
                    <li aria-hidden className="px-3 pt-3 pb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{g.kind === "creator" && !q ? "Recent Creators" : g.title}</li>
                    {items.map(({ h, i }, n) => {
                      const sel = i === cur;
                      const Icon = h.kind === "page" ? ICON.get(h.href) ?? ArrowRight : Package;
                      return (
                        <li key={`${h.kind}-${h.label}`} style={{ animationDelay: `${Math.min(n, 8) * 22}ms` }} className="fade-up">
                          <button role="option" aria-selected={sel} onMouseMove={() => setCur(i)} onClick={() => go(h)}
                            className={cn("group flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left transition-colors", sel ? "bg-brand-soft" : "hover:bg-surface-2")}>
                            {h.kind === "creator"
                              ? <Person name={h.label} size={36} />
                              : <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", sel ? "bg-surface text-brand-strong shadow-sm" : "bg-surface-2 text-ink-2", h.kind === "page" && h.locked && "opacity-70")}><Icon className="size-[18px]" /></span>}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium text-ink"><Mark text={h.kind === "creator" ? `@${h.label}` : h.label} q={q} /></span>
                              <span className="block truncate text-[12.5px] text-ink-3">
                                {h.kind === "page" ? (h.locked ? "Your role cannot open this screen" : h.help) : h.kind === "product" ? "Open this product's analysis" : "Open the creator's profile panel"}
                              </span>
                            </span>
                            {h.kind === "page" && h.locked && <Lock className="size-4 shrink-0 text-ink-3" />}
                            <span className={cn("hidden shrink-0 items-center gap-1 text-[12px] font-medium sm:flex", sel ? "text-brand-strong" : "text-transparent")}>{h.kind === "creator" ? "Open" : "Go"}<CornerDownLeft className="size-3.5" /></span>
                          </button>
                        </li>
                      );
                    })}
                  </Fragment>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-5 py-2.5 text-[12px] text-ink-3">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><kbd className="rounded border border-line bg-surface p-0.5"><ArrowUp className="size-3" /></kbd><kbd className="rounded border border-line bg-surface p-0.5"><ArrowDown className="size-3" /></kbd>Move</span>
                <span className="flex items-center gap-1"><kbd className="rounded border border-line bg-surface p-0.5"><CornerDownLeft className="size-3" /></kbd>Open</span>
              </span>
              <span className="flex items-center gap-1.5"><Users className="size-3.5" />Type a username to find a creator</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
