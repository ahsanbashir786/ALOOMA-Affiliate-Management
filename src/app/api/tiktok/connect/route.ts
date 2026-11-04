import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { authorizeUrl, tiktokConfig } from "@/lib/tiktok/client";

export const runtime = "nodejs";

/** Starts the connection: sends the owner to TikTok to approve, with a one-time `state` kept in a cookie. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "admin")) return NextResponse.redirect(new URL("/login", request.url));
  const cfg = tiktokConfig();
  const state = randomBytes(16).toString("hex");
  const url = cfg ? authorizeUrl(cfg, state) : null;
  if (!url) return NextResponse.redirect(new URL("/settings?tiktok=missing", request.url));
  const res = NextResponse.redirect(url);
  res.cookies.set("tiktok_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
