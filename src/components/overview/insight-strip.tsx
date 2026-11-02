import Link from "next/link";
import { AlertTriangle, ArrowRight, Lightbulb, Sparkles, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/analytics/insights";

const TONE = {
  brand: { icon: Sparkles, bar: "bg-brand", chip: "bg-brand-soft text-brand-strong" },
  good: { icon: Lightbulb, bar: "bg-good", chip: "bg-good-soft text-good" },
  warn: { icon: AlertTriangle, bar: "bg-warn", chip: "bg-warn-soft text-warn" },
  serious: { icon: TrendingDown, bar: "bg-serious", chip: "bg-serious-soft text-serious" },
} as const;

export function InsightStrip({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section aria-label="Key findings" className="grid gap-3 lg:grid-cols-2">
      {insights.map((i) => {
        const t = TONE[i.tone];
        const Icon = t.icon;
        return (
          <article
            key={i.id}
            className="relative flex gap-3.5 overflow-hidden rounded-xl border border-line bg-surface p-4 pl-5 shadow-card"
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", t.chip)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14.5px] leading-snug font-semibold text-ink">{i.title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{i.body}</p>
              {i.href && (
                <Link
                  href={i.href}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                >
                  {i.cta ?? "Open"} <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
