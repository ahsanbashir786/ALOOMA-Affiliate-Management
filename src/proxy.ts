import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only (cookie present). Real authorization happens in the
// data layer via requireUser(), which validates the session against the DB.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("ams_session");
  const isAuthPage = pathname === "/login" || pathname === "/setup";
  if (!hasSession && !isAuthPage) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
};
