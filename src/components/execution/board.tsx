"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronRight, Columns3, LayoutList, Loader2, RefreshCw, Search, Users, X } from "lucide-react";
import { addTaskComment, refreshPlan, setProductLeads, setTaskAssignees, setTaskDue, setTaskStatus, toggleTaskStep } from "@/app/actions/execution";
import { Select } from "@/components/ui/primitives";
import { TagBadge } from "@/components/products/ui";
import { CATEGORIES, PRIORITY_LABEL } from "@/lib/execution/rules";
import type { PlanData, Status, TaskView } from "@/lib/execution/plan";
import type { Tag } from "@/lib/products/diagnose";
import { daysBetweenISO } from "@/lib/time";
import { cn, fmtRM } from "@/lib/utils";
import { TaskPanel, type Mutate } from "./task-panel";
import { TeamView } from "./team";
import { CategoryChip, dueInfo, NEXT_STATUS, PersonStack, PriorityFlag, StatusIcon, STATUS_META } from "./ui";

type View = "list" | "board" | "team";
type GroupBy = "product" | "category" | "status" | "person" | "due" | "priority";
type StatusFilter = "all" | "open" | Status | "closed";
type Filters = { q: string; status: StatusFilter; category: string; priority: string; person: string; product: string; due: string };
const NO_FILTER: Filters = { q: "", status: "all", category: "all", priority: "all", person: "all", product: "all", due: "any" };
type Over = Record<string, { base: string; patch: Partial<TaskView> }>;

const isOpen = (t: TaskView) => t.status === "not_started" || t.status === "pending";
const isClosed = (t: TaskView) => t.status === "skipped" || t.status === "auto_closed";
const ORDER: Record<string, number> = { not_started: 1, pending: 0, done: 2, skipped: 3, auto_closed: 3 };
const sortTasks = (a: TaskView, b: TaskView) =>
  ORDER[a.status] - ORDER[b.status] || a.priority - b.priority || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || b.impactRm - a.impactRm;

