import Link from "next/link";
import { href } from "@/lib/url";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/samples", label: "Tracker" },
  { href: "/samples/creators", label: "Creator scorecard" },
  { href: "/samples/products", label: "Products" },
  { href: "/samples/report", label: "TikTok sample report" },
];

/** Tabs of the Samples section. `params` carries the selected date range across tabs. */
export function SamplesNav({ current, params }: { current: string; params?: Record<string, string | undefined> }) {
  return (
    <nav aria-label="Samples" className="-mt-2 mb-5 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={href(t.href, params ?? {})}
          aria-current={current === t.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium",
            current === t.href ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
