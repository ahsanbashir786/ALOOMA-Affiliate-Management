"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, CircleDot, CircleSlash, Flag, Sparkles } from "lucide-react";
import { daysBetweenISO, fmtDayLabel } from "@/lib/time";
import { CATEGORY_LABEL } from "@/lib/execution/rules";
import type { Status, Staff } from "@/lib/execution/plan";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<Status, { label: string; cls: string; dot: string }> = {
  not_started: { label: "Not Started", cls: "bg-surface-2 text-ink-2", dot: "text-ink-3" },
  pending: { label: "Pending", cls: "bg-warn-soft text-warn", dot: "text-warn" },
  done: { label: "Done", cls: "bg-good-soft text-good", dot: "text-good" },
  skipped: { label: "Not Needed", cls: "bg-surface-2 text-ink-3", dot: "text-ink-3" },
  auto_closed: { label: "Solved", cls: "bg-brand-soft text-brand-strong", dot: "text-brand" },
};
export const NEXT_STATUS: Record<string, Status> = { not_started: "pending", pending: "done", done: "not_started" };

export function StatusIcon({ status, size = 20, className }: { status: Status; size?: number; className?: string }) {
  const c = cn(STATUS_META[status].dot, className);
  if (status === "done") return <span className={cn("inline-flex items-center justify-center rounded-full bg-good text-white", className)} style={{ width: size, height: size }}><Check style={{ width: size * 0.65, height: size * 0.65 }} strokeWidth={3} /></span>;
  if (status === "pending") return <CircleDot className={c} style={{ width: size, height: size }} strokeWidth={2.2} />;
  if (status === "skipped") return <CircleSlash className={c} style={{ width: size, height: size }} />;
  if (status === "auto_closed") return <Sparkles className={c} style={{ width: size, height: size }} />;
  return <CircleDashed className={c} style={{ width: size, height: size }} strokeWidth={2} />;
}

export function StatusPill({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap", m.cls)}><StatusIcon status={status} size={14} />{m.label}</span>;
}

const PRI = { 1: { l: "High", c: "text-critical" }, 2: { l: "Medium", c: "text-warn" }, 3: { l: "Low", c: "text-ink-3" } } as const;
export function PriorityFlag({ p, label = false }: { p: 1 | 2 | 3; label?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1 text-[12.5px] font-medium", PRI[p].c)} title={`${PRI[p].l} priority`}><Flag className="size-3.5" fill="currentColor" />{label && PRI[p].l}</span>;
}

export const CATEGORY_COLOR: Record<string, string> = { content: "var(--s1)", creators: "var(--s3)", samples: "var(--s2)", shop: "var(--s7)" };
export function CategoryChip({ c }: { c: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap text-ink-2"><span className="size-2 rounded-sm" style={{ background: CATEGORY_COLOR[c] ?? "var(--ink-3)" }} />{CATEGORY_LABEL(c)}</span>;
}

const TONES = ["#264482", "#2f7d6d", "#a8602a", "#6f4a9e", "#2b78a8", "#a03a52", "#5b7a2a"];
export function Person({ name, size = 24, ring = false }: { name: string; size?: number; ring?: boolean }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const parts = name.trim().split(/\s+/);
  const letters = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return <span title={name} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", ring && "ring-2 ring-surface")} style={{ width: size, height: size, background: TONES[h % TONES.length], fontSize: Math.round(size * 0.4) }}>{letters}</span>;
}
export function PersonStack({ ids, staff, size = 24 }: { ids: string[]; staff: Staff[]; size?: number }) {
  const list = ids.map((i) => staff.find((s) => s.id === i)).filter(Boolean) as Staff[];
  if (!list.length) return <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3"><span className="inline-flex items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3" style={{ width: size, height: size }}>+</span>Unassigned</span>;
  return (
    <span className="inline-flex items-center" title={list.map((s) => s.name).join(", ")}>
      <span className="flex -space-x-1.5">{list.slice(0, 3).map((s) => <Person key={s.id} name={s.name} size={size} ring />)}</span>
      {list.length > 3 && <span className="ml-1 text-[12px] text-ink-3">+{list.length - 3}</span>}
      {list.length === 1 && <span className="ml-1.5 hidden text-[13px] text-ink-2 xl:inline">{list[0].name.split(" ")[0]}</span>}
    </span>
  );
}

/** "Today", "Tomorrow", "Overdue 3d", or the date; tone says how urgent it is. */
export function dueInfo(due: string | null, today: string, open: boolean): { text: string; tone: string; overdue: boolean } {
  if (!due) return { text: "No Date", tone: "text-ink-3", overdue: false };
  const d = daysBetweenISO(today, due);
  if (!open) return { text: fmtDayLabel(due), tone: "text-ink-3", overdue: false };
  if (d < 0) return { text: `Overdue ${-d}d`, tone: "text-critical font-semibold", overdue: true };
  if (d === 0) return { text: "Today", tone: "text-warn font-semibold", overdue: false };
  if (d === 1) return { text: "Tomorrow", tone: "text-warn", overdue: false };
  return { text: fmtDayLabel(due), tone: "text-ink-2", overdue: false };
}

/** A small pop-over that closes when you click outside it. */
export function Popover({ trigger, children, align = "left", up = false, testId }: { trigger: React.ReactNode; children: React.ReactNode; align?: "left" | "right"; up?: boolean; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", on); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", on); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block" data-testid={testId}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open} className="rounded-lg text-left">{trigger}</button>
      {open && <div className={cn("absolute z-40 min-w-60 rounded-xl border border-line-strong bg-surface p-1.5 shadow-lg", up ? "bottom-full mb-1.5" : "mt-1.5", align === "right" ? "right-0" : "left-0")} onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

/** Tick people on and off; the change is saved at once. */
export function PeoplePicker({ staff, value, onChange, disabled }: { staff: Staff[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return (
    <ul className="max-h-72 overflow-auto">
      {staff.map((s) => {
        const on = value.includes(s.id);
        return (
          <li key={s.id}>
            <button type="button" disabled={disabled} onClick={() => onChange(on ? value.filter((v) => v !== s.id) : [...value, s.id])} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] hover:bg-surface-2 disabled:opacity-50">
              <Person name={s.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-ink">{s.name}<span className="ml-1.5 text-[12px] text-ink-3">{s.role === "admin" ? "Owner" : s.role === "manager" ? "Manager" : "Team"}</span></span>
              <span className={cn("flex size-5 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-line-strong")}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
            </button>
          </li>
        );
      })}
      {!staff.length && <li className="px-3 py-2 text-[13px] text-ink-3">No team members yet.</li>}
    </ul>
  );
}
