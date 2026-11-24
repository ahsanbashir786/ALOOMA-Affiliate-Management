// Creator Outreach logic that needs no database: pipeline stages, a creator's sample history, who can get more samples, and reading TikTok's marketplace answer.
import type { DirRow } from "@/lib/creators/workflow/directory";
import { PRODUCTS } from "@/lib/products/catalog";

export const PIPELINE = [
  { key: "suggested", label: "Suggested", help: "Creators worth bringing in or giving another sample: new ones from TikTok and your own good performers." },
  { key: "requested", label: "Sample Requested", help: "A creator asked for a sample and is waiting for your decision." },
  { key: "approved", label: "Approved", help: "You approved it. The sample has not been shipped yet." },
  { key: "shipped", label: "Shipped", help: "On the way to the creator." },
  { key: "delivered", label: "Delivered", help: "The creator has it. Nothing posted yet." },
  { key: "posted", label: "Posted", help: "The creator posted. From here they continue in Creators." },
] as const;
export type PipelineKey = (typeof PIPELINE)[number]["key"];

export type RequestFacts = { status: string | null; hasOrder: boolean; approvable: boolean | null; delivered: boolean; shipped: boolean; hasPost: boolean; orderCancelled: boolean };

/** Where one sample request is in the pipeline, or null when it is finished without a sample (declined, expired, cancelled). */
export function requestStage(f: RequestFacts): Exclude<PipelineKey, "suggested"> | null {
  const s = (f.status ?? "").toUpperCase();
  if (f.orderCancelled || /REJECT|EXPIRE/.test(s) || (/CANCEL/.test(s) && !/UNFULFILL/.test(s))) return null;
  if (!f.hasOrder) {
    if (/APPROV/.test(s) && f.approvable !== true) return "approved";
    return f.approvable === true ? "requested" : null;
  }
  if (f.delivered) return f.hasPost ? "posted" : "delivered";
  return "shipped";
}

export type History = { sales: number; sales28: number; samples: number; notPosted: number; noSale: number; selling: number; verdict: string; tone: "good" | "warn" | "bad" | "neutral" };

/** What the creator did with the samples we already sent: the facts to decide on a new request. */
export function historyOf(r: DirRow | undefined): History {
  if (!r) return { sales: 0, sales28: 0, samples: 0, notPosted: 0, noSale: 0, selling: 0, verdict: "New to you: no sales or samples yet.", tone: "neutral" };
  const sampled = r.allLines.filter((l) => l.sampled);
  const notPosted = sampled.filter((l) => l.status === "Silent").length;
  const noSale = sampled.filter((l) => l.status === "Posted").length;
  const selling = sampled.filter((l) => ["Winner", "Rising", "Steady", "Slipping"].includes(l.status) || l.gmv28 > 0).length;
  const sales = r.gmvAll, sales28 = r.extra?.gmv28 ?? 0;
  let verdict: string, tone: History["tone"];
  if (notPosted > 0) { verdict = `${notPosted} earlier sample${notPosted === 1 ? "" : "s"} not posted yet. Fix that first.`; tone = "bad"; }
  else if (sales28 > 0) { verdict = `Selling now (RM ${Math.round(sales28).toLocaleString("en-MY")} in 28 days).`; tone = "good"; }
  else if (sales > 0) { verdict = `Sold RM ${Math.round(sales).toLocaleString("en-MY")} before, nothing lately.`; tone = "warn"; }
  else if (sampled.length > 0) { verdict = `${sampled.length} sample${sampled.length === 1 ? "" : "s"} sent, no sales yet.`; tone = "warn"; }
  else { verdict = "New to you: no sales or samples yet."; tone = "neutral"; }
  return { sales, sales28, samples: sampled.length, notPosted, noSale, selling, verdict, tone };
}

export type Rec = { pid: string; product: string; pct: number; from: string; typical: number | null; sellers: number };
export type MoreSample = { username: string; sales28: number; sales: number; score: number | null; followers: number | null; sampledProducts: string[]; sellingProducts: string[]; recs: Rec[]; why: string };

const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/**
 * What to offer a creator next, from what other creators actually do: "of the creators who sell A, 62% also sell B", and what B
 * typically sells for one creator in 28 days. Only products the creator neither sells nor was sent count. Pure (from the shared rows).
 */
