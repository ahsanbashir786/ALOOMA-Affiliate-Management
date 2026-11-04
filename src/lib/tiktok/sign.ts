// TikTok Shop Open API request signing and token helpers. Pure (no network, no database) so it can be tested.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Signature: take every query parameter except `sign` and `access_token`, sort them by name, join as name+value,
 * put the API path in front, append the JSON body (if any), wrap the whole text in the app secret, and HMAC-SHA256 it with the secret (hex).
 */
export function signRequest(opts: { path: string; query: Record<string, string>; body?: string; secret: string }): string {
  const keys = Object.keys(opts.query).filter((k) => k !== "sign" && k !== "access_token").sort();
  const base = opts.path + keys.map((k) => k + opts.query[k]).join("") + (opts.body ?? "");
  return createHmac("sha256", opts.secret).update(opts.secret + base + opts.secret).digest("hex");
}

/** Tokens are stored encrypted (AES-256-GCM) with a key made from the app secret, so a copy of the database alone cannot use them. */
const keyOf = (secret: string) => createHash("sha256").update("tiktok-token|" + secret).digest();

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(packed: string, secret: string): string {
  const [iv, tag, enc] = packed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", keyOf(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** TikTok gives an expiry either as a Unix timestamp or as seconds from now. Returns epoch seconds. */
export function expiryEpoch(v: number, nowSec: number): number {
  return v > 1_000_000_000 ? v : nowSec + v;
}

/** Refresh when less than this many seconds remain (the access token lasts days, so one daily check is plenty). */
export const REFRESH_MARGIN_SEC = 6 * 3600;
export const needsRefresh = (accessExpiresAt: number, nowSec: number) => accessExpiresAt - nowSec < REFRESH_MARGIN_SEC;

/** All key paths of a JSON value (names only, never values), to see which fields an endpoint returns. */
export function keyPaths(v: unknown, prefix = "", depth = 0, out = new Set<string>()): string[] {
  if (depth > 4 || v == null) return [...out];
  if (Array.isArray(v)) { for (const x of v.slice(0, 3)) keyPaths(x, prefix + "[]", depth + 1, out); return [...out]; }
  if (typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const p = prefix ? `${prefix}.${k}` : k; out.add(p); keyPaths(x, p, depth + 1, out); } }
  return [...out];
}
