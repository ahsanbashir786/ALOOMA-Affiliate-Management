import { can, getCurrentUser } from "@/lib/auth";
import { buildReport } from "@/lib/alerts/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The diagnostic report as plain text, for the "Copy Diagnostic Report" button. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!can(user, "settings")) return new Response("Your role cannot open this", { status: 403 });
  return new Response(await buildReport(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
