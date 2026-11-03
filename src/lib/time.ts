// All dates the people see and all scheduling use Malaysia time (Asia/Kuala_Lumpur, UTC+8, no daylight saving).
export const TZ = "Asia/Kuala_Lumpur";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const dayLabelFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });

/** YYYY-MM-DD of an instant in Kuala Lumpur. */
export const dayKL = (d: Date | string | number): string => dayFmt.format(new Date(d));

/** Today in Kuala Lumpur as YYYY-MM-DD. */
export const todayKL = (): string => dayKL(Date.now());

/** Add calendar days to a YYYY-MM-DD string. */
export function addDaysISO(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (b − a), both YYYY-MM-DD. */
export const daysBetweenISO = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** "9 Nov, 14:05" in Kuala Lumpur. */
export const fmtDateTimeKL = (d: Date | string | number): string => dateTimeFmt.format(new Date(d)).replace(",", "");

/** "9 Nov" for a YYYY-MM-DD day (no timezone shift). */
export const fmtDayLabel = (day: string): string => dayLabelFmt.format(new Date(day + "T12:00:00Z"));

/** Monday of the week containing `day`. */
export function weekStartISO(day: string): string {
  const dow = new Date(day + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  return addDaysISO(day, -((dow + 6) % 7));
}
