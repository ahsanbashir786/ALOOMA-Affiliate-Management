import type { Tier } from "@/lib/creators/score";
import { cn } from "@/lib/utils";

const STYLE: Record<Tier, string> = {
  Gold: "bg-[#fbf1d3] text-[#7a5a05] border-[#ecd68a] dark:bg-[#3a2f10] dark:text-[#f1d57a] dark:border-[#5a4a1c]",
  Silver: "bg-[#eceff3] text-[#4a5361] border-[#d3d9e1] dark:bg-[#252a33] dark:text-[#c3cad5] dark:border-[#3a414d]",
  Bronze: "bg-[#f6e4d6] text-[#8a4a1c] border-[#e7c3a4] dark:bg-[#35241a] dark:text-[#e7b48e] dark:border-[#52392a]",
  Starter: "bg-surface-2 text-ink-3 border-line",
};

/** The creator's tier with its score, e.g. "Gold 86". The tooltip explains how the score adds up. */
export function TierBadge({ tier, score, why, className }: { tier: Tier; score: number; why?: string; className?: string }) {
  return (
    <span title={why} className={cn("tnum inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-5 whitespace-nowrap", STYLE[tier], className)}>
      {tier} <span className="opacity-80">{score}</span>
    </span>
  );
}
