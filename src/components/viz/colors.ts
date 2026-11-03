/** Status colours used by every chart – the same tokens as the rest of the app, so light/dark themes just work. */
export const C = {
  brand: "var(--brand)",
  good: "var(--good)",
  warn: "var(--warn)",
  serious: "var(--serious)",
  critical: "var(--critical)",
  line: "var(--line-strong)",
  ink: "var(--ink)",
  muted: "var(--ink-3)",
} as const;
export type ToneKey = keyof typeof C;
