import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, pageWindow, type SizeChoice } from "@/lib/paging";

const box = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] tnum";

/**
 * The one pager for every list: "41–60 of 300", ‹ 1 … 4 5 6 … 17 ›, and how many per page (10 / 20 / 50 / All).
 * Pass `sizeHrefFor` to offer the page-size choice.
 */
export function Pagination({ page, pages, total, pageSize, hrefFor, sizeHrefFor, size }: {
  page: number; pages: number; total: number; pageSize: number; hrefFor: (p: number) => string;
  sizeHrefFor?: (s: SizeChoice) => string; size?: SizeChoice;
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  const cur = size ?? pageSize;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid="pager">
      <p className="tnum text-[13px] text-ink-3">{total ? `${from.toLocaleString("en-MY")}–${to.toLocaleString("en-MY")} of ${total.toLocaleString("en-MY")}` : "No results"}</p>
      <div className="flex flex-wrap items-center gap-1">
        {pages > 1 && (
          <>
            <Link aria-label="Previous page" href={hrefFor(Math.max(1, page - 1))} scroll={false} className={cn(box, "text-ink-2 hover:bg-surface-2", page <= 1 && "pointer-events-none opacity-30")}><ChevronLeft className="size-4" /></Link>
            {pageWindow(page, pages).map((n, i) => n == null
              ? <span key={`d${i}`} className={cn(box, "text-ink-3")}>…</span>
              : <Link key={n} href={hrefFor(n)} scroll={false} aria-current={n === page ? "page" : undefined} data-testid="pager-page"
                  className={cn(box, n === page ? "border border-brand font-semibold text-brand" : "text-ink-2 hover:bg-surface-2")}>{n}</Link>)}
            <Link aria-label="Next page" href={hrefFor(Math.min(pages, page + 1))} scroll={false} className={cn(box, "text-ink-2 hover:bg-surface-2", page >= pages && "pointer-events-none opacity-30")}><ChevronRight className="size-4" /></Link>
          </>
        )}
        {sizeHrefFor && (
          <details className="relative ml-2" data-testid="pager-size">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              {cur === "all" ? "All" : `${cur}/page`}<ChevronDown className="size-3.5" />
            </summary>
            <ul className="absolute right-0 bottom-9 z-20 w-36 rounded-xl border border-line bg-surface p-1 shadow-lg">
              {[...PAGE_SIZES, "all" as const].map((s) => (
                <li key={s}><Link href={sizeHrefFor(s)} scroll={false} className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2", cur === s ? "bg-brand-soft font-medium text-brand" : "text-ink-2")}>{s === "all" ? "All" : `${s}/page`}{cur === s && <Check className="size-3.5" />}</Link></li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
