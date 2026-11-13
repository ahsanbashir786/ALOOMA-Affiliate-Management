import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { publicUrl } from "@/lib/public-url";
import { shopeeConfig, shopeeConnectWithCode, shopeeRememberShop } from "@/lib/shopee/client";

export const runtime = "nodejs";

/** Shopee sends the owner back here with a one-time code (valid 10 minutes) and the shop ID. The code is swapped for a login that is stored encrypted. */
export async function GET(request: Request) {
  const to = (q: string) => {
    const res = NextResponse.redirect(publicUrl(`/settings?tab=connection&src=shopee&${q}`, request));
    res.cookies.delete("shopee_pending");
    return res;
  };
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.redirect(publicUrl("/login", request));
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code");
  const shopId = sp.get("shop_id") ?? undefined;
  const mainAccountId = sp.get("main_account_id") ?? undefined;
  const started = request.headers.get("cookie")?.split(";").some((c) => c.trim() === "shopee_pending=1");
  if (!code || (!shopId && !mainAccountId)) return to("shopee=denied");
  if (!started) return to("shopee=state");
  const cfg = shopeeConfig();
  if (!cfg) return to("shopee=missing");
  try {
    await shopeeConnectWithCode(code, { shopId, mainAccountId }, cfg);
    try { await shopeeRememberShop(cfg); } catch { /* the name is a nicety: the connection itself is saved */ }
    return to("shopee=connected");
  } catch (e) {
    return to(`shopee=error&why=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 160) : "unknown")}`);
  }
}
