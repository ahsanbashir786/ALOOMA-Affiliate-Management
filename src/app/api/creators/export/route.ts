import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseCreatorParams } from "@/lib/creators/params";
import { getAffiliateDirectory } from "@/lib/workflow/directory";
import { buildDirectoryWorkbook } from "@/lib/affiliates/directory-export";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Excel export of the Creators table – the current filters, every matching row (not just one page). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const opts = parseCreatorParams(Object.fromEntries(new URL(request.url).searchParams));
  const dir = await getAffiliateDirectory({ ...opts, page: 1, size: 1_000_000 });
  const file = await buildDirectoryWorkbook(dir.rows, dir.dataEnd);
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="creators_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
