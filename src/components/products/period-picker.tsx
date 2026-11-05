"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { DateRange } from "@/components/creators/date-range";
import { href } from "@/lib/url";

/** The date range of the Products screens. Keeps every other choice (tag, sort) and goes to the new dates at once. */
export function PeriodPicker({ from, to, today, keep }: { from: string; to: string; today: string; keep: Record<string, string> }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <span aria-busy={pending}>
      <DateRange from={from} to={to} today={today} hideAll defaultLabel="Last 28 days" onApply={(f, t) => start(() => router.replace(href(path, { ...keep, from: f, to: t }), { scroll: false }))} />
    </span>
  );
}
