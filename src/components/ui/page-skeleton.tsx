import { cn } from "@/lib/utils";

const bar = "animate-pulse rounded-lg bg-surface-2";

/** Shown at once while a screen loads its numbers, so clicking the menu always feels instant. */
export function PageSkeleton({ cards = 4, rows = 8, className }: { cards?: number; rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-6", className)} role="status" aria-label="Loading">
      <div>
        <div className={cn(bar, "h-8 w-56")} />
        <div className={cn(bar, "mt-2.5 h-4 w-[min(32rem,80%)]")} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => <div key={i} className={cn(bar, "h-24 border border-line")} />)}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0">
            <div className={cn(bar, "size-5 rounded-full")} />
            <div className={cn(bar, "h-4 flex-1")} />
            <div className={cn(bar, "hidden h-4 w-24 sm:block")} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
