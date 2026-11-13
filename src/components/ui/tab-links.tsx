import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }>; active: boolean; locked?: boolean; testId?: string };

/** Tabs that are real links (so the address shows which tab is open and Back works). Active = light blue, like the menu. */
export function TabLinks({ items, label, size = "md" }: { items: TabItem[]; label: string; size?: "md" | "sm" }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full flex-wrap rounded-lg border border-line-strong bg-surface p-0.5">
      {items.map((t) => (
        <Link key={t.href} href={t.href} data-testid={t.testId} aria-current={t.active ? "page" : undefined} scroll={false}
          className={cn("inline-flex items-center gap-2 rounded-md font-medium", size === "md" ? "h-9 px-4 text-[14px]" : "h-8 px-3 text-[13.5px]", t.active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}>
          {t.icon && <t.icon className="size-4" />}{t.label}{t.locked && <Lock className="size-3.5 text-ink-3" aria-label="Locked for your role" />}
        </Link>
      ))}
    </nav>
  );
}
