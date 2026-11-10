import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/tiktok/sign";

// TikTok API for Business (the "Marketing API"): a different service from the TikTok Shop API, with its own app, keys and login.
// The real addresses can be overridden (tests use a pretend TikTok) with TIKTOK_ADS_API_BASE and TIKTOK_ADS_AUTH_BASE.
const API_BASE = (process.env.TIKTOK_ADS_API_BASE || "https://business-api.tiktok.com/open_api/v1.3").replace(/\/$/, "");
const AUTH_BASE = process.env.TIKTOK_ADS_AUTH_BASE || "https://business-api.tiktok.com/portal/auth";
const KEY = "tiktok_ads_connection";

export type AdsConfig = { appId: string; appSecret: string; redirectUri: string | null };
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** App ID and secret come from the private environment, never from the code or the database. */
export function adsConfig(env: Record<string, string | undefined> = process.env): AdsConfig | null {
  const appId = env.TIKTOK_ADS_APP_ID?.trim();
  const appSecret = env.TIKTOK_ADS_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri: env.TIKTOK_ADS_REDIRECT_URI?.trim() || null };
}

/** The address TikTok sends the owner back to. It must be identical to the one saved in the TikTok app. */
export function redirectUriFor(cfg: AdsConfig, requestUrl: string, forwardedHost?: string | null, forwardedProto?: string | null): string {
  if (cfg.redirectUri) return cfg.redirectUri;
  const u = new URL(requestUrl);
  const host = forwardedHost || u.host;
  const proto = forwardedProto || u.protocol.replace(":", "");
  return `${proto}://${host}/api/tiktok-ads/callback`;
}

/** The page where the owner approves the connection. `state` guards against forged callbacks. */
export function adsAuthorizeUrl(cfg: AdsConfig, state: string, redirectUri: string): string {
  const u = new URL(AUTH_BASE);
  u.searchParams.set("app_id", cfg.appId);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", redirectUri);
  return u.toString();
}

/** TikTok answers with HTTP 200 and its own `code` (0 = fine). This error keeps that code and the request id, so a message can be traced. */
export class AdsApiError extends Error {
  constructor(message: string, readonly code: number | null, readonly requestId: string | null, readonly httpStatus: number | null = null) { super(message); this.name = "AdsApiError"; }
  /** The login was refused: the person must press Connect again. */
  get isAuth() { return (this.code != null && [40101, 40102, 40104, 40105].includes(this.code)) || /access.?token.*(invalid|expired|revoked)|(invalid|expired|revoked).*access.?token/i.test(this.message); }
  /** Too many requests: wait and try again. */
  get isRateLimit() { return this.code === 40100 || this.httpStatus === 429 || /too many requests|rate limit|QPS/i.test(this.message); }
  /** TikTok had a problem of its own: try again. */
  get isServer() { return (this.httpStatus != null && this.httpStatus >= 500) || (this.code != null && this.code >= 50000 && this.code < 60000); }
}

type Stored = { accessToken: string; advertiserIds: string[]; scopes: string[]; connectedAt: string; appId: string };
export type AdsConnectionInfo = { connected: boolean; advertiserIds: string[]; scopes: string[]; connectedAt: string | null };

