import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { creatorLinks, productCard, videoCard } from "@/lib/affiliate/links";

export const runtime = "nodejs";

/** Data for the linked side panels (product, video, and a creator's products and videos). Needs the Affiliate Data permission. */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user, "creators")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { kind, id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const data = kind === "product" ? await productCard(id) : kind === "video" ? await videoCard(id) : kind === "creator" ? await creatorLinks(id) : null;
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
