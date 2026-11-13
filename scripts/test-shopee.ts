// Shopee connection: signing, sign-in, storing the login encrypted, renewing it, and the connection check.
// Run: DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-shopee.ts
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
import { createHmac } from "node:crypto";
import { sql as pg } from "../src/db";
import { ShopeeApiError, shopeeAuthorizeUrl, shopeeCall, shopeeConfig, shopeeConnectionInfo, shopeeConnectWithCode, shopeeDisconnect, shopeeRememberShop, shopeeSign, type ShopeeConfig } from "../src/lib/shopee/client";
import { runShopeeChecks } from "../src/lib/shopee/checks";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  " + extra)); };

const KEY = "test-partner-key";
const cfg: ShopeeConfig = { partnerId: 1253192, partnerKey: KEY, env: "sandbox", base: "https://shopee.test" };
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

type Log = { path: string; q: URLSearchParams; body: Record<string, unknown> | null };
/** A pretend Shopee that checks every signature the way Shopee does. */
function fake(o: { expireIn?: number; failOnce?: string; orders?: number; shopError?: boolean } = {}) {
  const log: Log[] = [];
  const state = { access: "ACCESS-1", refresh: "REFRESH-1", n: 1, failed: false, refreshes: 0, validRefresh: new Set(["REFRESH-0"]) };
  const f = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    log.push({ path: u.pathname, q: u.searchParams, body });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    const ts = u.searchParams.get("timestamp") ?? "";
    const pid = u.searchParams.get("partner_id");
    if (u.pathname === "/api/v2/auth/token/get" || u.pathname === "/api/v2/auth/access_token/get") {
      if (u.searchParams.get("sign") !== hmac(`${pid}${u.pathname}${ts}`)) return ok({ error: "error_sign", message: "Wrong sign." });
      if (u.pathname === "/api/v2/auth/token/get") {
        if (body?.code !== "CODE-1") return ok({ error: "error_param", message: "Invalid code." });
        state.validRefresh = new Set([state.refresh]);
        return ok({ error: "", message: "", request_id: "r1", access_token: state.access, refresh_token: state.refresh, expire_in: o.expireIn ?? 14400, shop_id_list: [Number(body?.shop_id)] });
      }
      state.refreshes++;
      if (!state.validRefresh.has(String(body?.refresh_token))) return ok({ error: "error_auth", message: "Invalid refresh token." });
      state.n++; state.access = `ACCESS-${state.n}`; state.refresh = `REFRESH-${state.n}`; state.validRefresh = new Set([state.refresh]);
      return ok({ error: "", message: "", request_id: "r2", access_token: state.access, refresh_token: state.refresh, expire_in: 14400 });
    }
    // shop calls
    const at = u.searchParams.get("access_token") ?? "", sid = u.searchParams.get("shop_id") ?? "";
    if (u.searchParams.get("sign") !== hmac(`${pid}${u.pathname}${ts}${at}${sid}`)) return ok({ error: "error_sign", message: "Wrong sign." });
    if (at !== state.access || (o.failOnce === u.pathname && !state.failed && (state.failed = true))) return ok({ error: "error_auth", message: "Invalid access_token." });
    if (u.pathname === "/api/v2/shop/get_shop_info") return o.shopError ? ok({ error: "error_permission", message: "No permission." }) : ok({ error: "", message: "", request_id: "r3", response: { shop_name: "ALOOMA Malaysia", region: "MY", status: "NORMAL", secret_thing: "x" } });
    if (u.pathname === "/api/v2/order/get_order_list") return ok({ error: "", message: "", request_id: "r4", response: { more: false, order_list: Array.from({ length: o.orders ?? 1 }, () => ({ order_sn: "SECRET-ORDER-123" })) } });
    return ok({ error: "error_not_found", message: "no such api" });
  };
  return { f, log, state };
}

