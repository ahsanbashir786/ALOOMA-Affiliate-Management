import { Badge } from "@/components/ui/primitives";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";

export function SegmentBadge({ segment, short = false }: { segment: SegmentKey | null; short?: boolean }) {
  if (!segment) return <Badge>Long tail</Badge>;
  const s = SEGMENTS[segment];
  return (
    <Badge tone={s.tone === "neutral" ? "neutral" : s.tone} >
      {short ? s.short : s.label}
    </Badge>
  );
}
