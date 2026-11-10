// Small display helpers shared by the Data Sync boards (pure).
export function ago(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export const inMin = (iso: string | null, now: number) => {
  if (!iso) return null;
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  return m <= 0 ? "any moment" : m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
};
export const fresh = (iso: string | null, now: number) => (!iso ? "none" : now - new Date(iso).getTime() < 2 * 3600_000 ? "good" : now - new Date(iso).getTime() < 26 * 3600_000 ? "warn" : "bad");
export const DOT = { good: "bg-good", warn: "bg-warn", bad: "bg-critical", none: "bg-line-strong" } as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dmy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y}`; };
export const span = (a: string, b: string | null) => (b && b !== a ? `${dmy(a)} – ${dmy(b)}` : dmy(a));
export const dur = (sec: number) => {
  const t = Math.max(1, Math.round(sec));
  if (t < 60) return `${t} sec`;
  if (t < 3600) return t % 60 ? `${Math.floor(t / 60)} min ${t % 60} sec` : `${t / 60} min`;
  const m = Math.round((t % 3600) / 60);
  return m ? `${Math.floor(t / 3600)} h ${m} min` : `${t / 3600} h`;
};
export const EVERY = [{ v: 0, l: "Off" }, { v: 30, l: "Every 30 min" }, { v: 60, l: "Every hour" }, { v: 180, l: "Every 3 hours" }, { v: 720, l: "Every 12 hours" }, { v: 1440, l: "Daily" }];