export function ExecutionBoard({ data, me, meName, canManage }: { data: PlanData; me: string; meName: string; canManage: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [group, setGroup] = useState<GroupBy>("product");
  const [f, setF] = useState<Filters>(NO_FILTER);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<Over>({});
  const [toast, setToast] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));

  const tasks = useMemo(() => data.tasks.map((t) => { const o = over[t.id]; return o && o.base === t.updatedAt ? { ...t, ...o.patch } : t; }), [data.tasks, over]);

  const apply = useCallback(async (id: string, patch: (t: TaskView) => Partial<TaskView>, call: () => Promise<{ error?: string }>) => {
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    const base = data.tasks.find((t) => t.id === id)?.updatedAt ?? cur.updatedAt;
    const next = patch(cur);
    setOver((o) => ({ ...o, [id]: { base, patch: { ...(o[id]?.base === base ? o[id].patch : {}), ...next } } }));
    const r = await call();
    if (r.error) {
      setOver((o) => { const n = { ...o }; delete n[id]; return n; });
      setToast(r.error);
      setTimeout(() => setToast(null), 5000);
    }
  }, [tasks, data.tasks]);

  const evt = (t: TaskView, kind: string, text: string) => [...t.events, { id: -Date.now(), user: meName, kind, text, at: new Date().toISOString() }];
  const mutate: Mutate = useMemo(() => ({
    status: (id, s, note) => apply(id, (t) => ({ status: s, completedAt: s === "done" ? new Date().toISOString() : null, closedReason: s === "skipped" ? (note ?? "Marked not needed.") : null, events: evt(t, "status", `${s === "skipped" ? "Not Needed" : STATUS_META[s].label}${note ? `: ${note}` : ""}`) }), () => setTaskStatus(id, s, note)),
    due: (id, d) => apply(id, (t) => ({ dueOn: d, events: evt(t, "due", d ? `Due date set to ${d}` : "Due date cleared") }), () => setTaskDue(id, d)),
    assign: (id, ids) => apply(id, (t) => ({ assignees: ids, events: evt(t, "assigned", `Assigned to ${ids.map((i) => data.staff.find((s) => s.id === i)?.name).filter(Boolean).join(", ") || "nobody"}`) }), () => setTaskAssignees(id, ids)),
    step: (id, i) => apply(id, (t) => ({ stepsDone: t.stepsDone.includes(i) ? t.stepsDone.filter((x) => x !== i) : [...t.stepsDone, i] }), () => toggleTaskStep(id, i)),
    comment: (id, text) => apply(id, (t) => ({ events: evt(t, "comment", text) }), () => addTaskComment(id, text)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [apply, data.staff, meName]);

  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return tasks.filter((t) => {
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
        if (f.due === "none" ? t.dueOn != null : !isOpen(t) || d == null || (f.due === "overdue" ? d >= 0 : f.due === "week" ? d < 0 || d > 7 : f.due === "today" ? d !== 0 : false)) return false;
      }
      if (q && !`${t.title} ${t.summary} ${t.productName} ${t.creators.map((c) => c.name).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort(sortTasks);
  }, [tasks, f, me, data.today]);

  const open = tasks.filter(isOpen);
  const kpi = {
    open: open.length,
    notStarted: tasks.filter((t) => t.status === "not_started").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: open.filter((t) => t.dueOn && daysBetweenISO(data.today, t.dueOn) < 0).length,
    stake: open.reduce((n, t) => n + t.impactRm, 0),
  };
  const counted = kpi.open + kpi.done;
  const pctDone = counted ? Math.round((kpi.done / counted) * 100) : 0;
  const active = Object.entries(f).some(([k, v]) => v !== (NO_FILTER as Record<string, string>)[k]);

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
  const cycle = (t: TaskView) => { if (isOpen(t) || t.status === "done") mutate.status(t.id, NEXT_STATUS[t.status]); };

  const doRefresh = () => startBusy(async () => {
    const r = await refreshPlan();
    setToast(r.error ?? `Plan updated: ${r.created} new task${r.created === 1 ? "" : "s"}, ${r.closed} solved.`);
    setTimeout(() => setToast(null), 5000);
    router.refresh();
  });

  const chip = (s: StatusFilter, label: string) => (
    <button key={s} data-testid={`chip-${s}`} onClick={() => set({ status: s })} aria-pressed={f.status === s}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors", f.status === s ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}>
      {label}
    </button>
  );
  const COLS = group === "product" ? "lg:grid-cols-[28px_minmax(0,1fr)_104px_72px_130px_104px_96px]" : "lg:grid-cols-[28px_minmax(0,1fr)_170px_104px_72px_130px_104px_96px]";

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
      {/* Progress + numbers */}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5" aria-label="Progress">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-baseline gap-2"><span className="tnum text-[28px] leading-none font-semibold tracking-tight text-ink" data-testid="pct-done">{pctDone}%</span><span className="text-[14px] text-ink-2">of actions done · {kpi.done} of {counted}</span></div>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Done, pending and not started">
              <span className="bg-good" style={{ width: `${counted ? (kpi.done / counted) * 100 : 0}%` }} />
              <span className="bg-warn" style={{ width: `${counted ? (kpi.pending / counted) * 100 : 0}%` }} />
            </div>
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
              <button key={k} role="tab" aria-selected={view === k} data-testid={`view-${k}`} onClick={() => setView(k)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium", view === k ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2")}><Icon className="size-4" />{l}</button>
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
        {view !== "team" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">{chip("all", "All")}{chip("open", "Open")}{chip("not_started", "Not Started")}{chip("pending", "Pending")}{chip("done", "Done")}{chip("closed", "Closed")}</div>
            <span className="hidden h-5 w-px bg-line-strong sm:block" />
            <Select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} className="h-8 text-[13.5px]"><option value="all">All Categories</option>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>
            <Select aria-label="Product" value={f.product} onChange={(e) => set({ product: e.target.value })} className="h-8 max-w-52 text-[13.5px]"><option value="all">All Products</option>{data.products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select>
            <Select aria-label="Assigned To" data-testid="filter-person" value={f.person} onChange={(e) => set({ person: e.target.value })} className="h-8 text-[13.5px]"><option value="all">Everyone</option><option value="me">Assigned To Me</option><option value="none">Unassigned</option>{data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select aria-label="Priority" value={f.priority} onChange={(e) => set({ priority: e.target.value })} className="h-8 text-[13.5px]"><option value="all">Any Priority</option><option value="1">High</option><option value="2">Medium</option><option value="3">Low</option></Select>
            <Select aria-label="Due" value={f.due} onChange={(e) => set({ due: e.target.value })} className="h-8 text-[13.5px]"><option value="any">Any Due Date</option><option value="overdue">Overdue</option><option value="today">Due Today</option><option value="week">Next 7 Days</option><option value="none">No Date</option></Select>
            {active && <button onClick={() => setF(NO_FILTER)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13.5px] font-medium text-brand-strong hover:bg-brand-soft"><X className="size-4" />Clear</button>}
          </div>
        )}
      </div>

      {/* Views */}
      {view === "team" ? (
        <TeamView tasks={tasks} data={data} canManage={canManage} today={data.today}
          onPick={(id) => { setF({ ...NO_FILTER, person: id }); setView("list"); setGroup("product"); }}
          onLeads={(key, ids) => { void setProductLeads(key, ids).then((r) => { if (r.error) setToast(r.error); else router.refresh(); }); }} />
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
                          <p className="mb-1 text-[12px] font-medium text-ink-3">{t.productName}</p>
                          <p className="text-[14.5px] leading-snug font-semibold text-ink">{t.title}</p>
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
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card" data-testid="task-list">
          <div className={cn("hidden items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase lg:grid", COLS)}>
            <span /><span>Action</span>{group !== "product" && <span>Product</span>}<span>Category</span><span>Priority</span><span>Assigned</span><span>Complete By</span><span className="text-right">At Stake</span>
          </div>
          {groups.map((g) => {
            const isCol = collapsed.has(g.key);
            const done = g.tasks.filter((t) => t.status === "done").length, counted = g.tasks.filter((t) => t.status !== "skipped" && t.status !== "auto_closed").length;
            return (
              <section key={g.key} data-testid="group" data-group={g.key}>
                <button onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} aria-expanded={!isCol}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2/40 px-4 py-2.5 text-left hover:bg-surface-2">
                  {isCol ? <ChevronRight className="size-4 text-ink-3" /> : <ChevronDown className="size-4 text-ink-3" />}
                  <span className={cn("text-[15px] font-semibold text-ink", g.tone)}>{g.label}</span>
                  {g.product && <TagBadge tag={g.product.tag as Tag} />}
                  {g.product && g.product.changePct != null && <span className={cn("tnum text-[12.5px] font-semibold", g.product.change >= 0 ? "text-good" : "text-critical")}>{g.product.change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(g.product.changePct))}%</span>}
                  <span className="tnum text-[13px] text-ink-3">{g.tasks.length} action{g.tasks.length === 1 ? "" : "s"}</span>
                  {g.product && (data.leads[g.product.key] ?? []).length > 0 && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">Lead <PersonStack ids={data.leads[g.product.key]} staff={data.staff} size={20} /></span>}
                  <span className="ml-auto flex items-center gap-2"><span className="tnum text-[12.5px] text-ink-3">{done}/{counted} done</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-good" style={{ width: `${counted ? (done / counted) * 100 : 0}%` }} /></span></span>
                </button>
                {!isCol && (
                  <ul>
                    {g.tasks.map((t) => {
                      const due = dueInfo(t.dueOn, data.today, isOpen(t));
                      const dim = t.status === "done" || isClosed(t);
                      return (
                        <li key={t.id} data-testid="task-row" data-status={t.status} data-kind={t.kind}
                          className={cn("group/row grid cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-b border-line px-4 py-3 last:border-b-0 hover:bg-brand-soft/40 lg:items-center", COLS, openId === t.id && "bg-brand-soft/60")}
                          onClick={() => setOpenId(t.id)}>
                          <button aria-label={`Status: ${STATUS_META[t.status].label}. Click to change`} title={`${STATUS_META[t.status].label} · click to change`} disabled={isClosed(t)} onClick={(e) => { e.stopPropagation(); cycle(t); }} className="mt-0.5 rounded-full lg:mt-0"><StatusIcon status={t.status} size={22} /></button>
                          <div className="min-w-0">
                            <p className={cn("text-[14.5px] leading-snug font-semibold", dim ? "text-ink-3" : "text-ink", t.status === "done" && "line-through decoration-ink-3/50")}>{t.title}</p>
                            {t.creators.length > 0 && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{t.creators.slice(0, 3).map((c) => `@${c.name}`).join(", ")}{t.creators.length > 3 ? ` +${t.creators.length - 3}` : ""}</p>}
                          </div>
                          <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:contents">
                            {group !== "product" && <span className="max-w-full truncate text-[13px] text-ink-2">{t.productName}</span>}
                            <CategoryChip c={t.category} />
                            <PriorityFlag p={t.priority} />
                            <PersonStack ids={t.assignees} staff={data.staff} size={22} />
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
          {!groups.length && <p className="px-6 py-12 text-center text-[14px] text-ink-3">No actions match these filters.{active && <> <button className="font-medium text-brand-strong hover:underline" onClick={() => setF(NO_FILTER)}>Clear filters</button></>}</p>}
        </div>
      )}

      {openTask && <TaskPanel key={openTask.id} task={openTask} data={data} me={me} canManage={canManage} mutate={mutate} onClose={() => setOpenId(null)} onNav={nav} />}
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] text-white shadow-xl"><AlertCircle className="size-4" />{toast}</div>}
    </div>
  );
}
