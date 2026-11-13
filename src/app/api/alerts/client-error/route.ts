import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordError } from "@/lib/alerts/record";

export const runtime = "nodejs";

/** Errors from the browser (a screen that crashed on someone's computer). Only signed-in people can report, and the text is cut short. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const j = (await request.json().catch(() => null)) as { message?: unknown; stack?: unknown; page?: unknown } | null;
  if (!j || typeof j.message !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  await recordError({ source: "browser", route: typeof j.page === "string" ? j.page : null, message: j.message, stack: typeof j.stack === "string" ? j.stack : null });
  return NextResponse.json({ ok: true });
}
