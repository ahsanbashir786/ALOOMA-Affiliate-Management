"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, Check, ChevronDown, ChevronRight, Columns3, Flag, LayoutList, Loader2, RefreshCw, Search, SlidersHorizontal, UserX, Users, X } from "lucide-react";
import { addTaskComment, bulkUpdateTasks, refreshPlan, restoreTasks, setTaskAssignees, setTaskDue, setTaskStatus, toggleTaskStep } from "@/app/actions/execution";
import { Select } from "@/components/ui/primitives";
import { TagBadge } from "@/components/products/ui";
import { CATEGORIES, PRIORITY_LABEL } from "@/lib/execution/rules";
import type { PlanData, Status, TaskView } from "@/lib/execution/plan";
import type { Tag } from "@/lib/products/diagnose";
import { daysBetweenISO } from "@/lib/time";
import { cn, fmtRM } from "@/lib/utils";
import { TaskPanel, type Mutate } from "./task-panel";
import { TeamView } from "./team";
import { CategoryChip, dueInfo, NEXT_STATUS, PeoplePicker, PersonStack, Popover, PriorityFlag, ProductChip, StatusIcon, STATUS_META } from "./ui";

type View = "list" | "board" | "team";
type GroupBy = "product" | "category" | "status" | "person" | "due" | "priority";
type StatusFilter = "all" | "open" | Status | "closed";
type Filters = { q: string; status: StatusFilter; category: string; priority: string; person: string; product: string; due: string };
const NO_FILTER: Filters = { q: "", status: "all", category: "all", priority: "all", person: "all", product: "all", due: "any" };
type Over = Record<string, { base: string; patch: Partial<TaskView> }>;
type Toast = { text: string; undo?: () => void; tone?: "ok" | "error" };

const isOpen = (t: TaskView) => t.status === "not_started" || t.status === "pending";
const isClosed = (t: TaskView) => t.status === "skipped" || t.status === "auto_closed";
const ORDER: Record<string, number> = { not_started: 1, pending: 0, done: 2, skipped: 3, auto_closed: 3 };
/** Open LIVE actions always come first in their product. */
const liveFirst = (t: TaskView) => (t.kind === "live_push" && isOpen(t) ? 0 : 1);
const sortTasks = (a: TaskView, b: TaskView) =>
  liveFirst(a) - liveFirst(b) || ORDER[a.status] - ORDER[b.status] || a.priority - b.priority || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.impactRm - a.impactRm;
const same = (a: Filters, b: Partial<Filters>) => (Object.keys(NO_FILTER) as (keyof Filters)[]).every((k) => a[k] === (b[k] ?? NO_FILTER[k]));

