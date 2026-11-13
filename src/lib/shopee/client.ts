import "server-only";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/tiktok/sign";

// Shopee Open Platform v2. Every call is signed with the partner key (HMAC-SHA256).
//   sign base for the sign-in and token calls:  partner_id + path + timestamp
//   sign base for shop calls:                   partner_id + path + timestamp + access_token + shop_id
// The access token lasts 4 hours; the refresh token 30 days and is replaced every time it is used.
// Real addresses can be overridden for tests with SHOPEE_API_BASE.
export const SHOPEE_HOSTS = { sandbox: "https://openplatform.sandbox.test-stable.shopee.sg", live: "https://partner.shopeemobile.com" } as const;
const KEY = "shopee_connection";
const REFRESH_DAYS = 30;
/** Renew the access token when less than this is left. */
const RENEW_BEFORE_SEC = 300;

export type ShopeeEnv = "sandbox" | "live";
export type ShopeeConfig = { partnerId: number; partnerKey: string; env: ShopeeEnv; base: string };
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Partner ID and key come from the private environment, never from the code or the database. */
export function shopeeConfig(env: Record<string, string | undefined> = process.env): ShopeeConfig | null {
  const partnerId = Number(env.SHOPEE_PARTNER_ID?.trim());
  const partnerKey = env.SHOPEE_PARTNER_KEY?.trim();
  if (!Number.isInteger(partnerId) || partnerId <= 0 || !partnerKey) return null;
  const e: ShopeeEnv = env.SHOPEE_ENV?.trim().toLowerCase() === "live" ? "live" : "sandbox";
  return { partnerId, partnerKey, env: e, base: (env.SHOPEE_API_BASE?.trim() || SHOPEE_HOSTS[e]).replace(/\/$/, "") };
}

export const shopeeSign = (partnerKey: string, base: string) => createHmac("sha256", partnerKey).update(base).digest("hex");
const nowSec = () => Math.floor(Date.now() / 1000);

/** The page where the owner approves the connection. Shopee returns to `redirect` with ?code=…&shop_id=… (or main_account_id). */
export function shopeeAuthorizeUrl(cfg: ShopeeConfig, redirect: string, ts = nowSec()): string {
  const path = "/api/v2/shop/auth_partner";
  const u = new URL(cfg.base + path);
  u.searchParams.set("partner_id", String(cfg.partnerId));
  u.searchParams.set("timestamp", String(ts));
  u.searchParams.set("sign", shopeeSign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}`));
  u.searchParams.set("redirect", redirect);
  return u.toString();
}

/** Shopee answers 200 with an `error` text (empty = fine). This keeps that text and the request id, so a message can be traced. */
export class ShopeeApiError extends Error {
  constructor(message: string, readonly error: string | null, readonly requestId: string | null, readonly httpStatus: number | null = null) { super(message); this.name = "ShopeeApiError"; }
  /** The login was refused: it must be renewed, or the owner must press Connect again. */
  get isAuth() { return !!this.error && /error_auth|invalid_access_token|access_token.*(expire|invalid)|error_token/i.test(this.error + " " + this.message); }
  get isRateLimit() { return this.httpStatus === 429 || /rate.?limit|too many|error_too_many/i.test(`${this.error} ${this.message}`); }
  get isServer() { return (this.httpStatus != null && this.httpStatus >= 500) || /error_server|inner_error/i.test(this.error ?? ""); }
}

type Stored = {
  env: ShopeeEnv; partnerId: number; shopIds: string[]; shopName: string | null; region: string | null; connectedAt: string;
  accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number;
};
export type ShopeeConnectionInfo = { connected: boolean; env: ShopeeEnv | null; shopIds: string[]; shopName: string | null; region: string | null; connectedAt: string | null; accessExpiresAt: number | null; refreshExpiresAt: number | null };

async function save(v: Stored) {
  await db.insert(settings).values({ key: KEY, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}
async function load(): Promise<Stored | null> {
  const [r] = await db.select().from(settings).where(eq(settings.key, KEY));
  return (r?.value as Stored | undefined) ?? null;
}

type Body = Record<string, unknown> & { error?: string; message?: string; request_id?: string; response?: unknown };

async function send(url: string, init: RequestInit, f: Fetch): Promise<Body> {
  let res: Response;
  try { res = await f(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(60_000) }); }
  catch (e) { throw new ShopeeApiError(`Could not reach Shopee${e instanceof Error && e.message ? ` (${e.message})` : ""}.`, null, null, null); }
  const j = (await res.json().catch(() => null)) as Body | null;
  if (!j) throw new ShopeeApiError(`Shopee sent an answer we could not read (HTTP ${res.status}).`, null, null, res.status);
  if (j.error) throw new ShopeeApiError(`Shopee said no (${j.error}): ${j.message ?? "no message"}`, String(j.error), j.request_id ?? null, res.status);
  return j;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expire_in?: number; shop_id_list?: unknown; shop_id?: unknown };

/** Called once, from the callback page, with the one-time code (valid 10 minutes). Stores both tokens encrypted. */
export async function shopeeConnectWithCode(code: string, who: { shopId?: string; mainAccountId?: string }, cfg: ShopeeConfig, f: Fetch = fetch): Promise<{ shopIds: string[] }> {
  const path = "/api/v2/auth/token/get";
  const ts = nowSec();
  const url = `${cfg.base}${path}?${new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(ts), sign: shopeeSign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}`) })}`;
  const body: Record<string, unknown> = { code, partner_id: cfg.partnerId };
  if (who.shopId) body.shop_id = Number(who.shopId); else if (who.mainAccountId) body.main_account_id = Number(who.mainAccountId);
  else throw new ShopeeApiError("Shopee did not send a shop ID.", null, null);
  const d = (await send(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, f)) as TokenAnswer;
  if (!d.access_token || !d.refresh_token) throw new ShopeeApiError("Shopee did not send the login tokens.", null, null);
  const list = Array.isArray(d.shop_id_list) ? d.shop_id_list.map(String) : [];
  const shopIds = list.length ? list : who.shopId ? [who.shopId] : [];
  if (!shopIds.length) throw new ShopeeApiError("Shopee did not say which shop was approved.", null, null);
  const t = nowSec();
  await save({
    env: cfg.env, partnerId: cfg.partnerId, shopIds, shopName: null, region: null, connectedAt: new Date().toISOString(),
    accessToken: encryptToken(d.access_token, cfg.partnerKey), refreshToken: encryptToken(d.refresh_token, cfg.partnerKey),
    accessExpiresAt: t + (Number(d.expire_in) || 14400), refreshExpiresAt: t + REFRESH_DAYS * 86400,
  });
  return { shopIds };
}

