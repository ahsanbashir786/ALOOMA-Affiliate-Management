"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, MessageCircle, Search } from "lucide-react";
import { contactCreatorEverywhere, getCreatorAsks, setCreatorsContacted } from "@/app/actions/execution";
import { CopyButton } from "@/components/ui/copy-button";
import { combinedMessage, KIND_LABEL, videoText } from "@/lib/execution/rules";
import type { CreatorCard } from "@/lib/execution/plan";
import { cn } from "@/lib/utils";
import { PriorityFlag, ProductChip, Person } from "./ui";

type Prio = "all" | "1" | "2" | "3";
type Group = { kind: string; asks: CreatorCard["asks"]; priority: 1 | 2 | 3 };
/** The same kind of ask in several products becomes one line ("Try this product: A, B, C"). */
const groupsOf = (c: CreatorCard): Group[] => {
  const m = new Map<string, Group>();
  for (const a of c.asks) { const g = m.get(a.kind) ?? m.set(a.kind, { kind: a.kind, asks: [], priority: a.priority }).get(a.kind)!; g.asks.push(a); g.priority = Math.min(g.priority, a.priority) as 1 | 2 | 3; }
  return [...m.values()].sort((x, y) => x.priority - y.priority);
};
const joinNames = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);

/** One row per creator with every open ask about them, across all products, so each person is contacted once. */
export function CreatorsView({ canManage, onOpenTask }: { canManage: boolean; onOpenTask: (taskId: string) => void }) {
  const [items, setItems] = useState<CreatorCard[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "mine">(canManage ? "all" : "mine");
  const [show, setShow] = useState<"todo" | "all">("todo");
  const [prio, setPrio] = useState<Prio>("all");
  const [multi, setMulti] = useState(false);
  const [lang, setLang] = useState<"ms" | "en">("ms");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (offset: number, reset: boolean) => {
    const mine = ++seq.current;
    setLoading(true);
    const r = await getCreatorAsks(offset, q, scope, show, prio, multi);
    if (mine !== seq.current) return;
    setLoading(false);
    if ("error" in r) { setError(r.error); return; }
    setError(null);
    setItems((cur) => (reset ? r.items : [...cur, ...r.items]));
    setTotal(r.total);
  }, [q, scope, show, prio, multi]);

  useEffect(() => {
    const t = setTimeout(() => { void load(0, true); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const tickGroup = async (c: CreatorCard, g: Group, on: boolean) => {
    const ids = new Set(g.asks.map((a) => a.task));
    setItems((cur) => cur.map((x) => (x.name !== c.name ? x : { ...x, contacted: x.asks.filter((a) => (ids.has(a.task) ? on : a.done)).length, asks: x.asks.map((a) => (ids.has(a.task) ? { ...a, done: on } : a)) })));
    for (const id of ids) { const r = await setCreatorsContacted(id, [c.name], on); if (r.error) { setError(r.error); void load(0, true); return; } }
  };
  const tickAll = async (c: CreatorCard, on: boolean) => {
    setItems((cur) => cur.map((x) => (x.name !== c.name ? x : { ...x, contacted: on ? x.asks.length : 0, asks: x.asks.map((a) => ({ ...a, done: on })) })));
    const r = await contactCreatorEverywhere(c.name, on);
    if (r.error) { setError(r.error); void load(0, true); }
  };

  const chip = (on: boolean, label: string, click: () => void, testId?: string) => (
    <button key={label} data-testid={testId} aria-pressed={on} onClick={click} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13.5px] font-medium transition-colors", on ? "border-brand/30 bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}>{label}</button>
  );

  return (
    <div data-testid="creators-view" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-72 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
          <input data-testid="bc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators" className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-[14px] placeholder:text-ink-3" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip(scope === "all", "All Creators", () => setScope("all"), "bc-all")}
          {chip(scope === "mine", "My Actions", () => setScope("mine"), "bc-mine")}
        </div>
        <span className="hidden h-5 w-px bg-line-strong sm:block" />
        <div className="flex flex-wrap gap-1.5">
          {chip(show === "todo", "To Contact", () => setShow("todo"), "bc-todo")}
          {chip(show === "all", "Everyone", () => setShow("all"))}
          {chip(multi, "Several Asks", () => setMulti((v) => !v), "bc-multi")}
        </div>
        <span className="hidden h-5 w-px bg-line-strong sm:block" />
        <div className="flex flex-wrap gap-1.5">{([["all", "Any Priority"], ["1", "High"], ["2", "Medium"], ["3", "Normal"]] as const).map(([k, l]) => chip(prio === k, l, () => setPrio(k)))}</div>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-line-strong text-[12px] font-medium">
          {(["ms", "en"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={cn("px-2 py-1.5", lang === l ? "bg-brand-soft text-brand-strong" : "bg-surface text-ink-2")}>{l === "ms" ? "Malay" : "English"}</button>)}
        </div>
      </div>
      <p className="text-[13.5px] text-ink-3" data-testid="bc-total"><b className="tnum font-semibold text-ink-2">{total}</b> creator{total === 1 ? "" : "s"} · each person once, with every ask across all products. Biggest priority first.</p>
      {error && <p role="alert" className="rounded-lg bg-critical-soft px-3 py-2 text-[13px] text-critical">{error}</p>}

      <ul className="space-y-3">
        {items.map((c) => {
          const allDone = c.asks.every((a) => a.done);
          const groups = groupsOf(c);
          const msg = combinedMessage(c.name, groups.map((g) => ({ kind: g.kind, product: joinNames(g.asks.map((a) => a.productName)), data: g.asks[0].data })), lang);
          const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}` : null;
          return (
            <li key={c.name} data-testid="bc-card" className={cn("overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card", allDone && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-2/50 px-4 py-3">
                <Person name={c.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5">
                    <Link href={`/creators/${encodeURIComponent(c.name)}`} className="truncate text-[15.5px] font-semibold text-ink hover:text-brand-strong hover:underline">@{c.name}</Link>
                    <PriorityFlag p={c.best} label />
                  </div>
                  <p className="text-[12.5px] text-ink-3">{groups.length} ask{groups.length === 1 ? "" : "s"} · {c.products} product{c.products === 1 ? "" : "s"}{c.owner ? ` · Owner: ${c.owner}` : ""} · {groups.filter((g) => g.asks.every((a) => a.done)).length} of {groups.length} done</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {wa && !allDone && <a href={wa} target="_blank" rel="noreferrer" onClick={() => { void tickAll(c, true); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 text-[13px] font-medium text-white hover:brightness-95" title="Open WhatsApp with one message for all asks, and tick them"><MessageCircle className="size-4" />WhatsApp</a>}
                  {!allDone && <CopyButton text={msg} label="One Message" />}
                  <button data-testid="bc-tick-all" onClick={() => tickAll(c, !allDone)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium", allDone ? "border-good/40 text-good" : "border-line-strong text-ink-2 hover:bg-surface-2")}><Check className="size-4" />{allDone ? "All Done" : "Tick All"}</button>
                </div>
              </div>
              <ul className="divide-y divide-line">
                {groups.map((g) => {
                  const done = g.asks.every((a) => a.done);
                  const first = g.asks[0];
                  return (
                    <li key={g.kind} data-testid="bc-ask" className="flex items-start gap-3 px-4 py-2.5">
                      <button aria-label={done ? "Untick" : "Tick as contacted"} onClick={() => tickGroup(c, g, !done)} className={cn("mt-0.5 flex size-[20px] shrink-0 items-center justify-center rounded-md border-2", done ? "border-good bg-good text-white" : "border-line-strong hover:border-brand")}>{done && <Check className="size-3.5" strokeWidth={3} />}</button>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2"><PriorityFlag p={g.priority} /><span className={cn("text-[14px] font-semibold", done ? "text-ink-3" : "text-ink")}>{KIND_LABEL[g.kind] ?? g.kind}</span>
                          {g.asks.map((a) => <button key={a.task} onClick={() => onOpenTask(a.task)} title="Open this action" className="rounded-md"><ProductChip name={a.productName} className={a.done ? "opacity-60" : ""} /></button>)}</p>
                        {g.asks.length === 1 && <p className="mt-0.5 text-[12.5px] text-ink-3">{first.note}</p>}
                        {g.asks.length > 1 && <p className="mt-0.5 text-[12.5px] text-ink-3">{first.note}{g.kind === "cross_sell" ? ` · ${g.asks.length} products to offer` : ""}</p>}
                        {first.data.videos?.[0] && (
                          <p className="mt-1 flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[12.5px] text-ink-2"><span className="min-w-0 flex-1">{videoText(first.data.videos[0])}</span>{first.data.videos[0].url && <a href={first.data.videos[0].url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-strong hover:underline">Watch<ExternalLink className="size-3" /></a>}</p>
                        )}
                      </div>
                      <button onClick={() => onOpenTask(first.task)} className="shrink-0 text-[12.5px] font-medium text-brand-strong hover:underline">Open Action</button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
        {!items.length && !loading && <li className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-[14px] text-ink-3">{show === "todo" ? "Nobody left to contact here." : "No creators match."}</li>}
        {loading && !items.length && <li className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-ink-3" /></li>}
      </ul>
      {items.length < total && (
        <button onClick={() => load(items.length, false)} disabled={loading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line-strong text-[14px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}Show More <span className="text-ink-3">({items.length} of {total})</span></button>
      )}
    </div>
  );
}
