import { cn } from "@/lib/utils";
import { Card } from "./primitives";
import { InfoTip } from "./info-tip";

const TONES = { brand: "bg-brand-soft text-brand", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-critical-soft text-critical", neutral: "bg-surface-2 text-ink-2" } as const;

/** One headline number with an icon, a label and a short note. The same tile is used on every screen. */
export function StatTile({ icon: Icon, label, value, note, tone = "brand", className }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: keyof typeof TONES; className?: string }) {
  // A few words stay visible under the number; anything longer becomes an info icon.
  const short = typeof note === "string" && note.length <= 34;
  return (
    <Card className={cn("flex items-start gap-3 p-3.5", className)}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}><Icon className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[13px] whitespace-nowrap text-ink-3"><span className="truncate">{label}</span>{note && <InfoTip label={`About ${label}`} className={short ? "lg:hidden" : undefined}>{note}</InfoTip>}</p>
        <p className="tnum mt-0.5 text-[21px] leading-7 font-semibold tracking-tight whitespace-nowrap text-ink">{value}</p>
        {note && short && <p className="mt-0.5 hidden text-[12.5px] leading-4 text-ink-3 lg:block">{note}</p>}
      </div>
    </Card>
  );
}
