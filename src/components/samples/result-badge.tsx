import { Badge } from "@/components/ui/primitives";
import { LINE_STATES, RESULTS, VERDICTS, type LineState, type ResultKey, type SampleVerdict } from "@/lib/samples/states";

export function ResultBadge({ result }: { result: string }) {
  const r = RESULTS[result as ResultKey] ?? { label: result, tone: "neutral" as const };
  return <Badge tone={r.tone}>{r.label}</Badge>;
}

export function StateBadge({ state, manual }: { state: LineState; manual?: boolean }) {
  const s = LINE_STATES[state];
  return (
    <Badge tone={s.tone}>
      {s.label}
      {manual && <span className="opacity-70">· set by team</span>}
    </Badge>
  );
}

export function VerdictBadge({ verdict }: { verdict: SampleVerdict }) {
  const v = VERDICTS[verdict];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
