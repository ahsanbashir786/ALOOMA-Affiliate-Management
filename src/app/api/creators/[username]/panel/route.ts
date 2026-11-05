import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { getCreatorPanel } from "@/lib/creators/workflow/panel";

export const runtime = "nodejs";

/** Data for the creator side panel. Needs the Affiliate Data permission; the panel only offers actions to roles that may record contacts. */
export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user, "affiliates.view")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { username } = await ctx.params;
  const u = decodeURIComponent(username);
  if (!/^[A-Za-z0-9._]{1,80}$/.test(u)) return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  return NextResponse.json(await getCreatorPanel(u, can(user, "affiliates.work")), { headers: { "cache-control": "no-store" } });
}
