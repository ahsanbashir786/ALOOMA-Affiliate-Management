import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { db } from "@/db";
import { uploads, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { KINDS, KIND_META, type Kind } from "@/lib/ingest/kinds";
import { Badge, Card, CardHeader, PageHeader, Td, Th } from "@/components/ui/primitives";
import { UploadWorkbench } from "@/components/data/upload-workbench";
import { DeleteUploadButton } from "@/components/data/delete-upload-button";
import { fmtDate, fmtInt } from "@/lib/utils";

export const metadata: Metadata = { title: "Data hub" };

const FRESH_DAYS = 10;

export default async function DataPage() {
  await requireUser("manager");
  const list = await db
    .select({
      id: uploads.id, kind: uploads.kind, filename: uploads.filename, periodStart: uploads.periodStart,
      periodEnd: uploads.periodEnd, rowCount: uploads.rowCount, createdAt: uploads.createdAt, by: users.name,
    })
    .from(uploads)
    .leftJoin(users, eq(users.id, uploads.uploadedBy))
    .orderBy(desc(uploads.createdAt))
    .limit(100);
  const today = new Date().toISOString().slice(0, 10);

  const latest = new Map<Kind, (typeof list)[number]>();
  for (const u of list) {
    const cur = latest.get(u.kind);
    if (!cur || (u.periodEnd ?? "") > (cur.periodEnd ?? "")) latest.set(u.kind, u);
  }
  const daysOld = (d: string | null) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000) : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data hub"
        description="Upload the TikTok Shop exports each week. Order files update in place; report exports are stored as dated snapshots so trends build up over time."
      />

      <UploadWorkbench />

      <Card>
        <CardHeader title="Coverage" description="What's loaded, and where to export each report." />
        <ul className="grid overflow-hidden border-t border-line sm:grid-cols-2 xl:grid-cols-3">
          {KINDS.map((k) => {
            const m = KIND_META[k];
            const u = latest.get(k);
            const age = daysOld(u?.periodEnd ?? null);
            const stale = age != null && age > FRESH_DAYS;
            return (
              <li key={k} className="border-r border-b border-line bg-surface p-4 sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">{m.label}</p>
                  {!u ? (
                    <Badge tone="neutral"><CircleDashed className="size-3.5" /> Missing</Badge>
                  ) : stale ? (
                    <Badge tone="warn"><AlertTriangle className="size-3.5" /> {age}d old</Badge>
                  ) : (
                    <Badge tone="good"><CheckCircle2 className="size-3.5" /> Up to date</Badge>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{m.description}</p>
                <p className="tnum mt-2 text-[13px] text-ink-2">
                  {u ? `${fmtDate(u.periodStart)} – ${fmtDate(u.periodEnd)} · ${fmtInt(u.rowCount)} rows` : "Not uploaded yet"}
                </p>
                <p className="mt-1 text-[12px] text-ink-3">Export: {m.where}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Upload history" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Type</Th>
                <Th>Period</Th>
                <Th align="right">Rows</Th>
                <Th>Uploaded</Th>
                <Th className="w-10"><span className="sr-only">Delete</span></Th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <Td className="max-w-[300px] truncate" title={u.filename}>{u.filename}</Td>
                  <Td><Badge>{KIND_META[u.kind].label}</Badge></Td>
                  <Td className="tnum whitespace-nowrap text-ink-2">{fmtDate(u.periodStart)} – {fmtDate(u.periodEnd)}</Td>
                  <Td align="right">{fmtInt(u.rowCount)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDate(u.createdAt)}{u.by ? ` · ${u.by}` : ""}</Td>
                  <Td><DeleteUploadButton id={u.id} label={u.filename} /></Td>
                </tr>
              ))}
              {!list.length && <tr><Td colSpan={6} className="py-10 text-center text-ink-3">Nothing uploaded yet.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
