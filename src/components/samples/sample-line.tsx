import { Check, ExternalLink, Radio } from "lucide-react";
import type { SampleLine, SampleVideo } from "@/lib/samples/analysis";
import { cn, fmtCompact, fmtDateShort, fmtRM } from "@/lib/utils";
import { LINE_STATES } from "@/lib/samples/states";
import { StateBadge } from "./result-badge";
import { LineDetails } from "./line-details";

const d = (s: string | null) => (s ? fmtDateShort(s) : null);

function Step({ label, date, done, tone = "neutral", sub, last }: { label: string; date: string | null; done: boolean; tone?: "neutral" | "warn" | "bad" | "good"; sub?: string; last?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start">
      <div className="flex w-full items-center">
        <span
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-full border-2",
            done ? "border-good bg-good text-white" : tone === "bad" ? "border-critical bg-critical-soft" : tone === "warn" ? "border-warn bg-warn-soft" : "border-line-strong bg-surface",
          )}
          aria-hidden
        >
          {done && <Check className="size-3" strokeWidth={3} />}
        </span>
        {!last && <span className={cn("mx-1 h-0.5 flex-1 rounded", done ? "bg-good" : "bg-line")} aria-hidden />}
      </div>
      <p className="mt-1 text-[11.5px] font-medium text-ink-2">{label}</p>
      <p className={cn("tnum text-[12.5px]", done ? "text-ink" : tone === "bad" ? "font-medium text-critical" : "text-ink-3")}>{date ?? "–"}</p>
      {sub && <p className={cn("text-[11px]", tone === "bad" ? "text-critical" : "text-ink-3")}>{sub}</p>}
    </div>
  );
}

/** Shipped → Delivered → Posted, with the posting deadline. */
function Timeline({ l }: { l: SampleLine }) {
  const posted = l.state === "posted_no_sales" || l.state === "selling";
  const overdue = l.state === "chase";
  return (
    <div className="flex items-start gap-1" aria-label="Sample timeline">
      <Step label="Approved" date={d(l.approvedAt)} done={!!l.approvedAt} />
      <Step label="Shipped" date={d(l.shippedAt)} done={!!l.shippedAt} />
      <Step label="Delivered" date={d(l.deliveredAt)} done={!!l.deliveredAt} />
      <Step
        label={posted ? "Posted" : "Post by"}
        date={posted ? d(l.postedAt) ?? "yes" : d(l.dueAt)}
        done={posted}
        tone={overdue ? "bad" : l.deliveredAt ? "warn" : "neutral"}
        sub={overdue ? "overdue" : undefined}
        last
      />
    </div>
  );
}

/** Every video posted since delivery: date, views, sales and a link. Shows 3, the rest fold away. */
function VideoLinks({ videos }: { videos: SampleVideo[] }) {
  const item = (v: SampleVideo, i: number) => (
    <li key={v.id}>
      {v.link ? (
        <a
          href={v.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12.5px] hover:bg-surface-2"
        >
          <ExternalLink className="size-3 shrink-0 text-ink-3 group-hover:text-brand" />
          <span className="font-medium text-brand group-hover:underline">Video {i + 1}</span>
          <span className="tnum truncate text-ink-3">
            {v.postedAt ? d(v.postedAt) : ""}
            {v.views > 0 ? ` · ${fmtCompact(v.views)} views` : ""}
            {v.orders > 0 ? ` · ${fmtRM(v.gmv)}` : " · no orders"}
          </span>
        </a>
      ) : (
        <span className="px-1.5 text-[12.5px] text-ink-3">Video {i + 1}{v.postedAt ? ` · ${d(v.postedAt)}` : ""}</span>
      )}
    </li>
  );
  const head = videos.slice(0, 3);
  const rest = videos.slice(3);
  return (
    <div className="-mx-1.5">
      <ul>{head.map((v, i) => item(v, i))}</ul>
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="cursor-pointer list-none px-1.5 py-0.5 text-[12.5px] font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">+ {rest.length} more video{rest.length === 1 ? "" : "s"}</span>
            <span className="hidden group-open/more:inline">Show fewer</span>
          </summary>
          <ul>{rest.map((v, i) => item(v, i + 3))}</ul>
        </details>
      )}
    </div>
  );
}

