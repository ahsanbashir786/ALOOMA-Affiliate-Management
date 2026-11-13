import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }>; active: boolean; locked?: boolean; testId?: string };

/**
 * Tabs that are real links (so the address shows which tab is open and Back works).
 * Page tabs ("md") are a clean row with a line under the open one; small tabs ("sm") are a light-blue pill group.
 * Both stay on one line and scroll sideways on a narrow screen.
 */
export function TabLinks({ items, label, size = "md" }: { items: TabItem[]; label: string; size?: "md" | "sm" }) {
  if (size === "sm") {
    return (
      <nav aria-label={label} className="-mx-1 max-w-full overflow-x-auto px-1 py-0.5">
        <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {items.map((t) => (
            <Link key={t.href} href={t.href} data-testid={t.testId} aria-current={t.active ? "page" : undefined} scroll={false}
              className={cn("inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-[13.5px] font-medium whitespace-nowrap", t.active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}>
              {t.icon && <t.icon className="size-4" />}{t.label}{t.locked && <Lock className="size-3.5 text-ink-3" aria-label="Locked for your role" />}
            </Link>
          ))}
        </div>
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1">
        {items.map((t) => (
          <Link key={t.href} href={t.href} data-testid={t.testId} aria-current={t.active ? "page" : undefined} scroll={false}
            className={cn("relative inline-flex h-11 shrink-0 items-center gap-2 px-3.5 text-[14.5px] font-medium whitespace-nowrap transition-colors", t.active ? "text-brand-strong" : "text-ink-2 hover:text-ink")}>
            {t.icon && <t.icon className={cn("size-4", t.active ? "text-brand" : "text-ink-3")} />}{t.label}{t.locked && <Lock className="size-3.5 text-ink-3" aria-label="Locked for your role" />}
            <span aria-hidden className={cn("absolute inset-x-2 -bottom-px h-[2.5px] rounded-full transition-colors", t.active ? "bg-brand" : "bg-transparent")} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
