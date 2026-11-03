import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, type Role } from "@/lib/auth";
import { cn, fmtDate, fmtDateShort, fmtInt } from "@/lib/utils";

const FRESH_DAYS = 10;

type Row = { kind: string; period_start: string | null; period_end: string | null; uploaded: string | null; age: number | null; rows: number };

/** "Comes from Data:" – which uploaded file feeds each part of the Affiliates Overview, and how fresh it is. */
export async function DataSources({
  role,
  everyone,
  withPhone,
  total,
}: {
  role: Role;
  everyone: boolean;
  withPhone: number;
  total: number;
}) {
  const data = (await db.execute(sql`
    select kind, to_char(min(period_start), 'YYYY-MM-DD') as period_start, to_char(max(period_end), 'YYYY-MM-DD') as period_end,
      to_char(max(created_at), 'YYYY-MM-DD') as uploaded, (current_date - max(period_end))::int as age, coalesce(sum(row_count), 0)::int as rows
    from uploads group by kind`)) as unknown as Row[];
  const by = new Map(data.map((r) => [r.kind, r]));

  const dated = (kind: string) => {
    const r = by.get(kind);
    if (!r) return { state: "missing" as const, text: "not uploaded" };
    const stale = r.age != null && r.age > FRESH_DAYS;
    const range = r.period_start && r.period_end ? `${fmtDateShort(r.period_start)} – ${fmtDateShort(r.period_end)}` : `uploaded ${fmtDate(r.uploaded)}`;
    return { state: stale ? ("stale" as const) : ("ok" as const), text: `${range}${stale ? " · update" : ""}` };
  };

  const phoneFiles = [by.get("contact_list"), by.get("staff_sheet")].filter((x): x is Row => !!x);
  const lastPhoneFile = phoneFiles.map((r) => r.uploaded).filter(Boolean).sort().pop();
  const sku = by.get("sku_catalog");

  const items: { feeds: string; file: string; state: "ok" | "stale" | "missing"; text: string }[] = [
    { feeds: "Sales, SKUs, GMV, Video / LIVE", file: "Affiliate orders", ...dated("affiliate_orders") },
    { feeds: "Samples shipped & delivered, cancellations", file: "All shop orders", ...dated("all_orders") },
    { feeds: "Who posted a video (even with no sales)", file: "Video analysis", ...dated("video_list") },
    {
      feeds: "Bundle contents and product names",
      file: "SKU / bundle lists",
      state: sku ? "ok" : "missing",
      text: sku ? `uploaded ${fmtDate(sku.uploaded)}` : "not uploaded",
    },
    {
      feeds: "WhatsApp numbers",
      file: "WhatsApp file / staff sheet / typed in",
      state: withPhone > 0 ? "ok" : "missing",
      text: `${fmtInt(withPhone)} of ${fmtInt(total)} have a number${lastPhoneFile ? ` · file uploaded ${fmtDate(lastPhoneFile)}` : ""}`,
    },
  ];
  if (everyone) items.push({ feeds: "“Everyone” list and followers", file: "Creator list", ...dated("creator_list") });

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink">Comes from Data:</span>
        {can({ role }, "manager") && <Link href="/data" className="font-medium text-brand hover:underline">Upload files</Link>}
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <li key={i.feeds} className="flex items-start gap-2">
            {i.state === "missing" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-critical" /> : i.state === "stale" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />}
            <div className="min-w-0">
              <p className="text-ink-2">{i.feeds}</p>
              <p className="leading-snug">
                <span className={cn("font-medium", i.state === "missing" ? "text-critical" : "text-ink")}>{i.file}</span>
                <span className="text-ink-3"> · {i.text}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
