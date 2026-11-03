import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { SampleLine, ScoreRow } from "@/lib/samples/analysis";
import { CONTENT_TYPE_LABEL } from "@/lib/samples/analysis";
import { VERDICTS, waMessage } from "@/lib/samples/states";
import { WaSendButton } from "@/components/ui/message-box";
import { Badge, Card } from "@/components/ui/primitives";
import { fmtDateShort, fmtInt, fmtRM, initials } from "@/lib/utils";
import { VerdictBadge } from "./result-badge";
import { PhoneEditor } from "./phone-editor";
import { SampleLineCard } from "./sample-line";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-[84px]">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className={`tnum text-[16px] leading-tight font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-critical" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-[11.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

const dayLabel = (d: string | null) => (d ? fmtDateShort(d) : null);

/** One creator: who they are, how their samples performed, what to do next – and every sample line below. */
export function CreatorGroup({
  r,
  lines,
  team,
  canEdit,
  canPhone,
  today,
}: {
  r: ScoreRow;
  lines: SampleLine[];
  team: { id: string; name: string }[];
  canEdit: boolean;
  canPhone: boolean;
  today: string;
}) {
  const v = VERDICTS[r.verdict];
  const hasMessage = r.verdict !== "ok" && r.verdict !== "wait";
  const msg = {
    username: r.username,
    products: r.products || "our product",
    verdict: r.verdict,
    deliveredLabel: dayLabel(r.oldestUnposted) ?? "recently",
    contentGmv: r.contentGmv,
    videosSince: r.videosSince,
    posted: r.posted,
    lastVideoLabel: dayLabel(r.newestVideo),
  };
  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-line bg-surface-2/50 px-5 py-4">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-strong">{initials(r.username)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/creators/${encodeURIComponent(r.username)}`} className="text-[16px] font-semibold text-ink hover:text-brand hover:underline">
                  {r.username}
                </Link>
                {r.type && <Badge tone={r.type === "live" ? "brand" : r.type === "both" ? "good" : "neutral"}>{CONTENT_TYPE_LABEL[r.type]}</Badge>}
                <VerdictBadge verdict={r.verdict} />
                {r.doNotContact && <Badge tone="critical">Do not contact</Badge>}
              </div>
              <div className="mt-1.5">
                <PhoneEditor username={r.username} phone={r.phone} canEdit={canPhone} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Stat label="Samples" value={fmtInt(r.samples)} sub={r.qty !== r.samples ? `${r.qty} items` : undefined} />
            <Stat label="Posted" value={`${r.posted}/${r.judged}`} sub={r.judged ? `${Math.round((r.posted / r.judged) * 100)}%` : "none due yet"} tone={r.judged && r.posted === 0 ? "bad" : undefined} />
            <Stat label="Videos since" value={fmtInt(r.videosSince)} sub={r.newestVideo ? `newest ${dayLabel(r.newestVideo)}` : undefined} />
            <Stat label="LIVEs" value={fmtInt(r.lives)} sub={r.liveGmv > 0 ? `${fmtRM(r.liveGmv)} sold` : undefined} />
            <Stat label="Sales from samples" value={r.contentGmv ? fmtRM(r.contentGmv) : "–"} sub={r.contentOrders ? `${r.contentOrders} orders` : undefined} tone={r.contentGmv ? "good" : undefined} />
          </div>
        </div>
        {(r.advice || v.todo) && r.verdict !== "ok" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5">
            <Lightbulb className="size-4 shrink-0 text-brand" aria-hidden />
            <p className="min-w-0 flex-1 text-[13.5px] text-ink">
              <span className="font-medium">{v.short}:</span> {r.advice || v.todo}
              {r.value > 0 && <span className="text-good"> · {r.verdict === "refresh" ? `${fmtRM(r.value)} / month at stake` : `est. +${fmtRM(r.value)}`}</span>}
            </p>
            {r.phone && hasMessage && <WaSendButton phone={r.phone} en={waMessage(msg, "en")} ms={waMessage(msg, "ms")} />}
            {!r.phone && canPhone && <span className="text-[12.5px] text-ink-3">Add a WhatsApp number to message them.</span>}
          </div>
        )}
      </div>
      <ul>
        {lines.map((l) => (
          <SampleLineCard key={l.id} l={l} team={team} canEdit={canEdit} today={today} />
        ))}
      </ul>
    </Card>
  );
}
