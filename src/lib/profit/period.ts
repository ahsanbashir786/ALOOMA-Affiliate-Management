import { addDaysISO, todayKL } from "@/lib/time";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const valid = (v: string | undefined) => !!v && ISO.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;

export type Period = { key: string; from: string | null; to: string | null; label: string };

export const monthStart = (day: string) => day.slice(0, 7) + "-01";
export const monthEnd = (day: string) => addDaysISO(addDaysISO(monthStart(day), 32).slice(0, 7) + "-01", -1);

export const PERIODS = [
  { key: "this", label: "This Month" },
  { key: "last", label: "Last Month" },
  { key: "30", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
] as const;

/** Orders are counted in the month they were sold. The default is the current month. */
export function resolvePeriod(range: string | undefined, from: string | undefined, to: string | undefined): Period {
  const today = todayKL();
  if (valid(from) || valid(to)) {
    const f = valid(from) ? from! : null, t = valid(to) ? to! : null;
    return { key: "custom", from: f, to: t, label: `${f ?? "Start"} to ${t ?? "Today"}` };
  }
  if (range === "all") return { key: "all", from: null, to: null, label: "All Time" };
  if (range === "last") { const last = addDaysISO(monthStart(today), -1); return { key: "last", from: monthStart(last), to: last, label: "Last Month" }; }
  if (range === "30") return { key: "30", from: addDaysISO(today, -29), to: today, label: "Last 30 Days" };
  return { key: "this", from: monthStart(today), to: today, label: "This Month" };
}

export const inPeriod = (day: string, p: Period) => (!p.from || day >= p.from) && (!p.to || day <= p.to);