let refreshing: Promise<Stored> | null = null;

/** A refresh token works once: the answer holds a new one. Two callers must never refresh at the same time, so they share one refresh. */
async function refresh(cfg: ShopeeConfig, cur: Stored, f: Fetch): Promise<Stored> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const path = "/api/v2/auth/access_token/get";
      const ts = nowSec();
      const url = `${cfg.base}${path}?${new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(ts), sign: shopeeSign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}`) })}`;
      let refreshToken: string;
      try { refreshToken = decryptToken(cur.refreshToken, cfg.partnerKey); }
      catch { throw new ShopeeApiError("The saved Shopee login can no longer be read (the partner key changed). Press Connect again.", null, null); }
      const d = (await send(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken, partner_id: cfg.partnerId, shop_id: Number(cur.shopIds[0]) }) }, f)) as TokenAnswer;
      if (!d.access_token || !d.refresh_token) throw new ShopeeApiError("Shopee did not send new login tokens.", null, null);
      const t = nowSec();
      const next: Stored = { ...cur, accessToken: encryptToken(d.access_token, cfg.partnerKey), refreshToken: encryptToken(d.refresh_token, cfg.partnerKey), accessExpiresAt: t + (Number(d.expire_in) || 14400), refreshExpiresAt: t + REFRESH_DAYS * 86400 };
      await save(next);
      return next;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

/** The access token to use now, renewed first when it is about to end. */
async function current(cfg: ShopeeConfig, f: Fetch, force = false): Promise<{ token: string; shopId: string; stored: Stored }> {
  let cur = await load();
  if (!cur) throw new ShopeeApiError("Shopee is not connected yet.", null, null);
  if (cur.env !== cfg.env || cur.partnerId !== cfg.partnerId) throw new ShopeeApiError(`The saved Shopee login belongs to another ${cur.env === cfg.env ? "app" : "environment"}. Press Connect again.`, null, null);
  if (force || cur.accessExpiresAt - nowSec() < RENEW_BEFORE_SEC) {
    if (cur.refreshExpiresAt <= nowSec()) throw new ShopeeApiError("The Shopee login ran out (30 days without renewing). Press Connect again.", "error_auth", null);
    cur = await refresh(cfg, cur, f);
  }
  try { return { token: decryptToken(cur.accessToken, cfg.partnerKey), shopId: cur.shopIds[0], stored: cur }; }
  catch { throw new ShopeeApiError("The saved Shopee login can no longer be read (the partner key changed). Press Connect again.", null, null); }
}

/** One signed call for the connected shop. Returns Shopee's `response` part. If Shopee says the token is no good, it is renewed once and the call repeated. */
export async function shopeeCall<T = Record<string, unknown>>(path: string, o: { cfg?: ShopeeConfig | null; f?: Fetch; method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
  const cfg = o.cfg ?? shopeeConfig();
  if (!cfg) throw new ShopeeApiError("The Shopee partner ID and key are not set on the server.", null, null);
  const f = o.f ?? fetch;
  for (let attempt = 0; ; attempt++) {
    const { token, shopId } = await current(cfg, f, attempt > 0);
    const ts = nowSec();
    const q = new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(ts), access_token: token, shop_id: shopId, sign: shopeeSign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}${token}${shopId}`) });
    for (const [k, v] of Object.entries(o.query ?? {})) if (v != null && v !== "") q.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
    try {
      const j = await send(`${cfg.base}${path}?${q}`, { method, headers: { "content-type": "application/json" }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }, f);
      return (j.response ?? {}) as T;
    } catch (e) {
      if (e instanceof ShopeeApiError && e.isAuth && attempt === 0) continue; // renew once, then try again
      throw e;
    }
  }
}

/** Reads the shop's own name and region and remembers them, so the screen can say which shop is connected. */
export async function shopeeRememberShop(cfg: ShopeeConfig, f: Fetch = fetch): Promise<{ shopName: string | null; region: string | null }> {
  const r = await shopeeCall<{ shop_name?: string; region?: string }>("/api/v2/shop/get_shop_info", { cfg, f });
  const cur = await load();
  if (cur) await save({ ...cur, shopName: r.shop_name ?? null, region: r.region ?? null });
  return { shopName: r.shop_name ?? null, region: r.region ?? null };
}

export async function shopeeConnectionInfo(): Promise<ShopeeConnectionInfo> {
  const c = await load();
  return { connected: !!c, env: c?.env ?? null, shopIds: c?.shopIds ?? [], shopName: c?.shopName ?? null, region: c?.region ?? null, connectedAt: c?.connectedAt ?? null, accessExpiresAt: c?.accessExpiresAt ?? null, refreshExpiresAt: c?.refreshExpiresAt ?? null };
}

export async function shopeeDisconnect(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, KEY));
}
