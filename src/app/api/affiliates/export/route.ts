import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AFFILIATE_SORTS, loadAffiliates, type AffiliateScope, type AffiliateSort } from "@/lib/affiliates/service";
import { buildAffiliateWorkbook } from "@/lib/affiliates/export";
import { sampleRange } from "@/lib/samples/range";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Excel export of the Affiliates page – same filters, every matching row (not just one page). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { period, range } = await sampleRange(sp);
  const scope: AffiliateScope = sp.scope === "everyone" ? "everyone" : "active";
  const sort: AffiliateSort = (sp.sort as AffiliateSort) in AFFILIATE_SORTS ? (sp.sort as AffiliateSort) : "gmv";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : AFFILIATE_SORTS[sort].dir;

  const { items } = await loadAffiliates({ q: (sp.q ?? "").trim(), scope, noPhone: sp.nophone === "1", range }, sort, dir, period, 50_000, 0);
  const file = await buildAffiliateWorkbook(items);
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="affiliates_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
