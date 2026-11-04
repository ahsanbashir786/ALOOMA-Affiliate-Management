"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { href } from "@/lib/url";
import { ACTION_HINT, type CreatorAction, type CreatorStatus } from "@/lib/affiliates/status";

export type DirFilterValues = { q: string; samples: string; product: string; status: string; action: string; type: string; wa: string; contact: string; sort: string };
type Props = {
  values: DirFilterValues;
  products: { pid: string; name: string; creators: number }[];
  actions: { key: CreatorAction; count: number }[];
  todo: number;
  statuses: { key: CreatorStatus; count: number }[];
  shown: string;
};

const DEFAULTS: Partial<DirFilterValues> = { samples: "with", sort: "gmv" };

/** Every choice takes effect straight away (no Apply). Search waits a moment after typing. */
export function DirectoryFilters({ values, products, actions, todo, statuses, shown }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q);
  const [more, setMore] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const urlFor = (patch: Partial<DirFilterValues>) => {
    const next = { ...values, ...patch } as Record<string, string>;
    for (const k of Object.keys(next)) if (next[k] === (DEFAULTS as Record<string, string>)[k]) next[k] = "";
    return href(path, next);
  };
  const go = (patch: Partial<DirFilterValues>) => start(() => router.replace(urlFor(patch), { scroll: false }));
  const exportHref = href("/api/affiliates/directory-export", Object.fromEntries(Object.entries({ ...values, samples: values.samples === "with" ? "" : values.samples, sort: values.sort === "gmv" ? "" : values.sort })));
  const extra = [values.type, values.wa].filter(Boolean).length;
  const dirty = Object.entries(values).some(([k, v]) => k !== "sort" && k !== "samples" && k !== "contact" && v !== "");

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
              timer.current = setTimeout(() => go({ q: v.trim() }), 350);
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
        <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink-2 hover:bg-surface-2"><SlidersHorizontal className="size-4" /> More Filters{extra > 0 ? ` (${extra})` : ""}</button>
      </div>

      {(more || extra > 0) && (
        <div className="flex flex-wrap items-center gap-2.5" data-testid="more-filters">
        <Select aria-label="Content type" value={values.type} onChange={(e) => go({ type: e.target.value })}>
          <option value="">All Types</option>
          <option value="both">Video + LIVE</option>
          <option value="live">LIVE</option>
          <option value="video">Video</option>
        </Select>
        <Select aria-label="WhatsApp" value={values.wa} onChange={(e) => go({ wa: e.target.value })}>
          <option value="">All</option>
          <option value="yes">WhatsApp</option>
          <option value="no">No WhatsApp</option>
        </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Action to take">
        <span className="mr-1 text-[13px] font-medium text-ink-3">Action</span>
        <button type="button" className={chip(values.action === "")} aria-pressed={values.action === ""} onClick={() => go({ action: "" })}>All</button>
        <button type="button" className={chip(values.action === "todo")} aria-pressed={values.action === "todo"} onClick={() => go({ action: "todo" })} title="Every line that needs you to do something">
          To Do <span className="tnum opacity-80">{todo}</span>
        </button>
        {actions.filter((a) => a.count > 0 || values.action === a.key).map((a) => (
          <button key={a.key} type="button" className={chip(values.action === a.key)} aria-pressed={values.action === a.key} onClick={() => go({ action: values.action === a.key ? "" : a.key })} title={ACTION_HINT[a.key]}>
            {a.key} <span className="tnum opacity-80">{a.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-ink-3">
        <span>{shown}{pending ? " · Updating…" : ""}</span>
        <span className="flex items-center gap-3">
          {dirty && (
            <button type="button" onClick={() => { setQ(""); start(() => router.replace(href(path, { sort: values.sort === "gmv" ? "" : values.sort }), { scroll: false })); }} className="inline-flex items-center gap-1 text-ink-2 hover:text-brand">
              <X className="size-3.5" /> Clear Filters
            </button>
          )}
          <a href={exportHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 font-medium text-ink hover:bg-surface-2"><Download className="size-4" /> Export To Excel</a>
        </span>
      </div>
    </div>
  );
}