function Content({ l }: { l: SampleLine }) {
  const posted = l.state === "posted_no_sales" || l.state === "selling";
  const mine = l.videos.filter((v) => v.product);
  const shown = mine.length ? mine : l.videos;
  const count = l.videos.length ? shown.length : l.videoCount;
  return (
    <div className="space-y-1 text-[13px]">
      <StateBadge state={l.state} manual={l.overridden} />
      {l.state === "chase" && <p className="text-ink-2">Nothing posted since delivery{l.dueAt ? ` (was due ${d(l.dueAt)})` : ""}.</p>}
      {l.state === "waiting" && <p className="text-ink-2">Delivered – she has until {d(l.dueAt)} to post.</p>}
      {l.state === "transit" && <p className="text-ink-2">Not delivered yet.</p>}
      {posted && (
        <>
          <p className="text-ink">
            {l.result === "did_live" ? (
              <span className="inline-flex items-center gap-1"><Radio className="size-3.5 text-brand" /> LIVE session</span>
            ) : (
              <>
                {count > 0 ? `${count} video${count === 1 ? "" : "s"} ${mine.length || !l.videos.length ? "with this product" : "(other products)"}` : "Posted"}
                {l.contentViews > 0 && <span className="text-ink-2"> · {fmtCompact(l.contentViews)} views</span>}
              </>
            )}
          </p>
          <p className={cn("tnum", l.contentOrders > 0 ? "font-medium text-good" : "text-ink-2")}>
            {l.contentOrders > 0 ? `${fmtRM(l.contentGmv)} from ${l.contentOrders} order${l.contentOrders === 1 ? "" : "s"}` : "No orders yet"}
          </p>
          {l.result !== "did_live" && shown.length > 0 && <VideoLinks videos={shown} />}
          {l.result !== "did_live" && shown.length === 0 && l.postLink && (
            <a href={l.postLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
              Watch video <ExternalLink className="size-3" />
            </a>
          )}
        </>
      )}
      {l.state === "cancelled" && <p className="text-ink-2">The order was cancelled.</p>}
    </div>
  );
}

export function SampleLineCard({
  l,
  team,
  canEdit,
  today,
}: {
  l: SampleLine;
  team: { id: string; name: string }[];
  canEdit: boolean;
  today: string;
}) {
  const label = l.name ?? l.variation ?? l.sku ?? "Unknown product";
  const isSet = l.parts.length > 0;
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="grid gap-x-6 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(220px,1.1fr)_minmax(320px,1.5fr)_minmax(210px,1fr)]">
        <div className="min-w-0">
          <p className="text-[14px] leading-snug font-medium text-ink">
            {label} <span className="tnum font-normal text-ink-3">×{l.quantity}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">{l.sku}{isSet ? " · bundle" : ""}</p>
          {isSet && (
            <ul className="mt-2 space-y-0.5 border-l-2 border-brand/30 pl-3 text-[12.5px] text-ink-2" aria-label="Bundle contents">
              {l.parts.map((p) => (
                <li key={p.sku}>
                  <span className="tnum font-medium text-ink">{p.qty}×</span> {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Timeline l={l} />
        <Content l={l} />
      </div>
      <LineDetails
        id={l.id}
        canEdit={canEdit}
        team={team}
        ownerId={l.ownerId}
        ownerName={l.ownerName}
        followUpAt={l.followUpAt}
        note={l.note}
        overrideResult={l.overridden ? l.result : null}
        autoLabel={l.autoResult ? l.autoResult.replace("_", " ") : null}
        orderSubstatus={l.orderSubstatus}
        trackingId={l.trackingId}
        today={today}
      />
    </li>
  );
}

export { LINE_STATES };
