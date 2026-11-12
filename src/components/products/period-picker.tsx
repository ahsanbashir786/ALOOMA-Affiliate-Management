"use client";

import { DatesPicker } from "@/components/ui/range-picker";

/** The date range of the Product Analysis screens: the same calendar as everywhere else. The other choices in the address (tag, sort) are kept. */
export function PeriodPicker({ from, to, today }: { from: string; to: string; today: string; keep?: Record<string, string> }) {
  return <DatesPicker from={from} to={to} today={today} emptyLabel="Last 28 days" compare presets={["today", "yesterday", "7d", "14d", "30d", "90d", "this_week", "last_week", "this_month", "last_month"]} />;
}
