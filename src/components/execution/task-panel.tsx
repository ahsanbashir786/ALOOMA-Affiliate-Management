"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CheckCircle2, ListChecks, MessageSquare, Send, Users, X } from "lucide-react";
import { MESSAGES, PRIORITY_LABEL } from "@/lib/execution/rules";
import type { PlanData, Staff, Status, TaskView } from "@/lib/execution/plan";
import { fmtDateTimeKL } from "@/lib/time";
import { cn, fmtRM } from "@/lib/utils";
import { CreatorList } from "./creator-list";
import { CategoryChip, dueInfo, PeoplePicker, PersonStack, Popover, PriorityFlag, ProductTile, productColor, productTint, StatusIcon, STATUS_META } from "./ui";

export type Mutate = {
  status: (id: string, s: Status, note?: string) => void;
  due: (id: string, d: string | null) => void;
  assign: (id: string, ids: string[]) => void;
  step: (id: string, i: number) => void;
  comment: (id: string, text: string) => void;
  contacted: (id: string, n: number) => void;
};

const SEGMENTS: Status[] = ["not_started", "pending", "done"];
const EVENT_LABEL: Record<string, string> = { created: "Created", status: "Status", assigned: "Assignment", due: "Due date", comment: "Note", auto_closed: "Solved" };

