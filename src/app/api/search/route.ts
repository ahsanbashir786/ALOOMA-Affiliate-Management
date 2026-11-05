import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { can, getCurrentUser } from "@/lib/auth";
import { rows } from "@/lib/sql";
import { NAV } from "@/components/shell/nav";

export const runtime = "nodejs";

/** Quick search: pages the person may open, and creators by username. Read-only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 40);
  const pages = NAV.flatMap((g) => g.items)
    .filter((i) => !i.min || can(user, i.min))
    .filter((i) => !q || i.label.toLowerCase().includes(q))
    .map((i) => ({ label: i.label, href: i.href }));
  const creators = q.length >= 2 && /^[a-z0-9._]+$/.test(q)
    ? await rows<{ username: string }>(sql`select username from creators where username ilike ${"%" + q + "%"} order by (username ilike ${q + "%"}) desc, length(username), username limit 8`)
    : [];
  return NextResponse.json({ pages: pages.slice(0, 6), creators: creators.map((c) => c.username) }, { headers: { "cache-control": "no-store" } });
}
