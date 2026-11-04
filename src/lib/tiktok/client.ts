import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptToken, encryptToken, expiryEpoch, needsRefresh, signRequest } from "./sign";

// The real TikTok addresses. They can be overridden (for tests against a pretend TikTok) with TIKTOK_API_BASE and TIKTOK_AUTH_BASE.
const API_BASE = process.env.TIKTOK_API_BASE || "https://open-api.tiktokglobalshop.com";
const AUTH_BASE = process.env.TIKTOK_AUTH_BASE || "https://auth.tiktok-shops.com";
const KEY = "tiktok_connection";

export type TikTokConfig = { appKey: string; appSecret: string; serviceId: string | null; authUrl: string | null };
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** App key and secret come from the private environment, never from the code or the database. */
export function tiktokConfig(env: Record<string, string | undefined> = process.env): TikTokConfig | null {
  const appKey = env.TIKTOK_APP_KEY?.trim();
  const appSecret = env.TIKTOK_APP_SECRET?.trim();
  if (!appKey || !appSecret) return null;
  return { appKey, appSecret, serviceId: env.TIKTOK_SERVICE_ID?.trim() || null, authUrl: env.TIKTOK_AUTH_URL?.trim() || null };
}

/** The page where the owner approves the connection. `state` guards against forged callbacks. */
export function authorizeUrl(cfg: TikTokConfig, state: string): string | null {
  const base = cfg.authUrl ?? (cfg.serviceId ? `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(cfg.serviceId)}` : null);
  if (!base) return null;
  const u = new URL(base);
  u.searchParams.set("state", state);
  return u.toString();
}

type Stored = {
  accessToken: string; // encrypted
  refreshToken: string; // encrypted
  accessExpiresAt: number;
  refreshExpiresAt: number;
  openId: string | null;
  sellerName: string | null;
  region: string | null;
  scopes: string[];
  shop: { id: string; name: string; region: string; cipher: string } | null;
  connectedAt: string;
};

export type ConnectionInfo = { connected: boolean; sellerName: string | null; region: string | null; shopName: string | null; scopes: string[]; connectedAt: string | null; accessExpiresAt: number | null; refreshExpiresAt: number | null };

async function tokenCall(cfg: TikTokConfig, kind: "get" | "refresh", param: string, f: Fetch) {
  const u = new URL(`${AUTH_BASE}/api/v2/token/${kind}`);
  u.searchParams.set("app_key", cfg.appKey);
  u.searchParams.set("app_secret", cfg.appSecret);
  if (kind === "get") { u.searchParams.set("auth_code", param); u.searchParams.set("grant_type", "authorized_code"); }
  else { u.searchParams.set("refresh_token", param); u.searchParams.set("grant_type", "refresh_token"); }
  const res = await f(u.toString(), { method: "GET", cache: "no-store", signal: AbortSignal.timeout(45_000) });
  const j = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: Record<string, unknown> } | null;
  if (!j || j.code !== 0 || !j.data) throw new Error(`TikTok refused the token request${j?.message ? `: ${j.message}` : ""}.`);
  return j.data;
}

const nowSec = () => Math.floor(Date.now() / 1000);

