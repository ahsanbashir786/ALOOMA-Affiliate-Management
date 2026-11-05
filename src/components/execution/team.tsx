"use client";

import { useState } from "react";
import { ChevronRight, UserPlus } from "lucide-react";
import { TagBadge } from "@/components/products/ui";
import { CATEGORIES } from "@/lib/execution/rules";
import type { PlanData, TaskView } from "@/lib/execution/plan";
import type { Tag } from "@/lib/products/diagnose";
import { daysBetweenISO } from "@/lib/time";
import { cn, fmtRM } from "@/lib/utils";
import { CATEGORY_COLOR, PeoplePicker, Person, PersonStack, Popover, ProductTile, productColor } from "./ui";

type Row = { id: string; name: string; role: string; open: number; notStarted: number; pending: number; done: number; overdue: number; rate: number; days: number | null; stake: number; won: number };

function stats(list: TaskView[], today: string) {
  const open = list.filter((t) => t.status === "not_started" || t.status === "pending");
  const done = list.filter((t) => t.status === "done");
  const took = done.filter((t) => t.completedAt).map((t) => Math.max(0, daysBetweenISO(t.createdAt.slice(0, 10), t.completedAt!.slice(0, 10))));
  return {
    open: open.length, notStarted: open.filter((t) => t.status === "not_started").length, pending: open.filter((t) => t.status === "pending").length, done: done.length,
    overdue: open.filter((t) => t.dueOn && daysBetweenISO(today, t.dueOn) < 0).length,
    rate: open.length + done.length ? Math.round((done.length / (open.length + done.length)) * 100) : 0,
    days: took.length ? Math.round((took.reduce((a, b) => a + b, 0) / took.length) * 10) / 10 : null,
    stake: open.reduce((n, t) => n + t.impactRm, 0), won: done.reduce((n, t) => n + t.impactRm, 0),
  };
}

