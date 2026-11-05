import "server-only";
import { NEEDS_ACTION, type CreatorAction, type CreatorStatus } from "@/lib/creators/status";
import { addDaysISO, todayKL } from "@/lib/time";
import { loadCreatorRows } from "@/lib/creators/load";
import { productRank } from "@/lib/products/catalog";
import type { Tier } from "@/lib/creators/score";

/** One sampled product of a creator: its own sales, videos, status and action. */
export type DirLine = {
  pid: string | null;
  name: string;
  skus: string[];
  /** No sample was sent: this line carries the creator's overall status. */
  noSample: boolean;
  /** Synced data only: a sample of this product was sent (false = sells it without a sample). */
  sampled?: boolean;
  /** Synced data only: sample requests of this product still waiting for a decision. */
  samplesOpen?: number;
  /** Synced data only: videos counted only because they produced sales (older than TikTok's video list, or missing from it). Included in `videos`. */
  videosSoldOnly?: number;
  /** Synced data only: every SKU that was sent to her as a sample for this product, with the date(s) it was given. Same SKU twice = two entries in `times`. */
  sampleSkus?: { sku: string; times: { on: string; delivered: boolean }[] }[];
  ordersVideo: number;
  ordersLive: number;
  orders: number;
  gmvVideo: number;
  gmvLive: number;
  gmv: number;
  /** Valid sales in the latest 28 days, and the 28 days before (for the trend arrow). */
  gmv28: number;
  prev28: number;
  videos: number;
  videos28: number;
  lastVideoOn: string | null;
  lastVideoLabel: string | null;
  /** Days from the last video to the latest order we hold. */
  lastVideoDaysAgo: number | null;
  /** Day this line's current action was last recorded from the table (and not undone), else null. */
  doneOn: string | null;
  undatedVideos: number;
  status: CreatorStatus;
  action: CreatorAction;
  reason: string;
};

/** What only the synced data can tell about a creator (Creators module). */
export type CreatorExtra = {
  nickname: string | null;
  followers: number | null;
  /** TikTok's own figure for the creator's sales across all shops. */
  creatorGmv: number | null;
  fulfilmentPct: number | null;
  /** Weekly sales, oldest first, 8 weeks ending at the latest order. */
  weeks: number[];
  gmv28: number;
  prev28: number;
  score: number;
  tier: Tier;
  scoreWhy: string;
  scoreParts: { sales: number; posting: number; reliability: number; consistency: number; reach: number };
  ownerId: string | null;
  ownerName: string | null;
  videosAll: number;
  videos28: number;
  livesAll: number;
  lives28: number;
  /** First day with an order, video or LIVE (null = only a sample request so far). */
  firstOn: string | null;
  lastVideoOn: string | null;
  lastLiveOn: string | null;
  lastSaleOn: string | null;
  requestsOpen: number;
  nextLabel: string | null;
};

export type DirRow = {
  username: string;
  type: "Video" | "LIVE" | "Video + LIVE" | null;
  phone: string | null;
  lines: DirLine[];
  /** Every sampled product, even when filters hide some lines (used for the all-products message). */
  allLines: DirLine[];
  gmvAll: number;
  overdue: boolean;
  paused: boolean;
  lastContactedOn: string | null;
  extra?: CreatorExtra;
};

export type DirSort = "followers" | "score" | "recent" | "orders" | "orders_asc" | "videos_all" | "videos_all_asc" | "gmv" | "gmv_asc" | "linegmv" | "linegmv_asc" | "lately" | "attention" | "video" | "stale" | "name";
export type DirOpts = {
  q?: string;
  samples?: "with" | "none" | "all";
  product?: string;
  status?: CreatorStatus | "";
  /** A single action, or "todo" for every action that needs work. */
  action?: CreatorAction | "todo" | "";
  type?: "video" | "live" | "both" | "";
  wa?: "yes" | "no" | "";
  contact?: "contacted" | "never" | "recent" | "overdue" | "";
  /** Synced data only: a staff member's id, or "none" for creators nobody looks after. */
  owner?: string;
  tier?: Tier | "";
  sort?: DirSort;
  /** Period shown in the table's orders, GMV and videos (status always uses the latest 28 days). */
  range?: { start: string; end: string };
  page?: number;
  size?: number;
};
export type Directory = {
  rows: DirRow[];
  total: number;
  totalLines: number;
  /** Lines per action / status under the other filters (so the chips show what clicking them would give). */
  actionCounts: Record<CreatorAction | "todo", number>;
  statusCounts: Record<CreatorStatus, number>;
  products: { pid: string; name: string; creators: number }[];
  dataEnd: string | null;
  /** Synced data only: headline numbers over ALL creators (ignores the filters). */
  overview?: { creators: number; newCreators28: number; sellers28: number; sellersPrev: number; gmv28: number; prev28: number; todoLines: number; silentLines: number; requestsOpen: number; unowned: number; tiers: Record<Tier, number> };
};

