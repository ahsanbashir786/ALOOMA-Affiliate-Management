"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownUp, Download, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { href } from "@/lib/url";
import { ACTION_HINT, type CreatorAction, type CreatorStatus } from "@/lib/affiliates/status";
import { CREATOR_SORTS, PERIODS } from "@/lib/creators/params";
import { TIERS } from "@/lib/creators/score";

export type CreatorFilterValues = { q: string; samples: string; product: string; status: string; action: string; type: string; wa: string; contact: string; owner: string; tier: string; sort: string; days: string };
type Props = {
  values: CreatorFilterValues;
  products: { pid: string; name: string; creators: number }[];
  actions: { key: CreatorAction; count: number }[];
  todo: number;
  statuses: { key: CreatorStatus; count: number }[];
  staff: { id: string; name: string }[];
  shown: string;
};
const DEFAULTS: Partial<CreatorFilterValues> = { samples: "all", sort: "gmv", days: "all" };

/** Every choice takes effect straight away (no Apply). Search waits a moment after typing. */
export function CreatorFilters({ values, products, actions, todo, statuses, staff, shown }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q);
  const [more, setMore] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const urlFor = (patch: Partial<CreatorFilterValues>) => {
    const next = { ...values, ...patch } as Record<string, string>;
    for (const k of Object.keys(next)) if (next[k] === (DEFAULTS as Record<string, string>)[k]) next[k] = "";
    return href(path, next);
  };
  const go = (patch: Partial<CreatorFilterValues>) => start(() => router.replace(urlFor(patch), { scroll: false }));
  const exportHref = href("/api/creators/export", Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === (DEFAULTS as Record<string, string>)[k] ? "" : v])));
  const extra = [values.type, values.wa, values.contact, values.tier, values.samples !== "all" ? values.samples : ""].filter(Boolean).length;
  const dirty = Object.entries(values).some(([k, v]) => k !== "sort" && k !== "days" && k !== "samples" && v !== "") || values.samples !== "all";
  const chip = (active: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors", active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2");

  return (
    <div className="space-y-3 border-b border-line p-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (timer.current) clearTimeout(timer.current);
              const v = e.target.value;
              timer.current = setTimeout(() => go({ q: v.trim() }), 300);
            }}
            placeholder="Search Username"
            aria-label="Search creators"
            className="pl-9"
          />
        </div>
        <Select aria-label="Product" value={values.product} onChange={(e) => go({ product: e.target.value })} className="max-w-56">
          <option value="">All Products</option>
          {products.map((p) => <option key={p.pid} value={p.pid}>{p.name} ({p.creators})</option>)}
        </Select>
        <Select aria-label="Status" value={values.status} onChange={(e) => go({ status: e.target.value })}>
          <option value="">Any Status</option>
          {statuses.map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count})</option>)}
        </Select>
        <Select aria-label="Owner" value={values.owner} onChange={(e) => go({ owner: e.target.value })}>
          <option value="">Any Owner</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink-2 hover:bg-surface-2"><SlidersHorizontal className="size-4" /> More Filters{extra > 0 ? ` (${extra})` : ""}</button>
      </div>

      {(more || extra > 0) && (
        <div className="flex flex-wrap items-center gap-2.5" data-testid="more-filters">
          <Select aria-label="Tier" value={values.tier} onChange={(e) => go({ tier: e.target.value })}>
            <option value="">Any Tier</option>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select aria-label="Content type" value={values.type} onChange={(e) => go({ type: e.target.value })}>
            <option value="">All Types</option>
            <option value="both">Video + LIVE</option>
            <option value="live">LIVE</option>
            <option value="video">Video</option>
          </Select>
          <Select aria-label="Samples" value={values.samples} onChange={(e) => go({ samples: e.target.value })}>
            <option value="all">With Or Without Samples</option>
            <option value="with">Received A Sample</option>
            <option value="none">No Sample Yet</option>
          </Select>
          <Select aria-label="Contact" value={values.contact} onChange={(e) => go({ contact: e.target.value })}>
            <option value="">Contact: All</option>
            <option value="never">Not Contacted</option>
            <option value="recent">Contacted This Week</option>
            <option value="overdue">Promise Overdue</option>
          </Select>
          <Select aria-label="WhatsApp" value={values.wa} onChange={(e) => go({ wa: e.target.value })}>
            <option value="">All</option>
            <option value="yes">WhatsApp</option>
            <option value="no">No WhatsApp</option>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Action to take">
          <span className="mr-1 text-[13px] font-medium text-ink-3">Action</span>
          <button type="button" className={chip(values.action === "")} aria-pressed={values.action === ""} onClick={() => go({ action: "" })}>All</button>
          <button type="button" className={chip(values.action === "todo")} aria-pressed={values.action === "todo"} onClick={() => go({ action: "todo" })} title="Product lines that need you to do something">
            To Do <span className="tnum opacity-80">{todo}</span>
          </button>
          {actions.filter((a) => a.count > 0 || values.action === a.key).map((a) => (
            <button key={a.key} type="button" className={chip(values.action === a.key)} aria-pressed={values.action === a.key} onClick={() => go({ action: values.action === a.key ? "" : a.key })} title={ACTION_HINT[a.key]}>
              {a.key} <span className="tnum opacity-80">{a.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5" role="group" aria-label="Period for orders, GMV and videos">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" aria-pressed={values.days === p.key} onClick={() => go({ days: p.key })} className={cn("h-7 rounded-md px-2.5 text-[13px] font-medium", values.days === p.key ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2")}>{p.label}</button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
            <ArrowDownUp className="size-4" />
            <Select aria-label="Sort by" value={CREATOR_SORTS.some((s) => s.key === values.sort) ? values.sort : "gmv"} onChange={(e) => go({ sort: e.target.value })}>
              {CREATOR_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-ink-3">
        <span>{shown}{pending ? " · Updating…" : ""}</span>
        <span className="flex items-center gap-3">
          {dirty && (
            <button type="button" onClick={() => { setQ(""); start(() => router.replace(href(path, { sort: values.sort === "gmv" ? "" : values.sort, days: values.days === "all" ? "" : values.days }), { scroll: false })); }} className="inline-flex items-center gap-1 text-ink-2 hover:text-brand">
              <X className="size-3.5" /> Clear Filters
            </button>
          )}
          <a href={exportHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 font-medium text-ink hover:bg-surface-2"><Download className="size-4" /> Export To Excel</a>
        </span>
      </div>
    </div>
  );
}