async function save(v: Stored) {
  await db.insert(settings).values({ key: KEY, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}
async function load(): Promise<Stored | null> {
  const [r] = await db.select().from(settings).where(eq(settings.key, KEY));
  return (r?.value as Stored | undefined) ?? null;
}

function fromTokenData(cfg: TikTokConfig, d: Record<string, unknown>, prev: Stored | null): Stored {
  const t = nowSec();
  return {
    accessToken: encryptToken(String(d.access_token), cfg.appSecret),
    refreshToken: encryptToken(String(d.refresh_token), cfg.appSecret),
    accessExpiresAt: expiryEpoch(Number(d.access_token_expire_in), t),
    refreshExpiresAt: expiryEpoch(Number(d.refresh_token_expire_in), t),
    openId: (d.open_id as string) ?? prev?.openId ?? null,
    sellerName: (d.seller_name as string) ?? prev?.sellerName ?? null,
    region: (d.seller_base_region as string) ?? prev?.region ?? null,
    scopes: Array.isArray(d.granted_scopes) ? (d.granted_scopes as string[]) : (prev?.scopes ?? []),
    shop: prev?.shop ?? null,
    connectedAt: prev?.connectedAt ?? new Date().toISOString(),
  };
}

/** Called once, from the callback page, with the one-time code TikTok sends back. */
export async function connectWithCode(code: string, cfg: TikTokConfig, f: Fetch = fetch): Promise<void> {
  const data = await tokenCall(cfg, "get", code, f);
  await save(fromTokenData(cfg, data, null));
  // Find the shop this approval covers (its "cipher" is needed by almost every other call).
  const shops = await callApi<{ shops?: { id: string; name: string; region: string; cipher: string }[] }>("/authorization/202309/shops", { cfg, f, shopLevel: false });
  const s = shops.shops?.[0];
  const cur = await load();
  if (cur && s) await save({ ...cur, shop: { id: s.id, name: s.name, region: s.region, cipher: s.cipher } });
}

/** A valid access token, refreshed first when it is about to expire. */
export async function getAccessToken(cfg: TikTokConfig, f: Fetch = fetch): Promise<string> {
  const cur = await load();
  if (!cur) throw new Error("TikTok Shop is not connected yet.");
  if (needsRefresh(cur.accessExpiresAt, nowSec())) {
    if (cur.refreshExpiresAt <= nowSec()) throw new Error("The TikTok connection expired. Press Connect again.");
    const data = await tokenCall(cfg, "refresh", decryptToken(cur.refreshToken, cfg.appSecret), f);
    const next = fromTokenData(cfg, data, cur);
    await save(next);
    return decryptToken(next.accessToken, cfg.appSecret);
  }
  return decryptToken(cur.accessToken, cfg.appSecret);
}

/** One signed call to the Open API. Returns the `data` part; throws with TikTok's own message when it says no. */
export async function callApi<T = unknown>(
  path: string,
  o: { cfg?: TikTokConfig | null; f?: Fetch; method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; shopLevel?: boolean } = {},
): Promise<T> {
  const cfg = o.cfg ?? tiktokConfig();
  if (!cfg) throw new Error("TikTok app key and secret are not set on the server.");
  const f = o.f ?? fetch;
  const token = await getAccessToken(cfg, f);
  const cur = await load();
  const query: Record<string, string> = { app_key: cfg.appKey, timestamp: String(nowSec()), ...(o.query ?? {}) };
  if (o.shopLevel !== false && cur?.shop?.cipher) query.shop_cipher = cur.shop.cipher;
  const body = o.body === undefined ? undefined : JSON.stringify(o.body);
  query.sign = signRequest({ path, query, body, secret: cfg.appSecret });
  const url = `${API_BASE}${path}?${new URLSearchParams({ ...query, access_token: token }).toString()}`;
  const res = await f(url, { method: o.method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", "x-tts-access-token": token }, body, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const j = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null;
  if (!j || j.code !== 0) throw new Error(`TikTok said no (${j?.code ?? res.status}): ${j?.message ?? "no answer"}`);
  return (j.data ?? ({} as T)) as T;
}

export async function connectionInfo(): Promise<ConnectionInfo> {
  const c = await load();
  return { connected: !!c, sellerName: c?.sellerName ?? null, region: c?.region ?? null, shopName: c?.shop?.name ?? null, scopes: c?.scopes ?? [], connectedAt: c?.connectedAt ?? null, accessExpiresAt: c?.accessExpiresAt ?? null, refreshExpiresAt: c?.refreshExpiresAt ?? null };
}

export async function disconnect(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, KEY));
}
