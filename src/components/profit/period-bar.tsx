"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { DateRange } from "@/components/creators/date-range";
import { PERIODS } from "@/lib/profit/period";

/** Choose the month or dates. Orders are counted in the month they were sold. */
export function PeriodBar({ active, from, to, today }: { active: string; from: string; to: string; today: string }) {
  const path = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const hrefFor = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("page");
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="period-bar">
      <nav aria-label="Period" className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
        {PERIODS.map((p) => (
          <Link key={p.key} href={hrefFor({ range: p.key === "this" ? null : p.key, from: null, to: null })} scroll={false}
            className={cn("inline-flex h-8 items-center rounded-md px-3 text-[13.5px] font-medium", active === p.key ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}>{p.label}</Link>
        ))}
      </nav>
      <DateRange key={`${from}|${to}`} from={active === "custom" ? from : ""} to={active === "custom" ? to : ""} today={today} hideAll defaultLabel="Choose Dates"
        onApply={(f, t) => router.push(hrefFor({ range: null, from: f || null, to: t || null }), { scroll: false })} />
    </div>
  );
}
