import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { adsConfig, adsConnectWithCode } from "@/lib/tiktok-ads/client";

export const runtime = "nodejs";

/** TikTok sends the owner back here with a one-time code. We check the `state`, swap the code for a login, and store it encrypted. */
export async function GET(request: Request) {
  const to = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?tab=connection&src=ads&${q}`, request.url));
    res.cookies.delete("tiktok_ads_state");
    return res;
  };
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.redirect(new URL("/login", request.url));
  const sp = new URL(request.url).searchParams;
  const code = sp.get("auth_code") ?? sp.get("code");
  const state = sp.get("state");
  const cookie = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("tiktok_ads_state="))?.slice("tiktok_ads_state=".length);
  if (!code) return to("ads=denied");
  if (!state || !cookie || state !== cookie) return to("ads=state");
  const cfg = adsConfig();
  if (!cfg) return to("ads=missing");
  try {
    await adsConnectWithCode(code, cfg);
    return to("ads=connected");
  } catch (e) {
    return to(`ads=error&why=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 160) : "unknown")}`);
  }
}