async function save(v: Stored) {
  await db.insert(settings).values({ key: KEY, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}
async function load(): Promise<Stored | null> {
  const [r] = await db.select().from(settings).where(eq(settings.key, KEY));
  return (r?.value as Stored | undefined) ?? null;
}

type Envelope = { code?: number; message?: string; request_id?: string; data?: unknown };

async function send(url: string, init: RequestInit, f: Fetch): Promise<unknown> {
  let res: Response;
  try { res = await f(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(60_000) }); }
  catch (e) { throw new AdsApiError(`Could not reach TikTok${e instanceof Error && e.message ? ` (${e.message})` : ""}.`, null, null, null); }
  const j = (await res.json().catch(() => null)) as Envelope | null;
  if (!j) throw new AdsApiError(`TikTok sent an answer we could not read (HTTP ${res.status}).`, null, null, res.status);
  if (j.code !== 0) throw new AdsApiError(`TikTok said no (${j.code ?? res.status}): ${j.message ?? "no message"}`, typeof j.code === "number" ? j.code : null, j.request_id ?? null, res.status);
  return j.data ?? {};
}

/** Called once, from the callback page, with the one-time code TikTok sends back. Stores the token encrypted. */
export async function adsConnectWithCode(code: string, cfg: AdsConfig, f: Fetch = fetch): Promise<{ advertiserIds: string[] }> {
  const d = (await send(`${API_BASE}/oauth2/access_token/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app_id: cfg.appId, secret: cfg.appSecret, auth_code: code }) }, f)) as { access_token?: string; advertiser_ids?: unknown; scope?: unknown };
  if (!d.access_token) throw new AdsApiError("TikTok did not send an access token.", null, null);
  const ids = Array.isArray(d.advertiser_ids) ? d.advertiser_ids.map(String) : [];
  const scopes = Array.isArray(d.scope) ? d.scope.map(String) : [];
  await save({ accessToken: encryptToken(d.access_token, cfg.appSecret), advertiserIds: ids, scopes, connectedAt: new Date().toISOString(), appId: cfg.appId });
  return { advertiserIds: ids };
}

async function token(cfg: AdsConfig): Promise<{ token: string; stored: Stored }> {
  const cur = await load();
  if (!cur) throw new AdsApiError("TikTok Ads is not connected yet.", null, null);
  try { return { token: decryptToken(cur.accessToken, cfg.appSecret), stored: cur }; }
  catch { throw new AdsApiError("The saved TikTok Ads login can no longer be read (the app secret changed). Press Connect again.", null, null); }
}

/** List and object values go to TikTok as JSON text, as its API expects. */
export function queryString(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === "") continue;
    p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return p.toString();
}

/** One call to the Business API. Returns the `data` part; throws an AdsApiError carrying TikTok's own message when it says no. */
export async function adsCall<T = Record<string, unknown>>(
  path: string,
  o: { cfg?: AdsConfig | null; f?: Fetch; method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<T> {
  const cfg = o.cfg ?? adsConfig();
  if (!cfg) throw new AdsApiError("The TikTok Ads app ID and secret are not set on the server.", null, null);
  const { token: at } = await token(cfg);
  const qs = o.query ? queryString(o.query) : "";
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
  const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
  return (await send(url, { method, headers: { "Access-Token": at, "content-type": "application/json" }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }, o.f ?? fetch)) as T;
}

/** Asks TikTok which advertiser accounts this login covers, and remembers the answer. Falls back to the list saved at connect time. */
export async function adsAuthorizedAdvertisers(cfg: AdsConfig, f: Fetch = fetch): Promise<string[]> {
  const { token: at, stored } = await token(cfg);
  try {
    const d = (await send(`${API_BASE}/oauth2/advertiser/get/?${queryString({ app_id: cfg.appId, secret: cfg.appSecret, access_token: at })}`, { method: "GET" }, f)) as { list?: { advertiser_id?: unknown }[] };
    const ids = (d.list ?? []).map((x) => (x.advertiser_id == null ? "" : String(x.advertiser_id))).filter(Boolean);
    if (ids.length) {
      if (ids.join(",") !== stored.advertiserIds.join(",")) await save({ ...stored, advertiserIds: ids });
      return ids;
    }
  } catch (e) { if (e instanceof AdsApiError && e.isAuth) throw e; }
  return stored.advertiserIds;
}

export async function adsConnectionInfo(): Promise<AdsConnectionInfo> {
  const c = await load();
  return { connected: !!c, advertiserIds: c?.advertiserIds ?? [], scopes: c?.scopes ?? [], connectedAt: c?.connectedAt ?? null };
}

export async function adsDisconnect(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, KEY));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** When TikTok says "too many requests", every call waits together instead of each one hammering it. */
let coolUntil = 0;
export const resetAdsCooldown = () => { coolUntil = 0; };

/** adsCall, patient with the shared rate limit (waits, then tries again, up to six times) and with TikTok's own hiccups (three times). Sign-in problems are never retried. */
export async function adsCallPatient<T = Record<string, unknown>>(
  path: string,
  o: { cfg?: AdsConfig | null; f?: Fetch; method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const sleep = o.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (coolUntil > Date.now()) await sleep(coolUntil - Date.now());
    try { return await adsCall<T>(path, o); }
    catch (e) {
      if (e instanceof AdsApiError) {
        if (e.isRateLimit && attempt < 6) { coolUntil = Date.now() + 3000 * (attempt + 1); await sleep(3000 * (attempt + 1)); continue; }
        if (e.isServer && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
      }
      throw e;
    }
  }
}