export function offerNext(rows: DirRow[], minShare = 0.15, minSellers = 5): (r: DirRow, max?: number) => Rec[] {
  const sold = new Map<string, Set<string>>(); // product -> creators who ever sold it
  const recent = new Map<string, number[]>(); // product -> 28-day sales of each creator selling it now
  for (const r of rows) for (const l of r.allLines) {
    if (!l.pid || l.gmv <= 0) continue;
    (sold.get(l.pid) ?? sold.set(l.pid, new Set()).get(l.pid)!).add(r.username);
    if (l.gmv28 > 0) (recent.get(l.pid) ?? recent.set(l.pid, []).get(l.pid)!).push(l.gmv28);
  }
  const names = new Map(PRODUCTS.map((p) => [p.key as string, p.name]));
  const typical = new Map([...recent].map(([k, xs]) => [k, median(xs)]));
  return (r, max = 3) => {
    const mine = new Set(r.allLines.filter((l) => l.pid && (l.gmv > 0)).map((l) => l.pid!));
    const had = new Set(r.allLines.filter((l) => l.pid && (l.gmv > 0 || l.sampled)).map((l) => l.pid!));
    const best = new Map<string, Rec>();
    for (const a of mine) {
      const aSellers = sold.get(a);
      if (!aSellers || aSellers.size < minSellers) continue;
      for (const [b, bSellers] of sold) {
        if (had.has(b) || b === "unmapped") continue;
        let both = 0; for (const u of aSellers) if (bSellers.has(u)) both++;
        const pct = both / aSellers.size;
        if (pct < minShare) continue;
        const cur = best.get(b);
        if (!cur || pct > cur.pct) best.set(b, { pid: b, product: names.get(b) ?? b, pct, from: names.get(a) ?? a, typical: typical.get(b) ?? null, sellers: bSellers.size });
      }
    }
    return [...best.values()].sort((x, y) => y.pct - x.pct || (y.typical ?? 0) - (x.typical ?? 0)).slice(0, max);
  };
}

/**
 * Your own good performers who could take another sample: selling now, nothing outstanding (no sample still unposted or on the way),
 * ranked by what they sell. Each comes with what to offer next and why (see offerNext). All of them, not a top few: the screen pages them.
 */
export function giveMoreSamples(rows: DirRow[], limit = Infinity): MoreSample[] {
  const names = new Map(PRODUCTS.map((p) => [p.key as string, p.name]));
  const next = offerNext(rows);
  const out: MoreSample[] = [];
  for (const r of rows) {
    if (r.paused) continue;
    const e = r.extra;
    if (!e || e.gmv28 <= 0) continue;
    const lines = r.allLines;
    if (lines.some((l) => l.sampled && (l.status === "Silent" || l.status === "Waiting"))) continue; // a sample is still outstanding
    if (!lines.some((l) => l.sampled)) continue; // not yet part of the sample programme: new-creator logic covers them
    const sampled = lines.filter((l) => l.sampled && l.pid).map((l) => l.pid!);
    const selling = lines.filter((l) => l.gmv28 > 0 && l.pid).map((l) => l.pid!);
    const recs = next(r);
    out.push({
      username: r.username, sales28: e.gmv28, sales: r.gmvAll, score: e.score ?? null, followers: e.followers,
      sampledProducts: sampled.map((k) => names.get(k) ?? k), sellingProducts: selling.map((k) => names.get(k) ?? k), recs,
      why: `Sells RM ${Math.round(e.gmv28).toLocaleString("en-MY")} in 28 days.`,
    });
  }
  return out.sort((a, b) => b.sales28 - a.sales28 || b.sales - a.sales).slice(0, limit);
}

