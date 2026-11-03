import { NextResponse } from "next/server";
import { getCurrentUser, mayEditContacts } from "@/lib/auth";
import { queryAffiliates } from "@/lib/affiliates/service";
import { buildMissingContactsWorkbook } from "@/lib/affiliates/export";

export const runtime = "nodejs";

/** Affiliates (with samples or sales) that have no WhatsApp number yet – fill in the column and upload it back in the Data hub. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!mayEditContacts(user)) return NextResponse.json({ error: "You don't have permission to work with WhatsApp numbers." }, { status: 403 });

  const { rows } = await queryAffiliates({ scope: "active", noPhone: true }, "gmv", "desc", 20_000, 0);
  const file = await buildMissingContactsWorkbook(rows.map((r) => ({ username: r.username, samples: r.samples, gmv: r.gmv, orders: r.orders })));
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="affiliates_without_whatsapp_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
