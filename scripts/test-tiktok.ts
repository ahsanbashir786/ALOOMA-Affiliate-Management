// TikTok connection tests with a pretend TikTok (no network, no real keys). Needs a *_test database.
import { createHmac } from "node:crypto";
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 300) : "")); };

async function main() {
  const { signRequest, encryptToken, decryptToken, expiryEpoch, needsRefresh, keyPaths } = await import("../src/lib/tiktok/sign");
  const { authorizeUrl, tiktokConfig, connectWithCode, callApi, connectionInfo, disconnect, getAccessToken } = await import("../src/lib/tiktok/client");
  const { db } = await import("../src/db");
  const { settings } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  // ── signing ──
  const secret = "s3cret";
  const q = { app_key: "abc", timestamp: "1700000000", shop_cipher: "CIPH", page_size: "1" };
  const expected = createHmac("sha256", secret).update(secret + "/order/202309/orders/search" + "app_keyabc" + "page_size1" + "shop_cipherCIPH" + "timestamp1700000000" + '{"a":1}' + secret).digest("hex");
  check("01 signature follows the documented recipe (path + sorted name/value pairs + body, wrapped in the secret, HMAC-SHA256)", signRequest({ path: "/order/202309/orders/search", query: q, body: '{"a":1}', secret }) === expected);
  check("02 order of parameters, and the sign / access_token parameters themselves, never change the signature", signRequest({ path: "/p", query: { b: "2", a: "1", sign: "x", access_token: "t" }, secret }) === signRequest({ path: "/p", query: { a: "1", b: "2" }, secret }));
  check("03 a different body or secret gives a different signature", signRequest({ path: "/p", query: q, body: "{}", secret }) !== signRequest({ path: "/p", query: q, body: '{"x":1}', secret }) && signRequest({ path: "/p", query: q, secret }) !== signRequest({ path: "/p", query: q, secret: "other" }));

  // ── token encryption and expiry ──
  const enc = encryptToken("ACCESS-123", secret);
  check("04 tokens are encrypted: no plain text inside, different each time, and only the right secret opens them", !enc.includes("ACCESS-123") && enc !== encryptToken("ACCESS-123", secret) && decryptToken(enc, secret) === "ACCESS-123" && (() => { try { decryptToken(enc, "wrong"); return false; } catch { return true; } })());
  check("05 expiry accepts a Unix time or seconds-from-now; refresh is due 6 hours before the end", expiryEpoch(1_900_000_000, 5) === 1_900_000_000 && expiryEpoch(3600, 1000) === 4600 && needsRefresh(1000 + 3600, 1000) && !needsRefresh(1000 + 7 * 3600, 1000));
  check("06 field listing shows names only, never values", (() => { const p = keyPaths({ orders: [{ id: "SECRET-VALUE", line_items: [{ sku: "X" }] }] }); return p.includes("orders[].id") && p.includes("orders[].line_items[].sku") && !p.some((x) => x.includes("SECRET-VALUE")); })());

  // ── configuration ──
  check("07 the app key and secret come from the environment; missing → not configured", tiktokConfig({}) === null && tiktokConfig({ TIKTOK_APP_KEY: "k", TIKTOK_APP_SECRET: "s", TIKTOK_SERVICE_ID: "123" })?.serviceId === "123");
  const cfg = { appKey: "KEY", appSecret: secret, serviceId: "7704214270654596871", authUrl: null };
  const au = authorizeUrl(cfg, "STATE1");
  check("08 the approval link carries the app ID and a one-time state; no app ID → no link", !!au && au.includes("service_id=7704214270654596871") && au.includes("state=STATE1") && authorizeUrl({ ...cfg, serviceId: null }, "x") === null);

  // ── the whole flow against a pretend TikTok ──
  await disconnect();
  const calls: { url: string; init?: RequestInit }[] = [];
  let refreshed = 0;
  const now = Math.floor(Date.now() / 1000);
  const fake = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const u = new URL(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.pathname.endsWith("/token/get")) return json({ code: 0, message: "success", data: { access_token: "AT-1", refresh_token: "RT-1", access_token_expire_in: now + 7 * 86400, refresh_token_expire_in: now + 30 * 86400, open_id: "OID", seller_name: "ALOOMA", seller_base_region: "MY", granted_scopes: ["seller.order.info"] } });
    if (u.pathname.endsWith("/token/refresh")) { refreshed++; return json({ code: 0, data: { access_token: "AT-2", refresh_token: "RT-2", access_token_expire_in: now + 7 * 86400, refresh_token_expire_in: now + 30 * 86400 } }); }
    if (u.pathname === "/authorization/202309/shops") return json({ code: 0, data: { shops: [{ id: "S1", name: "ALOOMA MY", region: "MY", cipher: "CIPHER-1" }] } });
    if (u.pathname === "/order/202309/orders/search") return json({ code: 0, data: { orders: [{ id: "O1" }] } });
    return json({ code: 36009003, message: "scope not granted" });
  };
  await connectWithCode("ONE-TIME-CODE", cfg, fake as never);
  const info = await connectionInfo();
  const [row] = await db.select().from(settings).where(eq(settings.key, "tiktok_connection"));
  const raw = JSON.stringify(row?.value);
  check("09 the code is swapped for tokens, the shop is found, and the connection shows seller, region, shop and allowed scopes", info.connected && info.sellerName === "ALOOMA" && info.region === "MY" && info.shopName === "ALOOMA MY" && info.scopes.includes("seller.order.info"));
  check("10 the database never holds a plain token (only encrypted text)", !raw.includes("AT-1") && !raw.includes("RT-1") && !raw.includes(secret));
  const tokenCall = calls.find((c) => c.url.includes("/token/get"))!;
  check("11 the token request carries the app key, app secret and the one-time code", tokenCall.url.includes("app_key=KEY") && tokenCall.url.includes("app_secret=s3cret") && tokenCall.url.includes("auth_code=ONE-TIME-CODE"));

  const data = await callApi<{ orders: { id: string }[] }>("/order/202309/orders/search", { cfg, f: fake as never, method: "POST", query: { page_size: "1" }, body: {} });
  const oc = calls[calls.length - 1];
  const ou = new URL(oc.url);
  const sent = Object.fromEntries(ou.searchParams);
  check("12 a normal call is signed, carries the shop cipher and the access token, and returns the data", data.orders[0].id === "O1" && sent.shop_cipher === "CIPHER-1" && sent.app_key === "KEY" && !!sent.sign && sent.access_token === "AT-1" && (oc.init?.headers as Record<string, string>)["x-tts-access-token"] === "AT-1");
  const { sign: _s, access_token: _a, ...rest } = sent; void _s; void _a;
  check("13 the signature sent is the right one for that call", sent.sign === signRequest({ path: ou.pathname, query: rest, body: "{}", secret }));
  let said = "";
  try { await callApi("/product/202309/products/search", { cfg, f: fake as never, method: "POST", body: {} }); } catch (e) { said = e instanceof Error ? e.message : ""; }
  check("14 when TikTok says no, the error carries TikTok's own code and message", /36009003/.test(said) && /scope not granted/.test(said), said);

  // ── automatic refresh ──
  const [cur] = await db.select().from(settings).where(eq(settings.key, "tiktok_connection"));
  await db.update(settings).set({ value: { ...(cur.value as object), accessExpiresAt: now + 60 } }).where(eq(settings.key, "tiktok_connection"));
  const t2 = await getAccessToken(cfg, fake as never);
  check("15 an access token about to expire is renewed automatically with the refresh token, and the new one is used", t2 === "AT-2" && refreshed === 1);
  await db.update(settings).set({ value: { ...((await db.select().from(settings).where(eq(settings.key, "tiktok_connection")))[0].value as object), accessExpiresAt: now + 60, refreshExpiresAt: now - 5 } }).where(eq(settings.key, "tiktok_connection"));
  let expired = "";
  try { await getAccessToken(cfg, fake as never); } catch (e) { expired = e instanceof Error ? e.message : ""; }
  check("16 when even the refresh token has expired, it says to press Connect again (no endless retries)", /Connect again/.test(expired) && refreshed === 1);

  await disconnect();
  check("17 disconnecting deletes the tokens", !(await connectionInfo()).connected);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