function Block({ icon: Icon, title, right, children }: { icon: typeof Users; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase"><Icon className="size-4 text-ink-3" />{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TaskPanel({ task, data, me, canManage, mutate, onClose, onNav }: {
  task: TaskView; data: PlanData; me: string; canManage: boolean; mutate: Mutate; onClose: () => void; onNav: (dir: 1 | -1) => void;
}) {
  const [note, setNote] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [lang, setLang] = useState<"ms" | "en">("ms");
  const canEdit = canManage || task.assignees.includes(me);
  const open = task.status === "not_started" || task.status === "pending";
  const closed = task.status === "skipped" || task.status === "auto_closed";
  const due = dueInfo(task.dueOn, data.today, open);
  const doneSteps = task.stepsDone.length;
  const brief = data.products.find((p) => p.key === task.productKey);
  const msg = MESSAGES[task.kind];

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); onNav(1); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); onNav(-1); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onNav]);

  return (
    <>
      <button aria-label="Close panel" onClick={onClose} className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] lg:bg-black/10" />
      <aside data-testid="task-panel" role="dialog" aria-label={task.title} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-line-strong bg-surface shadow-2xl">
        <header className="border-b border-line px-5 pt-4 pb-4" style={{ background: productTint(task.productKey, 7), boxShadow: `inset 0 4px 0 ${productColor(task.productKey)}` }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={`/products/${task.productKey}`} className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink hover:underline"><ProductTile k={task.productKey} size={26} />{task.productName}<ArrowUpRight className="size-3.5 text-ink-3" /></Link>
              <CategoryChip c={task.category} />
              <PriorityFlag p={task.priority} label />
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close"><X className="size-5" /></button>
          </div>
          <h2 className="text-[19px] leading-snug font-semibold tracking-tight text-ink">{task.title}</h2>

          <div className="mt-3.5 flex flex-wrap items-center gap-2" role="group" aria-label="Status">
            {closed ? (
              <span className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold", STATUS_META[task.status].cls)}><StatusIcon status={task.status} size={16} />{STATUS_META[task.status].label}{task.closedReason && <span className="font-normal text-ink-2">· {task.closedReason}</span>}</span>
            ) : (
              <div className="inline-flex overflow-hidden rounded-lg border border-line-strong">
                {SEGMENTS.map((s) => (
                  <button key={s} data-testid={`set-${s}`} disabled={!canEdit} onClick={() => mutate.status(task.id, s)} aria-pressed={task.status === s}
                    className={cn("inline-flex items-center gap-1.5 border-r border-line-strong px-3 py-1.5 text-[13.5px] font-medium last:border-r-0 disabled:opacity-60", task.status === s ? cn(STATUS_META[s].cls, "font-semibold") : "bg-surface text-ink-2 hover:bg-surface-2")}>
                    <StatusIcon status={s} size={15} />{STATUS_META[s].label}
                  </button>
                ))}
              </div>
            )}
            {canEdit && open && <button onClick={() => setSkipping((v) => !v)} className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink">Not Needed</button>}
            {canEdit && closed && task.status === "skipped" && <button onClick={() => mutate.status(task.id, "not_started")} className="rounded-lg px-2.5 py-1.5 text-[13px] text-brand-strong hover:bg-surface-2">Reopen</button>}
          </div>
          {skipping && (
            <div className="mt-3 flex gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it not needed? (short)" className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[14px]" />
              <button onClick={() => { mutate.status(task.id, "skipped", reason.trim() || "Marked not needed."); setSkipping(false); setReason(""); }} className="h-9 rounded-lg bg-ink px-3 text-[13.5px] font-medium text-white">Confirm</button>
            </div>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px]">
            <div>
              <dt className="mb-1 text-[12px] font-medium text-ink-3">Assigned To</dt>
              <dd>
                {canManage ? (
                  <Popover testId="assign-pop" trigger={<span className="inline-flex rounded-lg border border-transparent px-1 py-0.5 hover:border-line-strong hover:bg-surface-2"><PersonStack ids={task.assignees} staff={data.staff} size={26} /></span>}>
                    <PeoplePicker staff={data.staff} value={task.assignees} onChange={(ids) => mutate.assign(task.id, ids)} />
                  </Popover>
                ) : <PersonStack ids={task.assignees} staff={data.staff} size={26} />}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-[12px] font-medium text-ink-3">Complete By</dt>
              <dd className="flex items-center gap-2">
                <CalendarDays className="size-4 text-ink-3" />
                {canManage && open ? (
                  <input type="date" data-testid="due-input" value={task.dueOn ?? ""} onChange={(e) => mutate.due(task.id, e.target.value || null)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13.5px]" />
                ) : <span className={due.tone}>{task.dueOn ? `${due.text}` : "No Date"}</span>}
                {canManage && open && task.dueOn && <span className={cn("text-[12.5px]", due.tone)}>{due.text}</span>}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-[12px] font-medium text-ink-3">Sales At Stake</dt>
              <dd className="tnum font-semibold text-ink">{task.impactRm > 0 ? fmtRM(task.impactRm) : "Saves cost"}</dd>
            </div>
            <div>
              <dt className="mb-1 text-[12px] font-medium text-ink-3">Priority</dt>
              <dd className="text-ink">{PRIORITY_LABEL[task.priority]}</dd>
            </div>
          </dl>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="px-5 py-4">
            <h3 className="mb-1.5 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Why This Task</h3>
            <p className="text-[14.5px] leading-relaxed text-ink">{task.summary}</p>
            {brief && (
              <p className="mt-2.5 text-[13px] text-ink-3">
                {brief.name} is <b className="font-semibold text-ink-2">{brief.tag}</b>
                {brief.changePct != null && <> ({brief.changePct > 0 ? "+" : ""}{Math.round(brief.changePct)}%)</>}
                {brief.fragile != null && <>, {brief.fragile ? "Fragile" : "Healthy"}</>}. <Link href={`/products/${task.productKey}`} className="font-medium text-brand-strong hover:underline">See the full analysis</Link>
              </p>
            )}
          </section>

          <Block icon={ListChecks} title="Plan To Do" right={<span className="tnum text-[13px] text-ink-3">{doneSteps} of {task.steps.length}</span>}>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-good transition-all" style={{ width: `${task.steps.length ? (doneSteps / task.steps.length) * 100 : 0}%` }} /></div>
            <ol className="space-y-1">
              {task.steps.map((s, i) => {
                const on = task.stepsDone.includes(i);
                return (
                  <li key={i}>
                    <button data-testid="step" disabled={!canEdit || closed} onClick={() => mutate.step(task.id, i)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 disabled:hover:bg-transparent">
                      <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-md border-2", on ? "border-good bg-good text-white" : "border-line-strong")}>{on && <CheckCircle2 className="size-3.5" strokeWidth={3} />}</span>
                      <span className={cn("text-[14.5px] leading-snug", on ? "text-ink-3 line-through" : "text-ink")}>{s}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Block>

          {task.creatorCount > 0 && (
            <Block icon={Users} title={`Creators To Contact · ${task.creatorCount}`} right={msg && (
              <div className="inline-flex overflow-hidden rounded-md border border-line-strong text-[12px] font-medium">
                {(["ms", "en"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={cn("px-2 py-1", lang === l ? "bg-ink text-white" : "bg-surface text-ink-2")}>{l === "ms" ? "Malay" : "English"}</button>)}
              </div>
            )}>
              <CreatorList key={task.id} taskId={task.id} kind={task.kind} product={task.productName} canEdit={canEdit} closed={closed} total={task.creatorCount} contacted={task.contactedCount} lang={lang} onContacted={(n) => mutate.contacted(task.id, n)} />
            </Block>
          )}

          <Block icon={MessageSquare} title="Notes And History" right={<span className="tnum text-[13px] text-ink-3">{task.events.length}</span>}>
            {(canEdit && !closed) && (
              <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { mutate.comment(task.id, note.trim()); setNote(""); } }}>
                <input data-testid="note-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write what you did or what you found" maxLength={1000} className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[14px] placeholder:text-ink-3" />
                <button type="submit" disabled={!note.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13.5px] font-medium text-white disabled:opacity-50"><Send className="size-4" />Add</button>
              </form>
            )}
            <ol className="space-y-3">
              {[...task.events].reverse().map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", e.kind === "comment" ? "bg-brand" : "bg-line-strong")} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink-3"><b className="font-semibold text-ink-2">{e.user ?? "System"}</b> · {EVENT_LABEL[e.kind] ?? e.kind} · {fmtDateTimeKL(e.at)}</p>
                    {e.text && <p className="mt-0.5 text-[14px] break-words text-ink">{e.text}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Block>
        </div>
        <footer className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3">
          <span className="hidden sm:inline">Use <kbd className="rounded border border-line-strong px-1">↑</kbd> <kbd className="rounded border border-line-strong px-1">↓</kbd> to move between actions, <kbd className="rounded border border-line-strong px-1">Esc</kbd> to close</span>
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => onNav(-1)} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2">Previous</button>
            <button onClick={() => onNav(1)} data-testid="next-task" className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2">Next</button>
          </span>
        </footer>
      </aside>
    </>
  );
}

export type { Staff };
