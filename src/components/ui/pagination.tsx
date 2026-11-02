import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
}) {
  if (pages <= 1) return <p className="px-5 py-3 text-[13px] text-ink-3">{total} result{total === 1 ? "" : "s"}</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = (disabled: boolean) =>
    cn(
      "flex size-8 items-center justify-center rounded-lg border border-line-strong text-ink-2 hover:bg-surface-2",
      disabled && "pointer-events-none opacity-40",
    );
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <p className="tnum text-[13px] text-ink-3">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Link aria-label="Previous page" href={hrefFor(Math.max(1, page - 1))} className={btn(page <= 1)}>
          <ChevronLeft className="size-4" />
        </Link>
        <span className="tnum text-[13px] text-ink-2">
          {page} / {pages}
        </span>
        <Link aria-label="Next page" href={hrefFor(Math.min(pages, page + 1))} className={btn(page >= pages)}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
