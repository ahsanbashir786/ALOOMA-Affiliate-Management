"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { startNav } from "@/components/shell/nav-progress";

/** A search box that keeps its words in the address (?q=…), so the server filters the list and the result can be shared or reloaded. */
export function UrlSearch({ placeholder, param = "q", testId }: { placeholder: string; param?: string; testId?: string }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [v, setV] = useState(params.get(param) ?? "");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const go = (q: string) => {
    const next = new URLSearchParams(params.toString());
    if (q.trim()) next.set(param, q.trim()); else next.delete(param);
    const to = `${path}${next.toString() ? `?${next}` : ""}`;
    startNav(to);
    start(() => router.replace(to, { scroll: false }));
  };
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input value={v} data-testid={testId} aria-label={placeholder} placeholder={placeholder}
        onChange={(e) => { const q = e.target.value; setV(q); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => go(q), 300); }}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-8 pl-9 text-[13.5px] text-ink placeholder:text-ink-3" />
      {v && <button type="button" aria-label="Clear search" onClick={() => { setV(""); go(""); }} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-ink"><X className="size-4" /></button>}
    </div>
  );
}
