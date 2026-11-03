import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled block for dashboards: short title, optional one-line hint, optional "see more" link. */
export function Section({ title, hint, href, linkLabel = "Open", className, children }: { title: string; hint?: string; href?: string; linkLabel?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[13.5px] text-ink-3">{hint}</p>}
        </div>
        {href && <Link href={href} className="inline-flex items-center gap-1 text-[14px] font-medium text-brand hover:underline">{linkLabel} <ArrowRight className="size-4" /></Link>}
      </header>
      {children}
    </section>
  );
}
