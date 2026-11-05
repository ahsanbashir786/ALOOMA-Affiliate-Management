"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserRound, X } from "lucide-react";
import { assignOwners, assignOwnersByFilter, restoreOwners, type OwnerBefore } from "@/app/actions/creators";
import { markContacted, undoEvent } from "@/app/actions/workflow";
import { cn } from "@/lib/utils";

type Ctx = {
  canAct: boolean;
  selected: Set<string>;
  allMatching: boolean;
  pageNames: string[];
  total: number;
  toggle: (u: string) => void;
  setPage: (on: boolean) => void;
  selectAllMatching: () => void;
  clear: () => void;
};
const BulkCtx = createContext<Ctx | null>(null);
const useBulk = () => useContext(BulkCtx);

/** Selection for the Creators table. Managers tick creators; everyone else sees no tick boxes. */
export function BulkProvider({ canAct, pageNames, total, params, staff, children }: { canAct: boolean; pageNames: string[]; total: number; params: Record<string, string>; staff: { id: string; name: string }[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const ctx: Ctx = {
    canAct, selected, allMatching, pageNames, total,
    toggle: (u) => { setAllMatching(false); setSelected((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; }); },
    setPage: (on) => { setAllMatching(false); setSelected(on ? new Set(pageNames) : new Set()); },
    selectAllMatching: () => { setSelected(new Set(pageNames)); setAllMatching(true); },
    clear: () => { setSelected(new Set()); setAllMatching(false); },
  };
  return <BulkCtx.Provider value={ctx}>{children}{canAct && <BulkBar staff={staff} params={params} />}</BulkCtx.Provider>;
}

export function RowCheck({ username }: { username: string }) {
  const b = useBulk();
  if (!b?.canAct) return null;
  return <input type="checkbox" aria-label={`Select @${username}`} data-testid={`sel-${username}`} checked={b.selected.has(username)} onChange={() => b.toggle(username)} className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--brand)]" />;
}

export function SelectAllPage() {
  const b = useBulk();
  if (!b?.canAct || !b.pageNames.length) return null;
  const all = b.pageNames.every((n) => b.selected.has(n));
  return <input type="checkbox" aria-label="Select everyone on this page" data-testid="sel-page" checked={all} onChange={() => b.setPage(!all)} className="size-4 cursor-pointer accent-[var(--brand)]" />;
}

type Step = { kind: "owner" | "contacted"; ownerId: string | null; ownerName: string };
type Done = { text: string; undo: () => Promise<unknown> };

function BulkBar({ staff, params }: { staff: { id: string; name: string }[]; params: Record<string, string> }) {
  const b = useBulk()!;
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const [step, setStep] = useState<Step | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const n = b.allMatching ? b.total : b.selected.size;
  const pageAll = b.pageNames.length > 0 && b.pageNames.every((x) => b.selected.has(x));
  const reset = () => { setStep(null); setOwner(""); b.clear(); };

  const run = () => {
    if (!step) return;
    setErr("");
    start(async () => {
      if (step.kind === "owner") {
        const r = b.allMatching ? await assignOwnersByFilter(params, step.ownerId, n) : await assignOwners([...b.selected], step.ownerId, n);
        if (r.error) { setErr(r.error); return; }
        const prev = r.previous as OwnerBefore[];
        setDone({ text: step.ownerId ? `${r.count} creators now belong to ${step.ownerName}.` : `${r.count} creators have no owner now.`, undo: () => restoreOwners(prev) });
      } else {
        const r = await markContacted([...b.selected], n);
        if (r.error) { setErr(r.error); return; }
        const id = r.eventId;
        setDone({ text: `${r.count} creators marked as contacted.`, undo: () => (id ? undoEvent(id) : Promise.resolve()) });
      }
      reset();
      router.refresh();
    });
  };

  if (!n && !done) return null;
  return (
    <div role="region" aria-label="Bulk actions" data-testid="bulk-bar" className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line-strong bg-surface px-4 py-3 shadow-xl lg:left-[calc(256px+0.75rem)]">
      {done && !n ? (
        <>
          <span className="flex items-center gap-2 text-[14px] text-ink"><Check className="size-4 text-good" />{done.text}</span>
          <button type="button" disabled={pending} onClick={() => start(async () => { await done.undo(); setDone(null); router.refresh(); })} className="ml-auto h-8 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium hover:bg-surface-2">Undo</button>
          <button type="button" aria-label="Close" onClick={() => setDone(null)} className="rounded-md p-1 text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </>
      ) : step ? (
        <>
          <span className="text-[14px] font-medium text-ink" data-testid="bulk-confirm">
            {step.kind === "owner" ? (step.ownerId ? `Give ${n.toLocaleString("en-MY")} creators to ${step.ownerName}?` : `Remove the owner of ${n.toLocaleString("en-MY")} creators?`) : `Mark ${n} creators as contacted?`}
          </span>
          {err && <span className="text-[13px] text-critical">{err}</span>}
          <span className="ml-auto flex gap-2">
            <button type="button" disabled={pending} onClick={() => { setStep(null); setErr(""); }} className="h-8 rounded-lg px-3 text-[13.5px] text-ink-2 hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending} onClick={run} data-testid="bulk-confirm-yes" className="h-8 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Working…" : "Confirm"}</button>
          </span>
        </>
      ) : (
        <>
          <span className="text-[14px] font-medium text-ink" data-testid="bulk-count">{b.allMatching ? `All ${b.total.toLocaleString("en-MY")} matching selected` : `${n} selected`}</span>
          {!b.allMatching && pageAll && b.total > b.pageNames.length && (
            <button type="button" onClick={b.selectAllMatching} data-testid="bulk-select-all" className="text-[13.5px] font-medium text-brand hover:underline">Select all {b.total.toLocaleString("en-MY")} matching</button>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 text-[13.5px]">
              <UserRound className="size-4 text-ink-3" />
              <select aria-label="Assign to" value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 cursor-pointer bg-transparent outline-none">
                <option value="">Assign owner…</option>
                <option value="none">No owner</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={!owner} onClick={() => setStep({ kind: "owner", ownerId: owner === "none" ? null : owner, ownerName: staff.find((s) => s.id === owner)?.name ?? "" })} data-testid="bulk-assign" className="h-8 rounded-lg bg-brand px-3 text-[13.5px] font-medium text-white hover:opacity-90 disabled:opacity-40">Assign</button>
            <button type="button" disabled={b.allMatching || n > 200} title={b.allMatching || n > 200 ? "Pick up to 200 creators to mark as contacted" : undefined} onClick={() => setStep({ kind: "contacted", ownerId: null, ownerName: "" })} data-testid="bulk-contacted" className={cn("h-8 rounded-lg border border-line-strong px-3 text-[13.5px] font-medium hover:bg-surface-2 disabled:opacity-40")}>Mark contacted</button>
            <button type="button" aria-label="Clear selection" onClick={b.clear} className="rounded-md p-1 text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
          </span>
        </>
      )}
    </div>
  );
}
