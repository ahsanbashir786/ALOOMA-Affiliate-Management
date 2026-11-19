import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { hasSyncedData } from "@/lib/creators/load";
import { loadCommand, loadStageList } from "@/lib/affiliate/command";
import { STAGES, type StageKey } from "@/lib/affiliate/stages";
import { href, one, type SP } from "@/lib/url";
import { buttonClasses, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { Avatar } from "@/components/creators/avatar";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export const metadata: Metadata = { title: "Creator Lifecycle" };
const KEYS = STAGES.map((s) => s.key) as string[];

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("creators", "Creator Lifecycle");
  if (denied) return denied;
  if (!(await hasSyncedData())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Creator Lifecycle" />
        <Card><EmptyState icon={<Users className="size-5" />} title="No TikTok data yet" description="Run Data Sync first. Creators appear here as soon as the first orders arrive." action={<Link href="/sync" className={buttonClasses({ variant: "primary" })}>Open Data Sync</Link>} /></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const asked = one(sp.stage) ?? "";
  const stage = (KEYS.includes(asked) ? asked : "notposted") as StageKey;
  const [cmd, list] = await Promise.all([loadCommand(), loadStageList(stage)]);
  if (!cmd || !list) return null;
  const def = STAGES.find((s) => s.key === stage)!;
  const counts = new Map(cmd.stages.map((s) => [s.key, s.creators]));
  const stuck = stage === "way" || stage === "notposted" || stage === "nosale" || stage === "quiet";
  const full = stage;

  return (
    <div className="space-y-6">
      <PageHeader title="Creator Lifecycle" description="Every creator is in one stage: the furthest they have got. Pick a stage to see who is there. Creators stuck the longest are shown first, so the oldest samples get attention first." />
      <nav aria-label="Stages" className="flex flex-wrap gap-2" data-testid="stages">
        {STAGES.map((s) => (
          <Link key={s.key} href={href("/affiliate/lifecycle", { stage: s.key })} scroll={false} title={s.help} aria-current={s.key === stage ? "page" : undefined}
            className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", s.key === stage ? "border-brand/40 bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
            {s.label}<span className="tnum text-[12.5px] text-ink-3">{(counts.get(s.key) ?? 0).toLocaleString("en-MY")}</span>
          </Link>
        ))}
      </nav>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{def.label}</h2>
            <p className="text-[13px] text-ink-3">{def.help} Showing {list.rows.length.toLocaleString("en-MY")} of {list.total.toLocaleString("en-MY")}{stuck ? ", stuck longest first" : ", best sellers first"}.</p>
          </div>
          {full && <Link href={href("/creators", { stage: full })} className="text-[13px] font-semibold text-brand hover:underline">Open In Affiliate Data</Link>}
        </div>
        {list.rows.length === 0 ? <p className="px-5 py-10 text-center text-[14px] text-ink-3">Nobody is in this stage right now.</p> : (
          <ul data-testid="stage-rows">
            {list.rows.map((r) => (
              <li key={r.username} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3 last:border-b-0 sm:grid-cols-[minmax(180px,1.4fr)_minmax(120px,1fr)_90px_100px_110px]">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.username} size={36} />
                  <div className="min-w-0">
                    <OpenPanelButton username={r.username} className="truncate text-left text-[14.5px] font-semibold text-brand hover:underline" />
                    <p className="text-[12px] text-ink-3">{r.followers != null ? `${fmtCompact(r.followers)} followers` : "followers not known"}</p>
                  </div>
                </div>
                <p className="hidden truncate text-[13px] text-ink-2 sm:block">{r.lines.join(", ") || "–"}</p>
                <p className="tnum hidden text-[13px] text-ink-2 sm:block">{r.videos28} posts lately</p>
                <p className="tnum hidden text-[13px] font-semibold text-ink sm:block">{r.sales28 > 0 ? fmtRM(r.sales28) : r.gmvAll > 0 ? `${fmtRM(r.gmvAll)} ever` : "–"}</p>
                <p className={cn("tnum text-right text-[13px] font-semibold", (r.days ?? 0) >= 30 ? "text-critical" : (r.days ?? 0) >= 14 ? "text-warn" : "text-ink-2")}>{r.days != null ? `${r.days} days` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
