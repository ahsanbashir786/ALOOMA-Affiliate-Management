import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { publicUrl } from "@/lib/public-url";
import { shopeeAuthorizeUrl, shopeeConfig } from "@/lib/shopee/client";

export const runtime = "nodejs";

/** Starts the Shopee connection: sends the owner to Shopee to approve. A short-lived cookie proves the flow began in this browser. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings")) return NextResponse.redirect(publicUrl("/login", request));
  const cfg = shopeeConfig();
  if (!cfg) return NextResponse.redirect(publicUrl("/settings?tab=connection&src=shopee&shopee=missing", request));
  const res = NextResponse.redirect(shopeeAuthorizeUrl(cfg, publicUrl("/api/shopee/callback", request).toString()));
  res.cookies.set("shopee_pending", "1", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