export function ExecutionBoard({ data, me, meName, canManage, canWork }: { data: PlanData; me: string; meName: string; canManage: boolean; canWork: boolean }) {
  const router = useRouter();
  // Team members start on their own work, grouped by when it is due; owners and managers start on everything, grouped by product.
  const [view, setView] = useState<View>("list");
  const [group, setGroup] = useState<GroupBy>(canManage ? "product" : "due");
  const [f, setF] = useState<Filters>(canManage ? NO_FILTER : { ...NO_FILTER, person: "me", status: "open" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<Over>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [busy, startBusy] = useTransition();
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));

  const tasks = useMemo(() => data.tasks.map((t) => { const o = over[t.id]; return o && o.base === t.updatedAt ? { ...t, ...o.patch } : t; }), [data.tasks, over]);

  const flash = useCallback((text: string, opts: { undo?: () => void; tone?: "ok" | "error" } = {}) => {
    const t: Toast = { text, ...opts };
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), opts.undo ? 10000 : 5000);
  }, []);

  const apply = useCallback(async (id: string, patch: (t: TaskView) => Partial<TaskView>, call: () => Promise<{ error?: string }>) => {
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    const base = data.tasks.find((t) => t.id === id)?.updatedAt ?? cur.updatedAt;
    const next = patch(cur);
    setOver((o) => ({ ...o, [id]: { base, patch: { ...(o[id]?.base === base ? o[id].patch : {}), ...next } } }));
    const r = await call();
    if (r.error) {
      setOver((o) => { const n = { ...o }; delete n[id]; return n; });
      flash(r.error, { tone: "error" });
    }
  }, [tasks, data.tasks, flash]);

  const evt = (t: TaskView, kind: string, text: string) => [...t.events, { id: -Date.now(), user: meName, kind, text, at: new Date().toISOString() }];
  const doStatus = useCallback((id: string, s: Status, note?: string) =>
    apply(id, (t) => ({ status: s, completedAt: s === "done" ? new Date().toISOString() : null, closedReason: s === "skipped" ? (note ?? "Marked not needed.") : null, events: evt(t, "status", `${s === "skipped" ? "Not Needed" : STATUS_META[s].label}${note ? `: ${note}` : ""}`) }), () => setTaskStatus(id, s, note)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [apply, meName]);
  const setStatus = useCallback((id: string, s: Status, note?: string) => {
    const prev = tasks.find((t) => t.id === id)?.status;
    void doStatus(id, s, note);
    if (prev && prev !== s && (s === "done" || s === "skipped")) flash(s === "done" ? "Marked as done" : "Marked as not needed", { undo: () => { void doStatus(id, prev); } });
  }, [tasks, doStatus, flash]);
  const mutate: Mutate = useMemo(() => ({
    status: (id, s, note) => setStatus(id, s, note),
    due: (id, d) => {
      const prev = tasks.find((t) => t.id === id)?.dueOn ?? null;
      void apply(id, (t) => ({ dueOn: d, events: evt(t, "due", d ? `Due date set to ${d}` : "Due date cleared") }), () => setTaskDue(id, d));
      flash("Due date changed", { undo: () => { void apply(id, (t) => ({ dueOn: prev, events: evt(t, "due", prev ? `Due date set back to ${prev}` : "Due date cleared") }), () => setTaskDue(id, prev)); } });
    },
    assign: (id, ids) => {
      const prev = tasks.find((t) => t.id === id)?.assignees ?? [];
      const name = (list: string[]) => list.map((i) => data.staff.find((s) => s.id === i)?.name).filter(Boolean).join(", ") || "nobody";
      void apply(id, (t) => ({ assignees: ids, events: evt(t, "assigned", `Assigned to ${name(ids)}`) }), () => setTaskAssignees(id, ids));
      flash(`Assigned to ${name(ids)}`, { undo: () => { void apply(id, (t) => ({ assignees: prev, events: evt(t, "assigned", `Assigned to ${name(prev)}`) }), () => setTaskAssignees(id, prev)); } });
    },
    step: (id, i) => apply(id, (t) => ({ stepsDone: t.stepsDone.includes(i) ? t.stepsDone.filter((x) => x !== i) : [...t.stepsDone, i] }), () => toggleTaskStep(id, i)),
    comment: (id, text) => apply(id, (t) => ({ events: evt(t, "comment", text) }), () => addTaskComment(id, text)),
    contacted: (id, n) => apply(id, () => ({ contactedCount: n }), async () => ({})),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [apply, setStatus, data.staff, meName, tasks, flash]);

  const matches = useCallback((t: TaskView, f: Filters) => {
    const q = f.q.trim().toLowerCase();
    {
      if (f.status === "open" && !isOpen(t)) return false;
      if (f.status === "closed" && !isClosed(t)) return false;
      if (f.status === "all" && isClosed(t)) return false;
      if (["not_started", "pending", "done"].includes(f.status) && t.status !== f.status) return false;
      if (f.category !== "all" && t.category !== f.category) return false;
      if (f.priority !== "all" && String(t.priority) !== f.priority) return false;
      if (f.product !== "all" && t.productKey !== f.product) return false;
      if (f.person === "me" && !t.assignees.includes(me)) return false;
      if (f.person === "none" && t.assignees.length) return false;
      if (f.person !== "all" && f.person !== "me" && f.person !== "none" && !t.assignees.includes(f.person)) return false;
      if (f.due !== "any") {
        const d = t.dueOn ? daysBetweenISO(data.today, t.dueOn) : null;
        if (f.due === "none" ? t.dueOn != null : !isOpen(t) || d == null || (f.due === "overdue" ? d >= 0 : f.due === "week" ? d < 0 || d > 7 : f.due === "today" ? d > 0 : false)) return false;
      }
      if (q && !`${t.title} ${t.summary} ${t.productName} ${t.creators.map((c) => c.name).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    }
  }, [me, data.today]);
  const visible = useMemo(() => tasks.filter((t) => matches(t, f)).sort(sortTasks), [tasks, f, matches]);
  // How many actions are High, Medium and Normal under the other filters (so the numbers always match the list).
  const prio = useMemo(() => {
    const base = tasks.filter((t) => matches(t, { ...f, priority: "all" }));
    return { all: base.length, 1: base.filter((t) => t.priority === 1).length, 2: base.filter((t) => t.priority === 2).length, 3: base.filter((t) => t.priority === 3).length };
  }, [tasks, f, matches]);

  const open = tasks.filter(isOpen);
  const overdueOf = (list: TaskView[]) => list.filter((t) => t.dueOn && daysBetweenISO(data.today, t.dueOn) < 0);
  const kpi = {
    open: open.length,
    notStarted: tasks.filter((t) => t.status === "not_started").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: overdueOf(open).length,
    stake: open.reduce((n, t) => n + t.impactRm, 0),
  };
  const counted = kpi.open + kpi.done;
  const pctDone = counted ? Math.round((kpi.done / counted) * 100) : 0;
  const active = Object.entries(f).some(([k, v]) => v !== (NO_FILTER as Record<string, string>)[k]);
  const mine = open.filter((t) => t.assignees.includes(me));
  const unassigned = open.filter((t) => !t.assignees.length);
  const scopes: { key: string; label: string; n: number; f: Partial<Filters>; show: boolean; tone?: string }[] = [
    { key: "mine", label: "My Work", n: mine.length, f: { person: "me", status: "open" }, show: true },
    { key: "all", label: "All Work", n: counted, f: {}, show: true },
    { key: "unassigned", label: "Unassigned", n: unassigned.length, f: { person: "none", status: "open" }, show: canManage, tone: unassigned.length ? "text-warn" : undefined },
    { key: "overdue", label: "Overdue", n: kpi.overdue, f: { status: "open", due: "overdue" }, show: true, tone: kpi.overdue ? "text-critical" : undefined },
  ];

  const groups = useMemo(() => {
    const out: { key: string; label: string; tasks: TaskView[]; product?: PlanData["products"][number]; tone?: string }[] = [];
    const push = (key: string, label: string, list: TaskView[], extra: Partial<(typeof out)[number]> = {}) => { if (list.length) out.push({ key, label, tasks: list, ...extra }); };
    if (group === "product") for (const p of data.products) push(p.key, p.name, visible.filter((t) => t.productKey === p.key), { product: p });
    if (group === "category") for (const c of CATEGORIES) push(c.key, c.label, visible.filter((t) => t.category === c.key));
    if (group === "status") for (const s of ["pending", "not_started", "done"] as Status[]) push(s, STATUS_META[s].label, visible.filter((t) => t.status === s));
    if (group === "status") push("closed", "Closed", visible.filter(isClosed));
    if (group === "priority") for (const p of [1, 2, 3] as const) push(String(p), `${PRIORITY_LABEL[p]} Priority`, visible.filter((t) => t.priority === p));
    if (group === "person") {
      for (const s of data.staff) push(s.id, s.name, visible.filter((t) => t.assignees.includes(s.id)));
      push("none", "Unassigned", visible.filter((t) => !t.assignees.length));
    }
    if (group === "due") {
      const d = (t: TaskView) => (t.dueOn ? daysBetweenISO(data.today, t.dueOn) : null);
      const op = visible.filter(isOpen);
      push("overdue", "Overdue", op.filter((t) => (d(t) ?? 0) < 0 && t.dueOn), { tone: "text-critical" });
      push("today", "Due Today", op.filter((t) => d(t) === 0));
      push("week", "This Week", op.filter((t) => (d(t) ?? 0) > 0 && (d(t) ?? 0) <= 7));
      push("later", "Later", op.filter((t) => (d(t) ?? 0) > 7));
      push("nodate", "No Date", op.filter((t) => !t.dueOn));
      push("completed", "Done And Closed", visible.filter((t) => !isOpen(t)));
    }
    return out;
  }, [group, visible, data.products, data.staff, data.today]);

  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;
  const nav = useCallback((dir: 1 | -1) => {
    setOpenId((cur) => { const i = visible.findIndex((t) => t.id === cur); const n = visible[i + dir]; return n ? n.id : cur; });
  }, [visible]);
  const cycle = (t: TaskView) => { if (isOpen(t) || t.status === "done") setStatus(t.id, NEXT_STATUS[t.status]); };

  const doRefresh = () => startBusy(async () => {
    const r = await refreshPlan();
    flash(r.error ?? `Plan updated: ${r.created} new action${r.created === 1 ? "" : "s"}, ${r.closed} solved.`, r.error ? { tone: "error" } : {});
    router.refresh();
  });
  const bulk = (patch: Parameters<typeof bulkUpdateTasks>[1], label: string) => {
    const ids = [...picked];
    // Remember how every task was, so the change can be undone.
    const before = ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is TaskView => !!t && t.status !== "auto_closed")
      .map((t) => ({ id: t.id, status: t.status as "not_started" | "pending" | "done" | "skipped", due: t.dueOn, assignees: t.assignees }));
    startBusy(async () => {
      const r = await bulkUpdateTasks(ids, patch);
      if (r.error) { flash(r.error, { tone: "error" }); return; }
      flash(`${label}: ${r.count} action${r.count === 1 ? "" : "s"}`, {
        undo: () => { void restoreTasks(before).then((u) => { if (u.error) flash(u.error, { tone: "error" }); else { flash(`Undone: ${u.count} action${u.count === 1 ? "" : "s"} put back`); router.refresh(); } }); },
      });
      setPicked(new Set()); router.refresh();
    });
  };
  const togglePick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const chip = (s: StatusFilter, label: string) => (
    <button key={s} data-testid={`chip-${s}`} onClick={() => set({ status: s })} aria-pressed={f.status === s}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors", f.status === s ? "border-brand/30 bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}>{label}</button>
  );
  const COLS_CLASS = canManage
    ? (group === "product" ? "lg:grid-cols-[28px_28px_minmax(0,1fr)_104px_72px_130px_104px_96px]" : "lg:grid-cols-[28px_28px_minmax(0,1fr)_170px_104px_72px_130px_104px_96px]")
    : (group === "product" ? "lg:grid-cols-[28px_minmax(0,1fr)_104px_72px_130px_104px_96px]" : "lg:grid-cols-[28px_minmax(0,1fr)_170px_104px_72px_130px_104px_96px]");

  if (!data.tasks.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
        <p className="text-[17px] font-semibold text-ink">No actions yet</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-ink-2">Actions are written from the product numbers. Once TikTok data is synced they appear here by themselves.</p>
        <div className="mt-4 flex justify-center gap-2"><Link href="/sync" className="rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white">Open Data Sync</Link>{canManage && <button onClick={doRefresh} className="rounded-lg border border-line-strong px-4 py-2 text-[14px] font-medium">Write The Plan Now</button>}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="execution">
      {/* Needs attention: for owners and managers */}
      {canManage && (unassigned.length > 0 || kpi.overdue > 0) && (
        <section aria-label="Needs attention" data-testid="attention" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-warn/30 bg-warn-soft/60 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink"><AlertTriangle className="size-4 text-warn" />Needs Attention</span>
          {unassigned.length > 0 && <button onClick={() => { setView("list"); setF({ ...NO_FILTER, person: "none", status: "open" }); }} className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink hover:underline"><UserX className="size-4 text-warn" /><b className="tnum font-semibold text-ink">{unassigned.length}</b> actions have nobody ({unassigned.filter((t) => t.priority === 1).length} high priority)</button>}
          {kpi.overdue > 0 && <button onClick={() => { setView("list"); setF({ ...NO_FILTER, status: "open", due: "overdue" }); setGroup("person"); }} className="text-[13.5px] text-ink-2 hover:text-ink hover:underline"><b className="tnum font-semibold text-critical">{kpi.overdue}</b> overdue</button>}
        </section>
      )}

      {/* Progress + numbers */}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5" aria-label="Progress">
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline gap-2"><span className="tnum text-[28px] leading-none font-semibold tracking-tight text-ink" data-testid="pct-done">{pctDone}%</span><span className="text-[14px] text-ink-2">of actions done · {kpi.done} of {counted}</span></div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Done, pending and not started">
            <span className="bg-good" style={{ width: `${counted ? (kpi.done / counted) * 100 : 0}%` }} />
            <span className="bg-warn" style={{ width: `${counted ? (kpi.pending / counted) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" data-testid="exec-kpis">
          {([
            { l: "Open", v: kpi.open, s: "open" as StatusFilter, c: "text-ink" },
            { l: "Not Started", v: kpi.notStarted, s: "not_started" as StatusFilter, c: "text-ink" },
            { l: "Pending", v: kpi.pending, s: "pending" as StatusFilter, c: "text-warn" },
            { l: "Done", v: kpi.done, s: "done" as StatusFilter, c: "text-good" },
          ]).map((k) => (
            <button key={k.l} onClick={() => set({ status: f.status === k.s ? "all" : k.s })} className={cn("rounded-xl border px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2", f.status === k.s ? "border-brand bg-brand-soft" : "border-line")}>
              <span className="block text-[12.5px] text-ink-3">{k.l}</span><span className={cn("tnum text-[22px] font-semibold", k.c)}>{k.v}</span>
            </button>
          ))}
          <button onClick={() => set({ status: "open", due: f.due === "overdue" ? "any" : "overdue" })} className={cn("rounded-xl border px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2", f.due === "overdue" ? "border-critical bg-critical-soft" : "border-line")}>
            <span className="block text-[12.5px] text-ink-3">Overdue</span><span className={cn("tnum text-[22px] font-semibold", kpi.overdue ? "text-critical" : "text-ink")}>{kpi.overdue}</span>
          </button>
          <div className="rounded-xl border border-line px-3.5 py-2.5"><span className="block text-[12.5px] text-ink-3" title="Sales these open actions are about">Sales At Stake</span><span className="tnum text-[22px] font-semibold text-ink">{fmtRM(kpi.stake)}</span></div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5" role="tablist" aria-label="View">
            {([["list", "List", LayoutList], ["board", "Board", Columns3], ["team", "Team", Users]] as const).map(([k, l, Icon]) => (
              <button key={k} role="tab" aria-selected={view === k} data-testid={`view-${k}`} onClick={() => setView(k)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium", view === k ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}><Icon className="size-4" />{l}</button>
            ))}
          </div>
          {view === "list" && (
            <label className="flex items-center gap-2 text-[13.5px] text-ink-3">Group By
              <Select data-testid="group-by" value={group} onChange={(e) => { setGroup(e.target.value as GroupBy); setCollapsed(new Set()); }} className="h-8 text-[13.5px]">
                <option value="product">Product</option><option value="category">Category</option><option value="status">Status</option><option value="person">Person</option><option value="due">Due Date</option><option value="priority">Priority</option>
              </Select>
            </label>
          )}
          <div className="relative order-last ml-auto min-w-0 basis-full sm:order-none sm:max-w-64 sm:flex-none sm:basis-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
            <input data-testid="exec-search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search actions or creators" className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-[14px] placeholder:text-ink-3" />
          </div>
          {canManage && <button data-testid="refresh-plan" onClick={doRefresh} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60" title="Write the plan again from the latest numbers">{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Update Plan</button>}
        </div>

        {(view === "list" || view === "board") && (
          <>
            {/* Quick views */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick views" data-testid="scopes">
              {scopes.filter((s) => s.show).map((s) => {
                const on = same(f, s.f);
                return (
                  <button key={s.key} data-testid={`scope-${s.key}`} aria-pressed={on} onClick={() => setF({ ...NO_FILTER, ...s.f })}
                    className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[14px] font-medium transition-colors", on ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:bg-line")}>
                    {s.label}<span className={cn("tnum rounded-full px-1.5 text-[12.5px]", on ? "bg-surface text-brand-strong" : cn("bg-surface", s.tone ?? "text-ink-3"))}>{s.n}</span>
                  </button>
                );
              })}
              <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 sm:hidden"><SlidersHorizontal className="size-4" />Filters</button>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Priority" data-testid="priorities">
              <span className="mr-1 text-[13px] font-semibold text-ink-3">Priority</span>
              {([["all", "All", prio.all, ""], ["1", "High", prio[1], "text-critical"], ["2", "Medium", prio[2], "text-warn"], ["3", "Normal", prio[3], "text-ink-3"]] as const).map(([k, label, n, tone]) => {
                const on = f.priority === k;
                return (
                  <button key={k} data-testid={`prio-${k}`} aria-pressed={on} onClick={() => set({ priority: k })}
                    className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[14px] font-medium transition-colors", on ? "border-brand/30 bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}>
                    {k !== "all" && <Flag className={cn("size-4", tone)} fill="currentColor" />}{label}
                    <span className={cn("tnum rounded-full px-2 text-[13px] font-semibold", on ? "bg-surface text-brand-strong" : cn("bg-surface-2", tone || "text-ink-3"))}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className={cn("flex-wrap items-center gap-2", showFilters ? "flex" : "hidden sm:flex")}>
              <div className="flex flex-wrap gap-1.5">{chip("all", "All")}{chip("open", "Open")}{chip("not_started", "Not Started")}{chip("pending", "Pending")}{chip("done", "Done")}{chip("closed", "Closed")}</div>
              <span className="hidden h-5 w-px bg-line-strong sm:block" />
              <Select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} className="h-8 text-[13.5px]"><option value="all">All Categories</option>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>
              <Select aria-label="Product" value={f.product} onChange={(e) => set({ product: e.target.value })} className="h-8 max-w-52 text-[13.5px]"><option value="all">All Products</option>{data.products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select>
              <Select aria-label="Assigned To" data-testid="filter-person" value={f.person} onChange={(e) => set({ person: e.target.value })} className="h-8 text-[13.5px]"><option value="all">Everyone</option><option value="me">Assigned To Me</option><option value="none">Unassigned</option>{data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Select aria-label="Due" value={f.due} onChange={(e) => set({ due: e.target.value })} className="h-8 text-[13.5px]"><option value="any">Any Due Date</option><option value="overdue">Overdue</option><option value="today">Due Today Or Earlier</option><option value="week">Next 7 Days</option><option value="none">No Date</option></Select>
              {active && <button onClick={() => setF(NO_FILTER)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13.5px] font-medium text-brand-strong hover:bg-brand-soft"><X className="size-4" />Clear</button>}
            </div>
          </>
        )}
      </div>

      {/* Views */}
      {view === "team" ? (
        <TeamView tasks={tasks} data={data} today={data.today} onPick={(id) => { setF({ ...NO_FILTER, person: id }); setView("list"); setGroup("product"); }} />
      ) : view === "board" ? (
        <div className="grid gap-4 lg:grid-cols-3" data-testid="board">
          {(["not_started", "pending", "done"] as Status[]).map((s) => {
            const col = visible.filter((t) => (f.status === "closed" ? false : t.status === s));
            return (
              <section key={s} className="min-w-0 rounded-2xl bg-surface-2/70 p-2.5">
                <h3 className="flex items-center gap-2 px-2 py-1.5 text-[14px] font-semibold text-ink"><StatusIcon status={s} size={16} />{STATUS_META[s].label}<span className="tnum text-[13px] font-normal text-ink-3">{col.length}</span></h3>
                <ul className="space-y-2">
                  {col.slice(0, 60).map((t) => {
                    const due = dueInfo(t.dueOn, data.today, isOpen(t));
                    return (
                      <li key={t.id}>
                        <button onClick={() => setOpenId(t.id)} className={cn("w-full rounded-xl border bg-surface p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md", openId === t.id ? "border-brand" : "border-line")}>
                          <p className="mb-1.5"><ProductChip name={t.productName} /></p>
                          <p className="text-[14.5px] leading-snug font-semibold text-ink">{t.title}</p>
                          {t.creatorCount > 0 && <p className="mt-1 text-[12.5px] text-ink-3">{t.contactedCount} of {t.creatorCount} creators contacted</p>}
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"><CategoryChip c={t.category} /><PriorityFlag p={t.priority} /><span className={cn("text-[12.5px]", due.tone)}>{due.text}</span><span className="ml-auto"><PersonStack ids={t.assignees} staff={data.staff} size={22} /></span></div>
                        </button>
                      </li>
                    );
                  })}
                  {!col.length && <li className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-ink-3">Nothing here</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4" data-testid="task-list">
          <div className={cn("hidden items-center gap-3 px-4 text-[13px] font-medium text-ink-3 lg:grid", COLS_CLASS)}>
            {canManage && <span />}<span /><span>Action</span>{group !== "product" && <span>Product</span>}<span>Category</span><span>Priority</span><span>Assigned</span><span>Complete By</span><span className="text-right">At Stake</span>
          </div>
          {groups.map((g) => {
            const isCol = collapsed.has(g.key);
            const done = g.tasks.filter((t) => t.status === "done").length, cnt = g.tasks.filter((t) => !isClosed(t)).length;
            const ids = g.tasks.map((t) => t.id);
            const allPicked = ids.length > 0 && ids.every((i) => picked.has(i));
            return (
              <section key={g.key} data-testid="group" data-group={g.key} className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
                <div className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4", "border-b border-line bg-surface-2/50 py-3 hover:bg-surface-2")}>
                  {canManage && <input type="checkbox" aria-label={`Select all in ${g.label}`} checked={allPicked} onChange={() => setPicked((p) => { const n = new Set(p); for (const i of ids) { if (allPicked) n.delete(i); else n.add(i); } return n; })} className="size-4 accent-[var(--brand)]" />}
                  <button onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} aria-expanded={!isCol} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                    {isCol ? <ChevronRight className="size-4 text-ink-3" /> : <ChevronDown className="size-4 text-ink-3" />}
                    <span className={cn("text-[15.5px] font-semibold text-ink", g.tone)}>{g.label}</span>
                    {g.product && <TagBadge tag={g.product.tag as Tag} />}
                    {g.product && g.product.changePct != null && <span className={cn("tnum text-[12.5px] font-semibold", g.product.change >= 0 ? "text-good" : "text-critical")}>{g.product.change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(g.product.changePct))}%</span>}
                    <span className="tnum text-[13px] text-ink-3">{g.tasks.length} action{g.tasks.length === 1 ? "" : "s"}</span>
                  </button>
                  <span className="ml-auto flex items-center gap-2"><span className="tnum text-[12.5px] text-ink-3">{done}/{cnt} done</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-good" style={{ width: `${cnt ? (done / cnt) * 100 : 0}%` }} /></span></span>
                </div>
                {!isCol && (
                  <ul>
                    {g.tasks.map((t) => {
                      const due = dueInfo(t.dueOn, data.today, isOpen(t));
                      const dim = t.status === "done" || isClosed(t);
                      return (
                        <li key={t.id} data-testid="task-row" data-status={t.status} data-kind={t.kind}
                          className={cn("group/row grid cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-b border-line px-4 py-3 last:border-b-0 hover:bg-brand-soft/40 lg:items-center", COLS_CLASS, canManage && "grid-cols-[28px_28px_minmax(0,1fr)]", openId === t.id && "bg-brand-soft/60", picked.has(t.id) && "bg-brand-soft/60")}
                          onClick={() => setOpenId(t.id)}>
                          {canManage && <input type="checkbox" data-testid="pick" aria-label={`Select ${t.title}`} checked={picked.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(t.id)} className="mt-1 size-4 accent-[var(--brand)] lg:mt-0" />}
                          <button aria-label={`Status: ${STATUS_META[t.status].label}. Click to change`} title={`${STATUS_META[t.status].label} · click to change`} disabled={isClosed(t)} onClick={(e) => { e.stopPropagation(); cycle(t); }} className="mt-0.5 rounded-full lg:mt-0"><StatusIcon status={t.status} size={22} /></button>
                          <div className="min-w-0">
                            <p className={cn("text-[14.5px] leading-snug font-semibold", dim ? "text-ink-3" : "text-ink", t.status === "done" && "line-through decoration-ink-3/50")}>{t.title}</p>
                            {t.creatorCount > 0 && (
                              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-3">
                                <span className="truncate">{t.creators.slice(0, 3).map((c) => `@${c.name}`).join(", ")}{t.creatorCount > 3 ? ` +${t.creatorCount - 3} more` : ""}</span>
                                <span className="tnum shrink-0 rounded-full bg-surface-2 px-1.5 text-[12px]" title="Creators contacted">{t.contactedCount}/{t.creatorCount}</span>
                              </p>
                            )}
                          </div>
                          <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:contents", canManage ? "col-start-3" : "col-start-2")}>
                            {group !== "product" && <ProductChip name={t.productName} />}
                            <CategoryChip c={t.category} />
                            <PriorityFlag p={t.priority} />
                            {canManage && isOpen(t)
                              ? <Popover testId="row-assign" trigger={<span className="inline-flex rounded-md px-1 py-0.5 hover:bg-surface-2"><PersonStack ids={t.assignees} staff={data.staff} size={22} /></span>}><PeoplePicker staff={data.staff} value={t.assignees} onChange={(ids) => mutate.assign(t.id, ids)} /></Popover>
                              : <PersonStack ids={t.assignees} staff={data.staff} size={22} />}
                            <span className={cn("text-[13px] whitespace-nowrap", due.tone)}>{due.text}</span>
                            <span className="tnum text-[13px] text-ink-2 lg:text-right">{t.impactRm > 0 ? fmtRM(t.impactRm) : "–"}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {!groups.length && (
            <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-[14px] text-ink-3">
              {f.person === "me" && !active ? "" : f.person === "me" ? <><p className="text-[15px] font-medium text-ink-2">Nothing is assigned to you here.</p><p className="mt-1">Ask a manager to give you actions, or look at <button className="font-medium text-brand-strong hover:underline" onClick={() => setF(NO_FILTER)}>All Work</button>.</p></> : <>No actions match these filters.{active && <> <button className="font-medium text-brand-strong hover:underline" onClick={() => setF(NO_FILTER)}>Clear filters</button></>}</>}
            </div>
          )}
        </div>
      )}

      {/* Bulk bar */}
      {canManage && picked.size > 0 && view === "list" && (
        <div role="region" aria-label="Selected actions" data-testid="bulk-bar" className="fixed bottom-5 left-1/2 z-30 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface px-3 py-2.5 text-ink shadow-2xl">
          <span className="px-1 text-[14px] font-semibold"><span className="tnum" data-testid="picked-count">{picked.size}</span> selected</span>
          <Popover up testId="bulk-assign" trigger={<span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-[13.5px] font-medium text-ink hover:bg-line"><Users className="size-4" />Assign</span>}>
            <p className="px-2.5 pt-1 pb-1.5 text-[12px] text-ink-3">Add these people to every selected action</p>
            <PeoplePicker staff={data.staff} value={[]} onChange={(ids) => bulk({ addAssignees: ids }, "Assigned")} disabled={busy} />
          </Popover>
          {(["pending", "done", "not_started"] as Status[]).map((s) => <button key={s} onClick={() => bulk({ status: s }, `Marked ${STATUS_META[s].label}`)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-[13.5px] font-medium text-ink hover:bg-line disabled:opacity-60">{s === "done" && <Check className="size-4" />}{STATUS_META[s].label}</button>)}
          <label className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-[13px] text-ink-2">Due<input type="date" aria-label="Set due date" onChange={(e) => { if (e.target.value) bulk({ due: e.target.value }, "Due date set"); }} className="h-6 rounded border border-line-strong bg-surface px-1 text-[12.5px] text-ink" /></label>
          <button onClick={() => setPicked(new Set())} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13.5px] text-ink-2 hover:bg-surface-2"><X className="size-4" />Clear</button>
        </div>
      )}

      {openTask && <TaskPanel key={openTask.id} task={openTask} data={data} me={me} canManage={canManage} canWork={canWork} mutate={mutate} onClose={() => setOpenId(null)} onNav={nav} />}
      {toast && (
        <div role="status" className={cn("fixed bottom-5 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 text-[14px] shadow-xl", toast.tone === "error" ? "border-critical/30 bg-critical-soft text-critical" : "border-line-strong bg-surface text-ink", picked.size > 0 && canManage && "bottom-24")}>
          {toast.tone === "error" ? <AlertCircle className="size-4" /> : <Check className="size-4 text-good" />}{toast.text}
          {toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }} className="rounded-md bg-brand px-2.5 py-0.5 text-[13px] font-semibold text-white hover:bg-brand-strong">Undo</button>}
        </div>
      )}
    </div>
  );
}
