/** Build a URL, dropping empty params. */
export function href(path: string, params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Only the params that define the reporting period. */
export function periodParams(sp: SP) {
  return { range: one(sp.range), from: one(sp.from), to: one(sp.to) };
}
