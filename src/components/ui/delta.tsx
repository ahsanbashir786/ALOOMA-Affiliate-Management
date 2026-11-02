import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Change vs previous period. `invert` flips the colour logic for metrics where
 * lower is better (cancellations, commission rate). Always shows an icon + sign,
 * never colour alone.
 */
export function Delta({
  value,
  invert = false,
  className,
  suffix,
}: {
  value: number | null;
  invert?: boolean;
  className?: string;
  suffix?: string;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className={cn("text-[12px] text-ink-3", className)}>new</span>;
  }
  const flat = Math.abs(value) < 0.005;
  const good = invert ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-medium",
        flat ? "bg-surface-2 text-ink-2" : good ? "bg-good-soft text-good" : "bg-critical-soft text-critical",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {flat ? "0%" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(Math.abs(value) >= 1 ? 0 : 1)}%`}
      {suffix}
    </span>
  );
}