export const STATUS_ORDER: CreatorStatus[] = ["Silent", "Slipping", "Winner", "Rising", "Quiet", "Posted", "Waiting", "New", "Steady", "Paused"];
export const ACTION_ORDER: CreatorAction[] = ["Chase", "Push", "Reward", "Revive", "Coach", "Approach", "Resume", "Wait", "Keep"];
/** Action urgency for "needs attention first". */
const ATTN: Record<CreatorAction, number> = { Chase: 0, Push: 1, Revive: 2, Reward: 3, Coach: 4, Approach: 5, Resume: 6, Wait: 7, Keep: 8 };

/** The affiliate table: the shared rows, filtered, counted, sorted and paged. */
export async function getAffiliateDirectory(opts: DirOpts): Promise<Directory> {
  const { all, ref, lately: gmv28By } = await loadCreatorRows({ range: opts.range });
  const q = (opts.q ?? "").trim().toLowerCase().replace(/^@/, "");
  const sm = opts.samples ?? "all";
  const today = todayKL();
  const weekAgo = addDaysISO(today, -7);
  const creatorOk = (a: DirRow) =>
    (!q || a.username.toLowerCase().includes(q)) &&
    (sm === "all" || (sm === "with") === (a.allLines.some((l) => (l.sampled ?? !l.noSample)))) &&
    (!opts.owner || (opts.owner === "none" ? !a.extra?.ownerId : a.extra?.ownerId === opts.owner)) &&
    (!opts.tier || a.extra?.tier === opts.tier) &&
    (!opts.type || (opts.type === "video" ? a.type === "Video" : opts.type === "live" ? a.type === "LIVE" : a.type === "Video + LIVE")) &&
    (!opts.wa || (opts.wa === "yes") === !!a.phone) &&
    (!opts.contact ||
      (opts.contact === "contacted" ? !!a.lastContactedOn : opts.contact === "never" ? !a.lastContactedOn : opts.contact === "recent" ? !!a.lastContactedOn && a.lastContactedOn >= weekAgo : a.overdue));
  const lineOk = (l: DirLine, skip?: "status" | "action") =>
    (!opts.product || l.pid === opts.product) &&
    (skip === "status" || !opts.status || l.status === opts.status) &&
    (skip === "action" || !opts.action || (opts.action === "todo" ? NEEDS_ACTION.includes(l.action) : l.action === opts.action));

  // Chip counts: lines that pass every OTHER filter.
  const actionCounts = { todo: 0 } as Directory["actionCounts"];
  for (const a of ACTION_ORDER) actionCounts[a] = 0;
  const statusCounts = {} as Directory["statusCounts"];
  for (const s of STATUS_ORDER) statusCounts[s] = 0;
  for (const a of all) {
    if (!creatorOk(a)) continue;
    for (const l of a.lines) {
      if (lineOk(l, "action")) {
        actionCounts[l.action]++;
        if (NEEDS_ACTION.includes(l.action)) actionCounts.todo++;
      }
      if (lineOk(l, "status")) statusCounts[l.status]++;
    }
  }

  // Products to filter by, in the owner's product order (older upload data falls back to most creators first).
  const pm = new Map<string, { pid: string; name: string; creators: number }>();
  for (const a of all) for (const l of a.lines) if (l.pid) {
    const e = pm.get(l.pid) ?? { pid: l.pid, name: l.name, creators: 0 };
    e.creators++;
    pm.set(l.pid, e);
  }
  const products = [...pm.values()].sort((x, y) => productRank(x.pid) - productRank(y.pid) || y.creators - x.creators || x.name.localeCompare(y.name));

  // Keep only the matching lines of the matching creators.
  const filtered: DirRow[] = [];
  for (const a of all) {
    if (!creatorOk(a)) continue;
    const ls = a.lines.filter((l) => lineOk(l));
    if (ls.length) filtered.push({ ...a, lines: ls, allLines: a.lines });
  }
  const lately = (a: DirRow) => a.lines.reduce((m, l) => Math.max(m, l.videos28), 0);
  const lastVid = (a: DirRow) => a.lines.reduce((m, l) => (l.lastVideoOn && l.lastVideoOn > m ? l.lastVideoOn : m), "");
  const topOrders = (a: DirRow) => a.lines.reduce((m, l) => Math.max(m, l.orders), 0);
  const topVideos = (a: DirRow) => a.lines.reduce((m, l) => Math.max(m, l.videos), 0);
  const topLine = (a: DirRow) => a.lines.reduce((m, l) => Math.max(m, l.gmv), 0);
  const best = (a: DirRow) => Math.min(...a.lines.map((l) => ATTN[l.action]));
  filtered.sort((a, b) => {
    switch (opts.sort) {
      case "gmv_asc": return a.gmvAll - b.gmvAll || a.username.localeCompare(b.username);
      case "linegmv": return topLine(b) - topLine(a) || a.username.localeCompare(b.username);
      case "linegmv_asc": return topLine(a) - topLine(b) || a.username.localeCompare(b.username);
      case "orders": return topOrders(b) - topOrders(a) || a.username.localeCompare(b.username);
      case "orders_asc": return topOrders(a) - topOrders(b) || a.username.localeCompare(b.username);
      case "videos_all": return topVideos(b) - topVideos(a) || a.username.localeCompare(b.username);
      case "videos_all_asc": return topVideos(a) - topVideos(b) || a.username.localeCompare(b.username);
      case "name": return a.username.localeCompare(b.username);
      case "followers": return (b.extra?.followers ?? -1) - (a.extra?.followers ?? -1) || a.username.localeCompare(b.username);
      case "score": return (b.extra?.score ?? -1) - (a.extra?.score ?? -1) || a.username.localeCompare(b.username);
      case "recent": return (b.extra?.lastSaleOn ?? "").localeCompare(a.extra?.lastSaleOn ?? "") || a.username.localeCompare(b.username);
      case "video": return lately(b) - lately(a) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      case "stale": {
        // Longest since the last video first; creators with no video at all come first.
        const x = lastVid(a), y = lastVid(b);
        return x.localeCompare(y) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      }
      case "lately": return (gmv28By.get(b.username) ?? 0) - (gmv28By.get(a.username) ?? 0) || a.username.localeCompare(b.username);
      case "attention": return Number(b.overdue) - Number(a.overdue) || best(a) - best(b) || b.gmvAll - a.gmvAll || a.username.localeCompare(b.username);
      default: return (b.gmvAll - a.gmvAll) || a.username.localeCompare(b.username);
    }
  });

  let overview: Directory["overview"];
  {
    overview = { creators: all.length, newCreators28: 0, sellers28: 0, sellersPrev: 0, gmv28: 0, prev28: 0, todoLines: 0, silentLines: 0, requestsOpen: 0, unowned: 0, tiers: { Gold: 0, Silver: 0, Bronze: 0, Starter: 0 } };
    for (const a of all) {
      const e = a.extra;
      if (!e) continue;
      if (e.gmv28 > 0) overview.sellers28++;
      if (e.prev28 > 0) overview.sellersPrev++;
      if (e.firstOn && e.firstOn >= addDaysISO(today, -27)) overview.newCreators28++;
      overview.gmv28 += e.gmv28;
      overview.prev28 += e.prev28;
      overview.requestsOpen += e.requestsOpen;
      if (!e.ownerId) overview.unowned++;
      overview.tiers[e.tier]++;
      for (const l of a.allLines) {
        if (NEEDS_ACTION.includes(l.action)) overview.todoLines++;
        if (l.status === "Silent") overview.silentLines++;
      }
    }
  }

  const size = opts.size ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  return {
    rows: filtered.slice((page - 1) * size, page * size),
    total: filtered.length,
    totalLines: filtered.reduce((n, a) => n + a.lines.length, 0),
    actionCounts,
    statusCounts,
    products,
    dataEnd: ref,
    overview,
  };
}