// ───────── TikTok's Creator Marketplace answer ─────────
export type MarketCreator = {
  id: string | null; username: string | null; nickname: string | null; followers: number | null; gmv: number | null; units: number | null; category: string | null;
  avgVideoViews: number | null; avgLiveViewers: number | null; region: string | null; avatar: string | null;
  /** What TikTok says about the creator, for the eligibility rules (null = TikTok did not send it). */
  level: number | null; categoryIds: string[]; pps: number | null; officialRecommend: boolean | null; risingStar: boolean | null; fastGrowing: boolean | null; blocked: boolean | null; hasCollaborated: boolean | null; invited90d: boolean | null;
  /** Shown as TikTok shows them: "RM10K+" when the creator does not share exact sales, "1K-10K" items sold, the main follower group. */
  gmvRange?: string | null; unitsRange?: string | null; audience?: string | null; videoGmv?: number | null; liveGmv?: number | null; mcn?: string | null;
};
const first = (o: Record<string, unknown>, keys: string[]) => { for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; return null; };
const str = (v: unknown) => (v == null ? null : typeof v === "object" ? null : String(v));
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object") { const o = v as Record<string, unknown>; return num(first(o, ["amount", "value", "total", "gmv"])); }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => x != null && typeof x !== "object").map(String) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Reads whatever list of creators TikTok sent back, tolerating different field names; the field names seen are returned so a mismatch can be diagnosed. */
export function readMarketCreators(data: unknown): { creators: MarketCreator[]; next: string | null; searchKey: string | null; fieldsSeen: string[] } {
  const d = (data ?? {}) as Record<string, unknown>;
  const list = (Object.values(d).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object") ?? []) as Record<string, unknown>[];
  const creators = list.map((c) => {
    const prof = obj(c.creator_profile);
    const base = (c.creator_profile && typeof c.creator_profile === "object" && (c.creator_profile as Record<string, unknown>).username ? prof : (obj(c.basic_info ?? c.profile).username ? obj(c.basic_info ?? c.profile) : c)) as Record<string, unknown>;
    const sales = ((c.sales_and_gmv ?? c.sales ?? c) as Record<string, unknown>) ?? c;
    const ids = strList(c.category_ids);
    return {
      id: str(first(c, ["creator_open_id", "creator_user_open_id", "user_open_id", "open_id", "user_id", "creator_id", "id"]) ?? first(base, ["creator_open_id", "creator_user_open_id", "user_open_id", "open_id", "user_id", "creator_id", "id"])),
      username: str(first(base, ["username", "user_name", "unique_id", "handle", "tiktok_username"])),
      nickname: str(first(base, ["nickname", "display_name", "name"])),
      followers: num(first(base, ["follower_count", "followers", "fans_count"]) ?? first(c, ["follower_count", "followers"])),
      gmv: num(first(sales, ["gmv", "gmv_30d", "total_gmv", "gmv_amount"])),
      units: num(first(sales, ["units_sold", "units_sold_30d", "items_sold", "sold_count"])),
      category: str(first(base, ["category", "main_category", "category_name"])) ?? (ids.length ? `category ${ids.slice(0, 2).join(", ")}` : null),
      avgVideoViews: num(first(c, ["avg_ec_video_view_count", "avg_video_views"])),
      avgLiveViewers: num(first(c, ["avg_ec_live_uv", "avg_live_viewers"])),
      region: str(first(c, ["selection_region", "region"])),
      avatar: (() => { const a = c.avatar as { url?: unknown } | string | undefined; const u = typeof a === "string" ? a : typeof a?.url === "string" ? a.url : null; return u && /^https:\/\//.test(u) ? u : null; })(),
      level: num(prof.creator_level), categoryIds: ids, pps: num(prof.pps_score), officialRecommend: bool(prof.is_official_recommend), risingStar: bool(prof.is_rising_star), fastGrowing: bool(prof.is_fast_growing),
      blocked: bool(prof.is_creator_blocked), hasCollaborated: bool(prof.has_collaborated), invited90d: bool(prof.has_invited_90d),
      gmvRange: str(obj(c.gmv_range).formatted_range), unitsRange: str(obj(c.units_sold_range).formatted_range),
      audience: (() => {
        const d = obj(c.top_follower_demographics), g = obj(d.major_gender), ages = strList(d.age_ranges);
        const gp = num(g.percentage), gender = str(g.gender);
        const age = ages[0] ? ages[0].replace(/^AGE_RANGE_/, "").replace(/_AND_ABOVE$/, "+").replace("_", "–") : null;
        const parts = [gender && gp != null ? `${gender === "FEMALE" ? "Female" : "Male"} ${Math.round(gp / 100)}%` : null, age].filter(Boolean);
        return parts.length ? parts.join(", ") : null;
      })(),
      videoGmv: num(obj(c.video_gmv).amount), liveGmv: num(obj(c.live_gmv).amount), mcn: str(prof.creator_bind_mcn_name),
    };
  });
  const fieldsSeen = list.length ? [...new Set([...Object.keys(list[0]), ...Object.keys(obj(list[0].creator_profile)).map((k) => `creator_profile.${k}`)])].slice(0, 40) : [];
  return { creators, next: str(first(d, ["next_page_token", "next_token"])), searchKey: str(d.search_key), fieldsSeen };
}

export type CreatorProfile = {
  username: string | null; followers: number | null; level: number | null; categoryIds: string[]; pps: number | null; rating: number | null; postRate: number | null; sampleScore: number | null; fulfilmentScore: number | null;
  officialRecommend: boolean | null; risingStar: boolean | null; blocked: boolean | null; invited90d: boolean | null; hasCollaborated: boolean | null; hasProfile: boolean;
};
/** Reads TikTok's answer for one creator ("Get Marketplace Creator Performance"). */
export function readCreatorProfile(data: unknown): CreatorProfile {
  const c = obj(obj(data).creator);
  const p = obj(c.creator_profile);
  return {
    username: str(c.username), followers: num(c.follower_count), level: num(p.creator_level), categoryIds: strList(c.category_ids), pps: num(c.pps) ?? num(p.pps_score), rating: num(c.rating), postRate: num(c.post_rate),
    sampleScore: num(p.sample_score), fulfilmentScore: num(p.creator_fulfillment_score_90d), officialRecommend: bool(p.is_official_recommend), risingStar: bool(p.is_rising_star), blocked: bool(p.is_creator_blocked),
    invited90d: bool(p.has_invited_90d), hasCollaborated: bool(p.has_collaborated), hasProfile: Object.keys(p).length > 0,
  };
}
