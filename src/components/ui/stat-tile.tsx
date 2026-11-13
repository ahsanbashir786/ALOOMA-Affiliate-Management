import { cn } from "@/lib/utils";
import { Card } from "./primitives";

const TONES = { brand: "bg-brand-soft text-brand", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-critical-soft text-critical", neutral: "bg-surface-2 text-ink-2" } as const;

/** One headline number with an icon, a label and a short note. The same tile is used on every screen. */
export function StatTile({ icon: Icon, label, value, note, tone = "brand", className }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <Card className={cn("flex items-start gap-3 p-4", className)}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className="tnum mt-0.5 text-[22px] leading-7 font-semibold tracking-tight text-ink">{value}</p>
        {note && <p className="mt-0.5 text-[12.5px] text-ink-3">{note}</p>}
      </div>
    </Card>
  );
}
