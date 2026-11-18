// Which videos are heating up, fading or have stopped selling, from their own sales. Pure (no database).
// Every video is judged on two windows of 14 days that end on the latest day of data.

export type VideoClass = "heating" | "fading" | "stopped" | "steady" | "small";
export const CLASSES: { key: Exclude<VideoClass, "steady" | "small">; label: string; help: string }[] = [
  { key: "heating", label: "Heating Up", help: "Sales in the last 14 days are at least 30% higher than the 14 days before, and at least RM 100. The video is catching on: put ads behind it now." },
  { key: "fading", label: "Fading", help: "Sold RM 150 or more in the 14 days before, and the last 14 days are less than half of that. Ask the creator for a fresh video before it dies." },
  { key: "stopped", label: "Stopped Selling", help: "Sold RM 300 or more in its life, last sale within 90 days, and nothing in the last 28 days. Ask the creator for a replacement." },
];
export const HEATING_MIN = 100, HEATING_RATIO = 1.3, FADING_MIN = 150, FADING_RATIO = 0.5, STOPPED_MIN = 300, STOPPED_WITHIN = 90;

export type VideoFacts = { total: number; s14: number; p14: number; daysSinceLastSale: number | null };

export function classifyVideo(f: VideoFacts): VideoClass {
  if (f.s14 >= HEATING_MIN && f.s14 >= f.p14 * HEATING_RATIO) return "heating";
  if (f.p14 >= FADING_MIN && f.s14 < f.p14 * FADING_RATIO) return "fading";
  if (f.total >= STOPPED_MIN && f.s14 <= 0 && f.p14 <= 0 && f.daysSinceLastSale != null && f.daysSinceLastSale <= STOPPED_WITHIN) return "stopped";
  if (f.s14 > 0 || f.p14 > 0) return "steady";
  return "small";
}

/** How old a video is, in the buckets the owner thinks in. */
export const AGE_BUCKETS = [
  { key: "d14", label: "Under 15 days", max: 14 },
  { key: "d30", label: "15 to 30 days", max: 30 },
  { key: "d60", label: "31 to 60 days", max: 60 },
  { key: "d90", label: "61 to 90 days", max: 90 },
  { key: "old", label: "Over 90 days", max: Infinity },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];
export const ageBucket = (days: number): AgeKey => AGE_BUCKETS.find((b) => days <= b.max)!.key;

/** Sales (28 days) by how old the video is: shows whether sales depend on old videos. */
export function ageMix(videos: { ageDays: number | null; s28: number }[]): { key: AgeKey; label: string; sales: number; share: number }[] {
  const t = new Map<AgeKey, number>(AGE_BUCKETS.map((b) => [b.key, 0]));
  let total = 0;
  for (const v of videos) {
    if (v.ageDays == null || v.s28 <= 0) continue;
    const k = ageBucket(v.ageDays);
    t.set(k, (t.get(k) ?? 0) + v.s28); total += v.s28;
  }
  return AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, sales: t.get(b.key) ?? 0, share: total > 0 ? (t.get(b.key) ?? 0) / total : 0 }));
}
