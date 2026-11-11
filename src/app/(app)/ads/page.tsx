import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ClipboardList, Megaphone, Package, Rocket, Sun, Target, Users } from "lucide-react";
import { gate } from "@/lib/gate";
import { PageHeader } from "@/components/ui/primitives";
import { TabLinks } from "@/components/ui/tab-links";
import { adsConnectionInfo } from "@/lib/tiktok-ads/client";
import { DEFAULT_RULES, vault, type VaultVideo } from "@/lib/ads/vault";
import { GROUPS, isGroupKey, type GroupKey } from "@/lib/ads/groups";
import { adsToday, boostLog, campaignHealth, creatorScoreboard, productPerformance } from "@/lib/ads/insights";
import { rangeSuffix, resolveRange, type RangeKey } from "@/lib/ads/range";
import { RangePicker } from "@/components/ads/range-picker";
import { todayKL } from "@/lib/time";
import { productName } from "@/lib/products/catalog";
import { PicksBoard, type PickRow } from "@/components/ads/picks-board";
import { Planner } from "@/components/ads/planner";
import { CampaignSection, CreatorSection, LogSection, ProductSection, TodaySection } from "@/components/ads/sections";
import { one, type SP } from "@/lib/url";

export const metadata: Metadata = { title: "GMV Max" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "today", label: "Ads Today", icon: Sun },
  { key: "picks", label: "Boost Picks", icon: Rocket },
  { key: "planner", label: "Batch Planner", icon: CalendarCheck },
  { key: "log", label: "Boost Log", icon: ClipboardList },
  { key: "campaigns", label: "Campaign Health", icon: Megaphone },
  { key: "products", label: "Product Performance", icon: Package },
  { key: "creators", label: "Creator Scoreboard", icon: Users },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PER_GROUP = 150;
/** The date range each tab opens with when none was chosen. */
const DEFAULT_RANGE: Record<Tab, Exclude<RangeKey, "custom">> = { today: "7d", picks: "lifetime", planner: "lifetime", log: "lifetime", campaigns: "7d", products: "30d", creators: "lifetime" };

const numOr = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v: VaultVideo): PickRow => ({
  key: v.key, creativeId: v.creativeId, productId: v.productId, title: v.title, creator: v.creator, postedOn: v.postedOn, productLabel: v.productLabel,
  cost: v.cost, orders: v.orders, revenue: v.revenue, roi: v.roi, rCost: v.rCost, rOrders: v.rOrders, rRevenue: v.rRevenue, rRoi: v.rRoi, cost7: v.cost7, organicGmv: v.organicGmv, lastSpend: v.lastSpend, daysSinceSpend: v.daysSinceSpend,
  status: v.status, statusDay: v.statusDay, statusLabel: v.statusLabel, boostedNow: v.boostedNow, lastLogged: v.lastLogged, group: v.group, why: v.why,
});

