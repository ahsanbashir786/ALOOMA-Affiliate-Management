import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageCircle } from "lucide-react";
import { can } from "@/lib/auth";
import { gate } from "@/lib/gate";
import { getCreatorProfile, type ProfileSample, type SampleResult } from "@/lib/creators/profile";
import { getStaff } from "@/lib/creators/meta";
import { statsOf } from "@/lib/creators/action-messages";
import { SkuSampled } from "@/components/creators/sku-sampled";
import { STATUS_HELP, type CreatorStatus } from "@/lib/creators/status";
import { fmtDayLabel } from "@/lib/time";
import { Avatar } from "@/components/creators/avatar";
import { TierBadge } from "@/components/creators/tier-badge";
import { OwnerPicker } from "@/components/creators/owner-picker";
import { SalesChart } from "@/components/creators/sales-chart";
import { LineAction } from "@/components/creators/line-action";
import { OpenPanelButton } from "@/components/creators/open-panel-button";
import { Section } from "@/components/viz/section";
import { Badge, Card } from "@/components/ui/primitives";
import { cn, fmtCompact, fmtRM } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/creators/[username]">): Promise<Metadata> {
  return { title: `@${decodeURIComponent((await params).username)}` };
}

const TONE: Record<CreatorStatus, "good" | "brand" | "warn" | "critical" | "neutral"> = { Winner: "good", Rising: "good", Steady: "neutral", Slipping: "warn", Quiet: "warn", Silent: "critical", Waiting: "neutral", Posted: "brand", New: "brand", Paused: "neutral" };
const RESULT: Record<SampleResult, { label: string; tone: "good" | "warn" | "critical" | "neutral" | "brand" }> = {
  posted: { label: "Posted", tone: "good" }, waiting: { label: "Waiting", tone: "brand" }, not_posted: { label: "Not posted", tone: "critical" }, pending: { label: "Request", tone: "warn" }, closed: { label: "Closed", tone: "neutral" },
};
const day = (d: string | null) => (d ? fmtDayLabel(d) : "–");

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className="tnum text-[21px] leading-tight font-semibold text-ink">{value}</p>
      {sub && <p className="truncate text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]"><span className="text-ink-2">{label}</span><span className="tnum font-medium text-ink">{value}/{max}</span></div>
      <div className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round((value / max) * 100)}%` }} /></div>
    </div>
  );
}
const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => <th className={cn("px-3 py-2 text-left text-[12.5px] font-medium text-ink-3", right && "text-right")}>{children}</th>;
const Td = ({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) => <td className={cn("px-3 py-2.5 align-top text-[14px] text-ink", right && "tnum text-right", className)}>{children}</td>;

export default async function CreatorProfilePage({ params }: PageProps<"/creators/[username]">) {
  const { user, denied } = await gate("creators", "Affiliate Data");
  if (denied) return denied;
  const canAct = can(user, "creators");
  const username = decodeURIComponent((await params).username);
  const [p, staff] = await Promise.all([getCreatorProfile(username), getStaff()]);
  if (!p) notFound();
  const { row, totals } = p;
  const e = row.extra!;
  const delta = e.prev28 > 0 ? ((e.gmv28 - e.prev28) / e.prev28) * 100 : null;
  const sampled = row.allLines.filter((l) => l.sampled ?? !l.noSample).map(statsOf);
  const judged = p.samples.filter((s) => s.result === "posted" || s.result === "not_posted");
  const postedN = judged.filter((s) => s.result === "posted").length;
  const days = p.samples.map((s) => s.daysToPost).filter((x): x is number => x != null);
  const chart = p.weeks.map((w) => ({ label: fmtDayLabel(w.week), video: Math.round(w.video), live: Math.round(w.live) }));
  const headline = row.lines.find((l) => l.status !== "Steady") ?? row.lines[0];

  return (
    <div className="space-y-6">
      <Link href="/creators" className="inline-flex items-center gap-1.5 text-[14px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Affiliate Data</Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 gap-4">
            <Avatar name={row.username} size={64} />
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-[24px] leading-tight font-semibold tracking-tight text-ink">@{row.username} <TierBadge tier={e.tier} score={e.score} why={e.scoreWhy} className="text-[13px]" /></h1>
              <p className="mt-0.5 text-[14px] text-ink-3">{[e.nickname, row.type, e.followers != null ? `${fmtCompact(e.followers)} followers` : null].filter(Boolean).join(" · ") || "Type unknown"}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px]">
                <a href={`https://www.tiktok.com/@${encodeURIComponent(row.username)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-ink-2 hover:bg-surface-2"><ExternalLink className="size-3.5" /> TikTok</a>
                {row.phone ? <a href={`https://wa.me/${row.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-ink-2 hover:bg-surface-2"><MessageCircle className="size-3.5" /> {row.phone}</a> : <span className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-ink-3">No WhatsApp number</span>}
                <OwnerPicker username={row.username} ownerId={e.ownerId} staff={staff} canAct={canAct} />
                {p.firstSeenOn && <span className="text-ink-3">First seen {fmtDayLabel(p.firstSeenOn)}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <OpenPanelButton username={row.username} className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[14.5px] font-medium text-white hover:bg-brand-strong" label="Message / Record Action" />
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              {headline && <span title={STATUS_HELP[headline.status]}><Badge tone={TONE[headline.status]}>{headline.status}</Badge></span>}
              {row.overdue && <Badge tone="critical">Promise overdue</Badge>}
              <span>{row.lastContactedOn ? `Contacted ${fmtDayLabel(row.lastContactedOn)}` : "Not contacted yet"}</span>
              {e.nextLabel && <span>· {e.nextLabel}</span>}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="profile-tiles">
        <Tile label="Total sales" value={fmtRM(totals.gmv)} sub={`${totals.orders} orders · ${totals.units} units`} />
        <Tile label="Last 28 days" value={fmtRM(e.gmv28)} sub={delta == null ? "no earlier period" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}% vs before`} />
        <Tile label="Average order" value={totals.aov ? fmtRM(totals.aov) : "–"} sub={totals.returnPct != null ? `${totals.returnPct.toFixed(1)}% returned or cancelled` : undefined} />
        <Tile label="Commission, 90 days" value={fmtRM(totals.commission90)} />
        <Tile label="Videos · LIVE" value={`${e.videosAll} · ${e.livesAll}`} sub={`${e.videos28} · ${e.lives28} in 28 days`} />
        <Tile label="Posts what we send" value={judged.length ? `${postedN} of ${judged.length}` : e.fulfilmentPct != null ? `${Math.round(e.fulfilmentPct)}%` : "–"} sub={days.length ? `posts ${Math.round(days.reduce((a, b) => a + b, 0) / days.length)} days after delivery` : e.fulfilmentPct != null && !judged.length ? "TikTok fulfilment rate" : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Sales by week" hint="Last 26 weeks, split by where the sale came from" className="lg:col-span-2"><SalesChart data={chart} /></Section>
        <Section title="Creator score" hint={`${e.tier} · ${e.score} out of 100`}>
          <div className="space-y-3.5">
            <Bar label="Sales" value={e.scoreParts.sales} max={35} />
            <Bar label="Posting" value={e.scoreParts.posting} max={25} />
            <Bar label="Reliability" value={e.scoreParts.reliability} max={15} />
            <Bar label="Consistency" value={e.scoreParts.consistency} max={15} />
            <Bar label="Reach" value={e.scoreParts.reach} max={10} />
          </div>
          {e.creatorGmv != null && <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-3">TikTok says this creator has sold <b className="text-ink">{fmtRM(e.creatorGmv)}</b> across all shops.</p>}
        </Section>
      </div>

      <Section title="Products" hint="Each product has its own status and action">
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line"><Th>Product</Th><Th>SKU Sampled</Th><Th right>Orders</Th><Th right>Videos</Th><Th right>GMV</Th><Th>Status</Th><Th>Action</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {row.lines.map((l, i) => (
                <tr key={l.pid ?? i}>
                  <Td><p className="font-medium">{l.name}</p></Td>
                  <Td><SkuSampled l={l} /></Td>
                  <Td right>{l.orders || "–"}</Td>
                  <Td right>{l.videos || "–"}{(l.videosSoldOnly ?? 0) > 0 && <span className="block text-[12px] text-ink-3" title="Found only because they produced sales; older videos that sold nothing may be missing">{(l.videosSoldOnly ?? 0) >= l.videos ? "from sales" : `+${l.videosSoldOnly} from sales`}</span>}</Td>
                  <Td right><span className="font-semibold">{l.gmv > 0 ? fmtRM(l.gmv) : "–"}</span>{l.gmv > 0 && <span className="block text-[12px] text-ink-3">V {Math.round(l.gmvVideo).toLocaleString("en-MY")} · L {Math.round(l.gmvLive).toLocaleString("en-MY")}</span>}</Td>
                  <Td><Badge tone={TONE[l.status]}>{l.status}</Badge><p className="mt-1 max-w-[220px] text-[12px] text-ink-3">{l.reason}</p></Td>
                  <Td><LineAction username={row.username} line={l} all={sampled} period="All time" /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Samples" hint={p.samples.length ? `${p.samples.length} request${p.samples.length === 1 ? "" : "s"} · posting window ${14} days after delivery` : undefined}>
        {p.samples.length === 0 ? <p className="text-[14.5px] text-ink-3">No sample requests from this creator yet.</p> : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[760px]" data-testid="samples-table">
              <thead><tr className="border-b border-line"><Th>Product</Th><Th>Requested</Th><Th>Shipped</Th><Th>Delivered</Th><Th>Post by</Th><Th>Stage</Th><Th>Result</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {p.samples.map((s: ProfileSample) => (
                  <tr key={s.id}>
                    <Td><p className="font-medium">{s.product}</p>{s.sku && <p className="text-[12px] text-ink-3">{s.sku}</p>}</Td>
                    <Td>{day(s.requestedOn)}</Td><Td>{day(s.shippedOn)}</Td><Td>{day(s.deliveredOn)}</Td><Td>{day(s.postByOn)}</Td>
                    <Td className="text-ink-2">{s.stage}</Td>
                    <Td><Badge tone={RESULT[s.result].tone}>{RESULT[s.result].label}</Badge>{s.daysToPost != null && <span className="ml-1.5 text-[12px] text-ink-3">{s.daysToPost}d</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Latest videos" hint="Views and sales are lifetime figures">
          {p.videos.length === 0 ? <p className="text-[14.5px] text-ink-3">No videos found yet.</p> : (
            <ul className="divide-y divide-line" data-testid="videos-list">
              {p.videos.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-[14px] font-medium text-ink">{v.title ?? "Untitled video"}</p><p className="text-[12.5px] text-ink-3">{day(v.postedOn)}{v.products.length ? ` · ${v.products.slice(0, 2).join(", ")}` : ""}</p></div>
                  <div className="tnum shrink-0 text-right"><p className="text-[14px] font-semibold text-ink">{v.gmv > 0 ? fmtRM(v.gmv) : "–"}</p><p className="text-[12.5px] text-ink-3">{fmtCompact(v.views)} views · {v.units} sold</p></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Latest LIVE sessions">
          {p.lives.length === 0 ? <p className="text-[14.5px] text-ink-3">No LIVE sessions found yet.</p> : (
            <ul className="divide-y divide-line" data-testid="lives-list">
              {p.lives.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-[14px] font-medium text-ink">{l.title ?? "LIVE"}</p><p className="text-[12.5px] text-ink-3">{day(l.on)}{l.minutes ? ` · ${Math.round(l.minutes)} min` : ""} · {fmtCompact(l.viewers)} viewers{l.newFollowers ? ` · +${l.newFollowers} followers` : ""}</p></div>
                  <div className="tnum shrink-0 text-right"><p className="text-[14px] font-semibold text-ink">{l.gmv > 0 ? fmtRM(l.gmv) : "–"}</p><p className="text-[12.5px] text-ink-3">{l.items} sold</p></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Latest orders" hint="Affiliate orders credited to this creator">
        {p.orders.length === 0 ? <p className="text-[14.5px] text-ink-3">No orders yet.</p> : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[620px]" data-testid="orders-table">
              <thead><tr className="border-b border-line"><Th>Date</Th><Th>Order</Th><Th>Product</Th><Th>From</Th><Th right>Qty</Th><Th right>Amount</Th><Th>Counted?</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {p.orders.map((o) => (
                  <tr key={o.key}>
                    <Td>{day(o.on)}</Td><Td className="text-[13px] text-ink-3">{o.orderId}</Td><Td>{o.product}</Td><Td>{o.type === "Livestream" ? "LIVE" : o.type}</Td><Td right>{o.qty}</Td><Td right>{fmtRM(o.amount, 2)}</Td>
                    <Td><Badge tone={o.state === "Counted" ? "good" : o.state === "Returned" ? "warn" : "critical"}>{o.state}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
