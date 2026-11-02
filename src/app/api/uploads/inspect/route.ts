import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { discardUpload, inspectUpload, MAX_UPLOAD_BYTES, stashUpload } from "@/lib/ingest/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user, "manager")) return NextResponse.json({ error: "You don't have permission to upload data." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .xlsx files exported from TikTok are supported." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is larger than 60 MB." }, { status: 413 });
  }

  const token = await stashUpload(Buffer.from(await file.arrayBuffer()));
  try {
    return NextResponse.json(await inspectUpload(token, file.name));
  } catch (e) {
    await discardUpload(token);
    return NextResponse.json(
      { error: `Couldn't read this workbook: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 422 },
    );
  }
}
