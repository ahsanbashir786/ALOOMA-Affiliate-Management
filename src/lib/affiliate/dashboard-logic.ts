// The Command dashboard's rules, in plain numbers. Pure (no database).
import { addDaysISO, daysBetweenISO } from "@/lib/time";

/**
 * The dates to show and the same number of days just before them.
 * Data only reaches `ref` (the latest day TikTok has given us). If the chosen dates end later than that, the whole window moves back,
 * so "Last 7 days" is still 7 days of real data and not 6.
 */
export function resolveWindow(range: { start: string; end: string } | undefined, ref: string): { start: string; end: string; days: number; prevStart: string; prevEnd: string; moved: boolean } {
  const days = range ? Math.max(1, daysBetweenISO(range.start, range.end) + 1) : 28;
  const end = range && range.end <= ref ? range.end : ref;
  const start = addDaysISO(end, -(days - 1));
  const prevEnd = addDaysISO(start, -1);
  return { start, end, days, prevStart: addDaysISO(prevEnd, -(days - 1)), prevEnd, moved: !!range && range.end > ref };
}

export type Kpis = { sales: number; creators: number; videos: number; oldShare: number | null };
export type Status = "good" | "watch" | "problem";
export type Check = { key: "sales" | "creators" | "videos" | "old"; question: string; status: Status; answer: string; button?: { label: string; href: string } };

const pct = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
const rm = (n: number) => `RM ${n >= 10000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString("en-MY")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-MY");
const arrow = (p: number | null) => (p == null ? "" : p >= 0 ? `up ${Math.round(p * 100)}%` : `down ${Math.round(-p * 100)}%`);

/** Four plain questions, each answered Good, Watch or Problem, with a button to do something about it. */
export function healthChecks(now: Kpis, before: Kpis): Check[] {
  const ps = pct(now.sales, before.sales), pc = pct(now.creators, before.creators), pv = pct(now.videos, before.videos);
  const sales: Status = ps == null || ps >= -0.05 ? "good" : ps >= -0.15 ? "watch" : "problem";
  const creators: Status = pc == null || pc >= -0.03 ? "good" : pc >= -0.1 ? "watch" : "problem";
  const videos: Status = pv == null || pv >= -0.1 ? "good" : pv >= -0.3 ? "watch" : "problem";
  const old: Status = now.oldShare == null || now.oldShare < 0.4 ? "good" : now.oldShare < 0.65 ? "watch" : "problem";
  return [
    { key: "sales", question: "Are my sales holding?", status: sales, answer: `${rm(now.sales)}${ps == null ? "" : ps > -0.02 && ps < 0.02 ? ", about the same as last period" : `, ${arrow(ps)} on last period`}` },
    { key: "creators", question: "Are creators still selling?", status: creators, answer: `${num(now.creators)} creators made a sale${pc == null ? "" : `, ${arrow(pc)} on ${num(before.creators)}`}`, button: creators === "good" ? undefined : { label: "Wake Up Quiet Creators", href: "/affiliate/actions?lever=creators" } },
    { key: "videos", question: "Are creators posting new videos?", status: videos, answer: `${num(now.videos)} new videos and LIVE sessions${pv == null ? "" : `, ${arrow(pv)} on ${num(before.videos)}`}`, button: videos === "good" ? undefined : { label: "Ask Creators For New Videos", href: "/affiliate/actions?lever=content" } },
    { key: "old", question: "Are old videos carrying my sales?", status: old, answer: now.oldShare == null ? "No video or LIVE sales in these dates" : `${Math.round(now.oldShare * 100)}% of video and LIVE sales come from videos older than 30 days`, button: old === "good" ? undefined : { label: "See Fading Videos", href: "/affiliate/content?tab=fading" } },
  ];
}

/** One sentence that sums the four checks up. */
export function headline(checks: Check[]): string {
  const by = Object.fromEntries(checks.map((c) => [c.key, c.status])) as Record<Check["key"], Status>;
  const sales = by.sales === "good" ? "Sales are holding" : by.sales === "watch" ? "Sales are slipping" : "Sales are falling";
  const probs: string[] = [];
  if (by.creators !== "good") probs.push("fewer creators are selling");
  if (by.videos !== "good") probs.push("new posting has dropped");
  if (by.old !== "good") probs.push("sales depend on old videos");
  if (!probs.length) return by.sales === "good" ? "Affiliate sales are healthy." : `${sales}.`;
  return `${sales}, but ${probs.length > 1 ? `${probs.slice(0, -1).join(", ")} and ${probs[probs.length - 1]}` : probs[0]}.`;
}
