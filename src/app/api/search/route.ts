import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/can";
import { rows } from "@/lib/sql";
import { NAV, navAllowed } from "@/components/shell/nav";
import { PRODUCTS } from "@/lib/products/catalog";

export const runtime = "nodejs";

const HELP: Record<string, string> = {
  "/execution": "What to do next to sell more, and who does it",
  "/creators": "Every creator, their sales and follow-ups",
  "/products": "How each product is doing and why",
  "/ads": "GMV Max: ads today, boost picks, batch planner, boost log, campaign health, products, creators",
  "/sync": "What is synced from TikTok, and when",
  "/settings": "TikTok connections, people and roles",
};

/** Quick search: pages (all shown, locked ones marked), products and creators the person is allowed to see. Read-only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const q = raw.toLowerCase().replace(/^@/, "");
  const pages = NAV.flatMap((g) => g.items)
    .filter((i) => !q || i.label.toLowerCase().includes(q) || (HELP[i.href] ?? "").toLowerCase().includes(q))
    .map((i) => ({ label: i.label, href: i.href, help: HELP[i.href] ?? "", locked: !navAllowed(user, i) }));
  const products = q && can(user, "products")
    ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5).map((p) => ({ key: p.key, name: p.name }))
    : [];
  const creators = can(user, "creators") && q.length >= 2 && /^[a-z0-9._]+$/.test(q)
    ? await rows<{ username: string }>(sql`select username from creators where username ilike ${"%" + q + "%"} order by (username ilike ${q + "%"}) desc, length(username), username limit 8`)
    : [];
  return NextResponse.json({ pages, products, creators: creators.map((c) => c.username) }, { headers: { "cache-control": "no-store" } });
}
