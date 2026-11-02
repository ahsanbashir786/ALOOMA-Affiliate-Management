"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn, fmtDateShort } from "@/lib/utils";

const OPTIONS = [
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "28d", label: "Last 28 days" },
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "all", label: "All data" },
];

export function PeriodPicker({
  current,
  start,
  end,
  min,
  max,
}: {
  current: string;
  start: string;
  end: string;
  min: string;
  max: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(params: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const k of ["range", "from", "to", "page"]) next.delete(k);
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  const label = OPTIONS.find((o) => o.key === current)?.label ?? "Custom range";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink shadow-card hover:bg-surface-2"
      >
        <CalendarDays className="size-4 text-ink-3" />
        <span className="font-medium">{label}</span>
        <span className="tnum hidden text-ink-3 sm:inline">
          {fmtDateShort(start)} – {fmtDateShort(end)}
        </span>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute top-11 right-0 z-50 w-[300px] rounded-xl border border-line bg-surface p-2 shadow-pop"
        >
          <ul>
            {OPTIONS.map((o) => (
              <li key={o.key}>
                <button
                  onClick={() => go({ range: o.key })}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] text-ink hover:bg-surface-2"
                >
                  {o.label}
                  {current === o.key && <Check className="size-4 text-brand" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-line p-3">
            <p className="mb-2 text-[12px] font-medium text-ink-3">Custom range</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                min={min}
                max={max}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
              />
              <span className="text-ink-3">–</span>
              <input
                type="date"
                value={to}
                min={min}
                max={max}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              className="mt-3 w-full"
              disabled={!from || !to || from > to}
              onClick={() => go({ range: "custom", from, to })}
            >
              Apply
            </Button>
          </div>
          <p className="px-3 pb-2 text-[12px] text-ink-3">
            Data available {fmtDateShort(min)} – {fmtDateShort(max)}
          </p>
        </div>
      )}
    </div>
  );
}
