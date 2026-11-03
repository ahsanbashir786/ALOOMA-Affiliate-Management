// Pure time-series helpers (no database): forecasting with an honest range, and unusual-day detection.
// Methods are deliberately simple and explainable – they are shown to the user with their limits.

export type Forecast = { points: { value: number; low: number; high: number }[]; trendPerWeek: number; method: string };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Holt's linear smoothing (level + trend) forecast with an ~80% range from past one-step errors.
 * Returns null when there is too little history (fewer than `minPoints` periods) – the screens then say "not enough history".
 * Never negative. alpha/beta are fixed, moderate values (0.5 / 0.2) so the forecast follows recent weeks without chasing noise.
 */
export function holtForecast(values: number[], horizon: number, minPoints = 6): Forecast | null {
  if (values.length < minPoints) return null;
  const alpha = 0.5, beta = 0.2;
  let level = values[0];
  let trend = (values[Math.min(3, values.length - 1)] - values[0]) / Math.min(3, values.length - 1);
  const errors: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const pred = level + trend;
    errors.push(values[i] - pred);
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const e = sd(errors);
  const z = 1.28; // 80% two-sided
  const points = Array.from({ length: horizon }, (_, h) => {
    const value = Math.max(0, level + trend * (h + 1));
    const w = z * e * Math.sqrt(h + 1);
    return { value, low: Math.max(0, value - w), high: value + w };
  });
  return { points, trendPerWeek: trend, method: "Holt linear smoothing (level + trend), 80% range from past errors" };
}

export type Flag = { index: number; value: number; expected: number; z: number };

/**
 * Unusual points: each value is compared with the mean and spread of the previous `window` values.
 * A point is flagged when it is more than `threshold` standard deviations away (and the spread is meaningful).
 * Short histories flag nothing rather than guess.
 */
export function unusualPoints(values: number[], window = 28, threshold = 2.5, minSpread = 0.5): Flag[] {
  const out: Flag[] = [];
  for (let i = window; i < values.length; i++) {
    const past = values.slice(i - window, i);
    const s = sd(past);
    if (s < minSpread) continue;
    const m = mean(past);
    const z = (values[i] - m) / s;
    if (Math.abs(z) >= threshold) out.push({ index: i, value: values[i], expected: m, z });
  }
  return out;
}

/** Percent change of the last `n` periods against the `n` before them (null when the earlier total is zero or too short). */
export function changePct(values: number[], n: number): number | null {
  if (n < 1 || values.length < n * 2) return null;
  const a = values.slice(-n).reduce((x, y) => x + y, 0);
  const b = values.slice(-n * 2, -n).reduce((x, y) => x + y, 0);
  return b === 0 ? null : ((a - b) / b) * 100;
}