(async () => {
  await pg`delete from settings where key = 'shopee_connection'`;

  // ── config
  check("config: nothing set gives no config", shopeeConfig({}) === null && shopeeConfig({ SHOPEE_PARTNER_ID: "abc", SHOPEE_PARTNER_KEY: "k" }) === null && shopeeConfig({ SHOPEE_PARTNER_ID: "1" }) === null);
  const c1 = shopeeConfig({ SHOPEE_PARTNER_ID: "1253192", SHOPEE_PARTNER_KEY: " k " });
  check("config: sandbox is the default, with Shopee's sandbox address", c1?.env === "sandbox" && c1.partnerKey === "k" && /sandbox\.test-stable\.shopee\.sg$/.test(c1.base));
  check("config: SHOPEE_ENV=live uses the live address", shopeeConfig({ SHOPEE_PARTNER_ID: "1", SHOPEE_PARTNER_KEY: "k", SHOPEE_ENV: "live" })?.base === "https://partner.shopeemobile.com");
  check("sign: HMAC-SHA256 hex (known test vector)", createHmac("sha256", "key").update("The quick brown fox jumps over the lazy dog").digest("hex") === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8" && shopeeSign("key", "The quick brown fox jumps over the lazy dog") === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");

  // ── the approval link
  const au = new URL(shopeeAuthorizeUrl(cfg, "https://app.alooma.my/api/shopee/callback", 1700000000));
  check("authorize link: partner, time, signature over partner_id + path + timestamp, and the redirect", au.pathname === "/api/v2/shop/auth_partner" && au.searchParams.get("partner_id") === "1253192" && au.searchParams.get("timestamp") === "1700000000" && au.searchParams.get("sign") === hmac("1253192/api/v2/shop/auth_partner1700000000") && au.searchParams.get("redirect") === "https://app.alooma.my/api/shopee/callback");

  // ── sign in with the code
  const s = fake();
  const r = await shopeeConnectWithCode("CODE-1", { shopId: "777" }, cfg, s.f);
  check("connect: the code is swapped for a login and the shop is known", r.shopIds[0] === "777" && s.log[0].body?.code === "CODE-1" && s.log[0].body?.shop_id === 777 && s.log[0].body?.partner_id === 1253192);
  const bad = await shopeeConnectWithCode("WRONG", { shopId: "777" }, cfg, s.f).catch((e) => e);
  check("connect: a wrong code gives Shopee's own message", bad instanceof ShopeeApiError && /error_param/.test(bad.message) && /Invalid code/.test(bad.message));
  const none = await shopeeConnectWithCode("CODE-1", {}, cfg, s.f).catch((e) => e);
  check("connect: no shop id is refused before calling Shopee", none instanceof ShopeeApiError && s.log.length === 2);
  const info = await shopeeConnectionInfo();
  check("connect: the connection is remembered with its environment and expiry", info.connected && info.env === "sandbox" && info.shopIds[0] === "777" && info.accessExpiresAt != null && Math.abs(info.accessExpiresAt - (Date.now() / 1000 + 14400)) < 60 && info.refreshExpiresAt != null && info.refreshExpiresAt > Date.now() / 1000 + 29 * 86400);
  const raw = JSON.stringify((await pg`select value from settings where key = 'shopee_connection'`)[0].value);
  check("connect: the tokens are stored encrypted, not as text", !raw.includes("ACCESS-1") && !raw.includes("REFRESH-1"));

  // ── a shop call
  const shop = await shopeeCall<{ shop_name: string }>("/api/v2/shop/get_shop_info", { cfg, f: s.f });
  const last = s.log[s.log.length - 1];
  check("call: signed with the access token and shop id, and Shopee's `response` part is returned", shop.shop_name === "ALOOMA Malaysia" && last.q.get("access_token") === "ACCESS-1" && last.q.get("shop_id") === "777" && last.q.get("partner_id") === "1253192");
  const name = await shopeeRememberShop(cfg, s.f);
  check("shop name: remembered for the screen", name.shopName === "ALOOMA Malaysia" && (await shopeeConnectionInfo()).shopName === "ALOOMA Malaysia" && (await shopeeConnectionInfo()).region === "MY");

  // ── renewal
  const stored = async () => (await pg`select value from settings where key = 'shopee_connection'`)[0].value as { accessExpiresAt: number; refreshExpiresAt: number };
  let v = await stored(); v.accessExpiresAt = Math.floor(Date.now() / 1000) + 60;
  await pg`update settings set value = ${JSON.stringify(v)}::jsonb where key = 'shopee_connection'`;
  const before = s.state.refreshes;
  await shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f });
  check("renewal: a login about to end is renewed first, and the new one is used", s.state.refreshes === before + 1 && s.log[s.log.length - 1].q.get("access_token") === "ACCESS-2");
  const rf = s.log.filter((l) => l.path === "/api/v2/auth/access_token/get").pop()!;
  check("renewal: sends the refresh token, partner id and shop id, signed", rf.body?.refresh_token === "REFRESH-1" && rf.body?.shop_id === 777 && rf.body?.partner_id === 1253192);
  await shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f });
  check("renewal: a login with time left is not renewed again", s.state.refreshes === before + 1);
  v = await stored(); v.accessExpiresAt = Math.floor(Date.now() / 1000) + 30;
  await pg`update settings set value = ${JSON.stringify(v)}::jsonb where key = 'shopee_connection'`;
  await shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f });
  check("renewal: the refresh token changes each time (REFRESH-2 was used and replaced)", s.log.filter((l) => l.path === "/api/v2/auth/access_token/get").pop()?.body?.refresh_token === "REFRESH-2" && s.state.refresh === "REFRESH-3");
  v = await stored(); v.accessExpiresAt = Math.floor(Date.now() / 1000) + 30;
  await pg`update settings set value = ${JSON.stringify(v)}::jsonb where key = 'shopee_connection'`;
  const b2 = s.state.refreshes;
  await Promise.all([shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f }), shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f }), shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s.f })]);
  check("renewal: three calls at the same moment share one renewal (a refresh token works only once)", s.state.refreshes === b2 + 1);

  // ── a token Shopee no longer accepts is renewed once, then the call is repeated
  const s2 = fake({ failOnce: "/api/v2/shop/get_shop_info" });
  await shopeeDisconnect();
  await shopeeConnectWithCode("CODE-1", { shopId: "777" }, cfg, s2.f);
  const ok2 = await shopeeCall<{ shop_name: string }>("/api/v2/shop/get_shop_info", { cfg, f: s2.f });
  check("auth retry: when Shopee refuses the token, it is renewed once and the call is repeated", ok2.shop_name === "ALOOMA Malaysia" && s2.state.refreshes === 1);
  const s3 = fake();
  s3.state.access = "SOMETHING-ELSE";
  const denied = await shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s3.f }).catch((e) => e);
  check("auth retry: a login that stays refused is reported, not repeated forever", denied instanceof ShopeeApiError && denied.isAuth);

  // ── the 30 days ran out / another environment / wrong key
  v = await stored(); v.accessExpiresAt = 1; v.refreshExpiresAt = 2;
  await pg`update settings set value = ${JSON.stringify(v)}::jsonb where key = 'shopee_connection'`;
  const old = await shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s2.f }).catch((e) => e);
  check("expired: after 30 days without renewing, it says to connect again", old instanceof ShopeeApiError && /Connect again/.test(old.message));
  await shopeeDisconnect(); await shopeeConnectWithCode("CODE-1", { shopId: "777" }, cfg, fake().f);
  const live = await shopeeCall("/api/v2/shop/get_shop_info", { cfg: { ...cfg, env: "live" }, f: s2.f }).catch((e) => e);
  check("environment: a sandbox login is not used for the live shop", live instanceof ShopeeApiError && /environment/.test(live.message));
  const wrongKey = await shopeeCall("/api/v2/shop/get_shop_info", { cfg: { ...cfg, partnerKey: "another-key" }, f: s2.f }).catch((e) => e);
  check("key changed: the saved login cannot be read and says to connect again", wrongKey instanceof ShopeeApiError && /Connect again/.test(wrongKey.message));
  const nothing = await (async () => { await shopeeDisconnect(); return shopeeCall("/api/v2/shop/get_shop_info", { cfg, f: s2.f }).catch((e) => e); })();
  check("not connected: a call says so", nothing instanceof ShopeeApiError && /not connected/.test(nothing.message));

  // ── the connection check
  const s4 = fake({ orders: 1 });
  await shopeeConnectWithCode("CODE-1", { shopId: "777" }, cfg, s4.f);
  process.env.SHOPEE_PARTNER_ID = "1253192"; process.env.SHOPEE_PARTNER_KEY = KEY; process.env.SHOPEE_API_BASE = cfg.base;
  const res = await runShopeeChecks(s4.f);
  check("check: shop details and one recent order both answer", res.checks.length === 2 && res.checks.every((c) => c.ok) && res.checks[1].count === 1);
  check("check: only field names and the shop name are shown, never an order number", !JSON.stringify(res).includes("SECRET-ORDER-123") && !JSON.stringify(res).includes("secret_thing\":\"x") && res.checks[0].fields?.includes("shop_name") === true);
  const s5 = fake({ shopError: true });
  await shopeeDisconnect(); await shopeeConnectWithCode("CODE-1", { shopId: "777" }, cfg, s5.f);
  const res2 = await runShopeeChecks(s5.f);
  check("check: a refused call shows Shopee's own message and the other check still runs", !res2.checks[0].ok && /error_permission/.test(res2.checks[0].message) && res2.checks[1].ok);

  // ── disconnect
  await shopeeDisconnect();
  check("disconnect: the login is deleted", !(await shopeeConnectionInfo()).connected && (await pg`select 1 from settings where key = 'shopee_connection'`).length === 0);

  await pg.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
