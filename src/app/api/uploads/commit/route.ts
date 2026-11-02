import { NextResponse } from "next/server";
import * as z from "zod";
import { getCurrentUser, can } from "@/lib/auth";
import { KINDS } from "@/lib/ingest/kinds";
import { commitUpload } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  token: z.uuid(),
  filename: z.string().min(1).max(300),
  kind: z.enum(KINDS),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user, "manager")) return NextResponse.json({ error: "You don't have permission to upload data." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const result = await commitUpload({ ...parsed.data, userId: user.id });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 422 },
    );
  }
}