export function TeamView({ tasks, data, canManage, today, onPick, onLeads }: {
  tasks: TaskView[]; data: PlanData; canManage: boolean; today: string; onPick: (id: string) => void; onLeads: (productKey: string, ids: string[]) => void;
}) {
  const [leads, setLeads] = useState<Record<string, string[]>>(data.leads);
  const real = tasks.filter((t) => t.status !== "skipped" && t.status !== "auto_closed");
  const rows: Row[] = [
    ...data.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, ...stats(real.filter((t) => t.assignees.includes(s.id)), today) })),
    { id: "none", name: "Unassigned", role: "", ...stats(real.filter((t) => !t.assignees.length), today) },
  ].filter((r) => r.open + r.done > 0 || r.id !== "none").sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : b.open + b.done - (a.open + a.done)));
  const all = stats(real, today);

  return (
    <div className="space-y-5" data-testid="team-view">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
          <div><h2 className="text-[16px] font-semibold text-ink">Team Performance</h2><p className="text-[13px] text-ink-3">Actions from the last 60 days, per person. Click a person to see their actions.</p></div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead><tr className="border-b border-line text-left text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
              <th className="px-5 py-2.5">Person</th><th className="px-3 py-2.5 text-right">Not Started</th><th className="px-3 py-2.5 text-right">Pending</th><th className="px-3 py-2.5 text-right">Done</th><th className="px-3 py-2.5 text-right">Overdue</th><th className="w-48 px-3 py-2.5">Completed</th><th className="px-3 py-2.5 text-right" title="Average days from creation to done">Days To Finish</th><th className="px-3 py-2.5 text-right">Sales Done</th><th className="px-3 py-2.5 text-right">Sales Waiting</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="team-row" onClick={() => onPick(r.id)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-brand-soft/40">
                  <td className="px-5 py-3"><span className="flex items-center gap-2.5">{r.id === "none" ? <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3">?</span> : <Person name={r.name} size={28} />}<span><b className="font-semibold whitespace-nowrap text-ink">{r.name}</b>{r.role && <span className="ml-2 text-[12px] text-ink-3">{r.role === "admin" ? "Owner" : r.role === "manager" ? "Manager" : "Team"}</span>}</span></span></td>
                  <td className="tnum px-3 py-3 text-right">{r.notStarted}</td>
                  <td className="tnum px-3 py-3 text-right text-warn">{r.pending}</td>
                  <td className="tnum px-3 py-3 text-right text-good">{r.done}</td>
                  <td className={cn("tnum px-3 py-3 text-right", r.overdue ? "font-semibold text-critical" : "text-ink-3")}>{r.overdue}</td>
                  <td className="px-3 py-3"><span className="flex items-center gap-2"><span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-good" style={{ width: `${r.rate}%` }} /></span><span className="tnum w-9 text-right text-[13px] text-ink-2">{r.rate}%</span></span></td>
                  <td className="tnum px-3 py-3 text-right text-ink-2">{r.days ?? "–"}</td>
                  <td className="tnum px-3 py-3 text-right text-ink-2">{fmtRM(r.won)}</td>
                  <td className="tnum px-3 py-3 text-right text-ink-2">{fmtRM(r.stake)}</td>
                  <td className="pr-4"><ChevronRight className="size-4 text-ink-3" /></td>
                </tr>
              ))}
              <tr className="bg-surface-2/60 font-semibold"><td className="px-5 py-3 text-ink">Everyone</td><td className="tnum px-3 py-3 text-right">{all.notStarted}</td><td className="tnum px-3 py-3 text-right text-warn">{all.pending}</td><td className="tnum px-3 py-3 text-right text-good">{all.done}</td><td className="tnum px-3 py-3 text-right">{all.overdue}</td><td className="px-3 py-3"><span className="tnum text-[13px]">{all.rate}%</span></td><td className="tnum px-3 py-3 text-right">{all.days ?? "–"}</td><td className="tnum px-3 py-3 text-right">{fmtRM(all.won)}</td><td className="tnum px-3 py-3 text-right">{fmtRM(all.stake)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[16px] font-semibold text-ink">Progress By Category</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => {
            const s = stats(real.filter((t) => t.category === c.key), today);
            return (
              <div key={c.key} className="rounded-xl border border-line p-3.5">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink"><span className="size-2.5 rounded-sm" style={{ background: CATEGORY_COLOR[c.key] }} />{c.label}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{c.hint}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${s.rate}%`, background: CATEGORY_COLOR[c.key] }} /></div>
                <p className="tnum mt-1.5 text-[12.5px] text-ink-2">{s.done} of {s.open + s.done} done · {s.overdue ? <span className="font-semibold text-critical">{s.overdue} overdue</span> : "none overdue"}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[16px] font-semibold text-ink">Who Handles Which Product</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">{canManage ? "Choose one or more people for each product. New actions for the product go to them automatically." : "The people who look after each product."}</p>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="leads">
          {data.products.map((p) => {
            const ids = leads[p.key] ?? [];
            const openN = real.filter((t) => t.productKey === p.key && (t.status === "not_started" || t.status === "pending")).length;
            return (
              <li key={p.key} className="flex items-center gap-3 rounded-xl border border-line p-3" style={{ borderLeft: `4px solid ${productColor(p.key)}` }}><ProductTile k={p.key} size={32} />
                <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-ink">{p.name}</p><p className="mt-1 flex items-center gap-2"><TagBadge tag={p.tag as Tag} /><span className="text-[12.5px] text-ink-3">{openN} open</span></p></div>
                {canManage ? (
                  <Popover align="right" testId={`lead-${p.key}`} trigger={<span className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2 py-1.5 hover:bg-surface-2">{ids.length ? <PersonStack ids={ids} staff={data.staff} size={24} /> : <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"><UserPlus className="size-4" />Assign</span>}</span>}>
                    <PeoplePicker staff={data.staff} value={ids} onChange={(next) => { setLeads((l) => ({ ...l, [p.key]: next })); onLeads(p.key, next); }} />
                  </Popover>
                ) : <PersonStack ids={ids} staff={data.staff} size={24} />}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
