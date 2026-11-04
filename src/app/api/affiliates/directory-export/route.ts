import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseDirectoryParams } from "@/lib/workflow/directory-params";
import { getAffiliateDirectory } from "@/lib/workflow/directory";
import { buildDirectoryWorkbook } from "@/lib/affiliates/directory-export";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Excel export of Affiliate Data Management – the current filters, every matching row (not just one page). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const opts = parseDirectoryParams(sp);
  const dir = await getAffiliateDirectory({ ...opts, page: 1, size: 1_000_000 });
  const file = await buildDirectoryWorkbook(dir.rows, dir.dataEnd);
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="affiliate-data_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
