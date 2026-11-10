import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { adsAuthorizeUrl, adsConfig, redirectUriFor } from "@/lib/tiktok-ads/client";

export const runtime = "nodejs";

/** Starts the Ads connection: sends the owner to TikTok to approve, with a one-time `state` kept in a cookie. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.redirect(new URL("/login", request.url));
  const cfg = adsConfig();
  if (!cfg) return NextResponse.redirect(new URL("/settings?tab=connection&src=ads&ads=missing", request.url));
  const state = randomBytes(16).toString("hex");
  const redirectUri = redirectUriFor(cfg, request.url, request.headers.get("x-forwarded-host"), request.headers.get("x-forwarded-proto"));
  const res = NextResponse.redirect(adsAuthorizeUrl(cfg, state, redirectUri));
  res.cookies.set("tiktok_ads_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
