import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkStep = "find" | "act" | "track" | "review";

const STEPS: { key: WorkStep; n: number; label: string; href: string; hint: string; owner?: boolean }[] = [
  { key: "find", n: 1, label: "Find", href: "/affiliates", hint: "Who needs what?" },
  { key: "act", n: 2, label: "Act", href: "/today", hint: "Do today's list" },
  { key: "track", n: 3, label: "Track", href: "/progress", hint: "Did it work?", owner: true },
  { key: "review", n: 4, label: "Review", href: "/command", hint: "One-glance summary", owner: true },
];

/**
 * The same header on every Work screen: the four steps of the flow (Find → Act → Track → Review) with the current one marked,
 * then the title, one line saying what this screen is for, and its actions.
 */
export function WorkHeader({ current, title, purpose, isOwner, actions }: { current: WorkStep; title: string; purpose?: string; isOwner: boolean; actions?: React.ReactNode }) {
  const steps = STEPS.filter((s) => isOwner || !s.owner);
  return (
    <header className="mb-6 space-y-4">
      <nav aria-label="Work flow" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1.5 text-[13.5px]">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <Link
                href={s.href}
                aria-current={s.key === current ? "step" : undefined}
                title={s.hint}
                className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium transition-colors", s.key === current ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-[12px]", s.key === current ? "bg-white/25" : "bg-surface-2 text-ink-3")}>{s.n}</span>
                {s.label}
                <span className={cn("hidden font-normal sm:inline", s.key === current ? "text-white/80" : "text-ink-3")}>· {s.hint}</span>
              </Link>
              {i < steps.length - 1 && <ChevronRight className="size-4 text-ink-3" aria-hidden />}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          {purpose && <p className="mt-1 max-w-3xl text-[14px] text-ink-2">{purpose}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}