export default async function AdsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { denied } = await gate("ads", "GMV Max");
  if (denied) return denied;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === one(sp.tab))?.key ?? "today";
  const conn = await adsConnectionInfo();
  const today = todayKL();
  const spR = { range: one(sp.range), from: one(sp.from), to: one(sp.to) };
  const range = resolveRange(spR, today, DEFAULT_RANGE[tab]);
  const carry = rangeSuffix(spR);
  const header = <PageHeader title="GMV Max" description="How your GMV Max ads are doing, which videos deserve a boost, and what happened after you boosted. Nothing here changes your ads in TikTok, except a single-video boost that the owner creates or stops on purpose (off until switched on in Settings)." />;
  if (!conn.connected)
    return (
      <div className="space-y-6">{header}
        <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="ads-not-connected">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Target className="size-7" /></span>
          <h2 className="mt-5 text-[22px] font-semibold text-ink">Connect TikTok Ads First</h2>
          <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Connect it in Settings, then sync it in Data Sync → Ads Management. Your GMV Max results will appear here.</p>
          <Link href="/settings?tab=connection&src=ads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Connection</Link>
        </div>
      </div>
    );

  let body: React.ReactNode;
  if (tab === "today") {
    const d = await adsToday(range);
    body = d.hasData ? <TodaySection d={d} /> : (
      <div className="grid place-items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center" data-testid="ads-no-data">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Rocket className="size-7" /></span>
        <h2 className="mt-5 text-[22px] font-semibold text-ink">No Ads Results Yet</h2>
        <p className="mt-1 max-w-md text-[14.5px] text-ink-3">Press Sync Now in Data Sync → Ads Management. Your results appear here when the sync has finished.</p>
        <Link href="/sync?tab=ads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white hover:opacity-90">Open Data Sync</Link>
      </div>
    );
  } else if (tab === "picks" || tab === "planner") {
    const roi = one(sp.roi) ? numOr(one(sp.roi), 0, 1, 200) : null;
    const rules = { minRoi: roi, minOrders: Math.round(numOr(one(sp.orders), DEFAULT_RULES.minOrders, 1, 1000)), idleDays: Math.round(numOr(one(sp.idle), DEFAULT_RULES.idleDays, 1, 365)) };
    const v = await vault(rules, range);
    if (tab === "planner") {
      const keys = (one(sp.v) ?? "").split(",").filter(Boolean).slice(0, 50);
      const byKey = new Map(v.videos.map((x) => [x.key, x]));
      body = <Planner videos={keys.map((k) => byKey.get(k)).filter((x): x is VaultVideo => !!x).map(pick)} today={v.today} />;
    } else {
      const product = one(sp.product) || null, q = (one(sp.q) ?? "").trim().toLowerCase();
      const list = v.videos.filter((x) => (!product || x.productKey === product) && (!q || `${x.creator ?? ""} ${x.title ?? ""} ${x.creativeId}`.toLowerCase().includes(q)));
      const counts = Object.fromEntries(GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;
      const byGroup = Object.fromEntries(GROUPS.map((g) => [g.key, [] as PickRow[]])) as Record<GroupKey, PickRow[]>;
      const best: PickRow[] = [];
      for (const x of list) {
        counts[x.group]++;
        if (byGroup[x.group].length < PER_GROUP) byGroup[x.group].push(pick(x));
        // Best picks: proven groups first; a never-started video only when it already sells without ads.
        if (best.length < PER_GROUP && !x.boostedNow && (x.group === "stopped" || x.group === "promise" || x.group === "underfed" || (x.group === "never" && x.organicGmv > 0))) best.push(pick(x));
      }
      const g = one(sp.group);
      const keys = [...new Set(v.videos.map((x) => x.productKey).filter((k): k is string => !!k))];
      body = <PicksBoard key={JSON.stringify([rules, product, q, g])} byGroup={byGroup} best={best} counts={counts} start={isGroupKey(g) ? g : "best"} rules={{ ...v.rules, roiIsAuto: roi == null }} autoRoi={v.autoRoi} accountRoi={v.accountRoi}
        products={keys.map((k) => ({ key: k, label: productName(k) })).sort((a, b) => a.label.localeCompare(b.label))} product={product} q={one(sp.q) ?? ""} rangeLabel={range.label}
        carry={[...new URLSearchParams(carry.slice(1))]} />;
    }
  } else if (tab === "log") body = <LogSection batches={await boostLog(range)} saved={one(sp.saved) === "1"} range={range} />;
  else if (tab === "campaigns") body = <CampaignSection d={await campaignHealth(range)} />;
  else if (tab === "products") body = <ProductSection d={await productPerformance(range)} />;
  else body = <CreatorSection d={await creatorScoreboard(range)} />;

  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabLinks label="GMV Max sections" size="sm" items={TABS.map((t) => ({ href: `/ads?tab=${t.key}${carry}`, label: t.label, icon: t.icon, active: tab === t.key, testId: `ads-tab-${t.key}` }))} />
        {tab !== "planner" && <RangePicker today={today} rangeKey={range.key} from={range.from} to={range.to} label={range.label} />}
      </div>
      {body}
    </div>
  );
}
