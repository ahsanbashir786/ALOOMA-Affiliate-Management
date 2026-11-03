import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, type Role } from "@/lib/auth";
import { cn, fmtDateShort } from "@/lib/utils";

const FRESH_DAYS = 10;

const REQUIRED = [
  { kind: "all_orders", name: "All shop orders", where: "Seller Center → Orders → Export orders", why: "free samples, shipped & delivered dates" },
  { kind: "video_list", name: "Video analysis", where: "Affiliate Center → Video analysis → Video list", why: "who posted a video, with or without sales" },
  { kind: "affiliate_orders", name: "Affiliate orders", where: "Seller Center → Orders → Affiliate orders", why: "sales from each video and LIVE" },
] as const;

const OPTIONAL = [
  { kind: "sku_catalog", name: "SKU / bundle lists", why: "product names and bundle contents" },
  { kind: "staff_sheet", name: "Staff sheet", why: "WhatsApp numbers" },
  { kind: "sample_analysis", name: "Sample analysis", why: "TikTok's check for LIVEs" },
] as const;

/** One-line reminder of which files the sample pages need, and whether they are loaded and fresh. */
export async function FilesBar({ role, title = "Files for samples", showOptional = true }: { role: Role; title?: string; showOptional?: boolean }) {
  const rows = (await db.execute(sql`
    select kind, to_char(min(period_start), 'YYYY-MM-DD') as period_start, to_char(max(period_end), 'YYYY-MM-DD') as period_end,
      (current_date - max(period_end))::int as age
    from uploads group by kind`)) as unknown as { kind: string; period_start: string | null; period_end: string | null; age: number | null }[];
  const have = new Map(rows.map((r) => [r.kind, r]));

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-semibold text-ink">{title}</span>
        {REQUIRED.map((f) => {
          const r = have.get(f.kind);
          const stale = r?.age != null && r.age > FRESH_DAYS;
          return (
            <span key={f.kind} title={`${f.where} – ${f.why}`} className="inline-flex items-center gap-1.5">
              {!r ? <CircleDashed className="size-4 text-critical" /> : stale ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-good" />}
              <span className={cn("font-medium", !r ? "text-critical" : "text-ink")}>{f.name}</span>
              <span className="text-ink-3">{!r ? "missing" : r.period_end ? `${r.period_start ? `${fmtDateShort(r.period_start)} – ` : "to "}${fmtDateShort(r.period_end)}${stale ? " · update" : ""}` : "loaded"}</span>
            </span>
          );
        })}
        <span className="text-ink-3">weekly</span>
        {can({ role }, "manager") && (
          <Link href="/data" className="ml-auto font-medium text-brand hover:underline">Upload files</Link>
        )}
      </div>
      {showOptional && (
      <p className="mt-1.5 text-[12px] text-ink-3">
        Optional:{" "}
        {OPTIONAL.map((f, i) => (
          <span key={f.kind}>
            {i > 0 && " · "}
            <span className={have.has(f.kind) ? "text-ink-2" : ""}>{have.has(f.kind) ? "✓ " : ""}{f.name}</span> ({f.why})
          </span>
        ))}
      </p>
      )}
    </div>
  );
}
