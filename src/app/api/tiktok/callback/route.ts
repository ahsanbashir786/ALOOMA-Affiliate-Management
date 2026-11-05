import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { connectWithCode, tiktokConfig } from "@/lib/tiktok/client";

export const runtime = "nodejs";

/** TikTok sends the owner back here with a one-time code. We check the `state`, swap the code for tokens, and store them encrypted. */
export async function GET(request: Request) {
  const to = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}`, request.url));
    res.cookies.delete("tiktok_state");
    return res;
  };
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.redirect(new URL("/login", request.url));
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const cookie = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("tiktok_state="))?.slice("tiktok_state=".length);
  if (!code) return to("tiktok=denied");
  if (!state || !cookie || state !== cookie) return to("tiktok=state");
  const cfg = tiktokConfig();
  if (!cfg) return to("tiktok=missing");
  try {
    await connectWithCode(code, cfg);
    return to("tiktok=connected");
  } catch (e) {
    return to(`tiktok=error&why=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 160) : "unknown")}`);
  }
}
