// The rules behind the Products module: how old content is, the status tag, Fragile / Healthy, and the reasons in plain words.
// Pure (no database): numbers in, words out, so every sentence on screen can be traced to a number.

/** Content that sold: video by age, LIVE, or sales with no video (product cards and showcase). */
export type Bucket = "new" | "recent" | "old" | "veryold" | "live" | "other";
export const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: "new", label: "New Videos", hint: "Sold within 14 days of the video being posted" },
  { key: "recent", label: "Recent Videos", hint: "Sold 15 to 30 days after posting" },
  { key: "old", label: "Old Videos", hint: "Sold 31 to 60 days after posting" },
  { key: "veryold", label: "Very Old Videos", hint: "Sold more than 60 days after posting" },
  { key: "live", label: "LIVE", hint: "Sales from LIVE sessions" },
  { key: "other", label: "Product Cards", hint: "Sales with no video or LIVE (product cards, showcase)" },
];
export const NEW_DAYS = 14;
export const RECENT_DAYS = 30;
export const OLD_DAYS = 60;
/** A new video "converts" when it makes at least this many orders of the product within HIT_WINDOW days of posting. */
export const HIT_ORDERS = 3;
export const HIT_WINDOW = 14;
/** Sales change that counts as a real move, and as a collapse. */
export const MOVE_PCT = 15;
export const DYING_PCT = 50;
/** Above this share of video and LIVE sales coming from videos older than 30 days, a product is Fragile. */
export const FRAGILE_SHARE = 0.7;

export const bucketOfAge = (days: number): "new" | "recent" | "old" | "veryold" => (days <= NEW_DAYS ? "new" : days <= RECENT_DAYS ? "recent" : days <= OLD_DAYS ? "old" : "veryold");

export type Tag = "Growing" | "Steady" | "Slipping" | "Dying" | "No Sales";
export type Pair = { now: number; prev: number };
export type Hit = { matured: number; converting: number };
export type Metrics = {
  sales: Pair;
  creators: Pair;
  /** Creators whose first-ever sale of this product is in the period, and what they sold. */
  newCreators: { count: number; sales: number };
  buckets: { now: Record<Bucket, number>; prev: Record<Bucket, number> };
  /** Videos posted that link this product; null when TikTok's video list does not reach that period. */
  videosPosted: { now: number | null; prev: number | null };
  /** Of the videos old enough to judge, how many converted. null = cannot be judged. */
  hit: { now: Hit | null; prev: Hit | null };
  salesPerNewVideo: { now: number | null; prev: number | null };
  /** Returned or cancelled lines, in percent. */
  returnRate: { now: number | null; prev: number | null };
  /** A top creator of the previous period who nearly stopped. */
  quietCreator: { name: string; drop: number } | null;
};
export type Reason = { text: string; tone: "good" | "warn" | "bad" | "info" };
export type Diagnosis = { tag: Tag; change: number; changePct: number | null; fragile: boolean | null; oldShare: number | null; reasons: Reason[] };

const rm = (n: number) => `RM ${Math.round(Math.abs(n)).toLocaleString("en-MY")}`;
const pc = (n: number) => `${Math.round(n)}%`;
const hitPct = (h: Hit | null) => (h && h.matured > 0 ? (h.converting / h.matured) * 100 : null);

/** Share of video and LIVE sales that came from videos older than 30 days (null when there are none). */
export function oldShare(b: Record<Bucket, number>): number | null {
  const den = b.new + b.recent + b.old + b.veryold + b.live;
  return den > 0 ? (b.old + b.veryold) / den : null;
}

export function tagOf(m: Metrics): Tag {
  const { now, prev } = m.sales;
  if (now <= 0 && prev <= 0) return "No Sales";
  if (prev <= 0) return "Growing";
  const pct = ((now - prev) / prev) * 100;
  if (pct <= -DYING_PCT || (m.videosPosted.now === 0 && pct <= -MOVE_PCT)) return "Dying";
  if (pct <= -MOVE_PCT) return "Slipping";
  if (pct >= MOVE_PCT) return "Growing";
  return "Steady";
}

export function diagnose(m: Metrics): Diagnosis {
  const tag = tagOf(m);
  const change = m.sales.now - m.sales.prev;
  const changePct = m.sales.prev > 0 ? (change / m.sales.prev) * 100 : null;
  const share = oldShare(m.buckets.now);
  const fragile = tag === "No Sales" || share == null ? null : share > FRAGILE_SHARE;
  if (tag === "No Sales") return { tag, change, changePct, fragile, oldShare: share, reasons: [{ text: "No sales in this period or the one before.", tone: "info" }] };

  const b = m.buckets;
  const dNew = b.now.new - b.prev.new, dRecent = b.now.recent - b.prev.recent, dOld = b.now.old - b.prev.old, dVery = b.now.veryold - b.prev.veryold, dLive = b.now.live - b.prev.live, dOther = b.now.other - b.prev.other;
  const hn = hitPct(m.hit.now), hp = hitPct(m.hit.prev);
  const up: { w: number; r: Reason }[] = [], down: { w: number; r: Reason }[] = [];
  const base = Math.abs(change) * 0.5;

  if (dNew + dRecent > 0) up.push({ w: dNew + dRecent, r: { tone: "good", text: `New videos are selling: ${m.videosPosted.now != null ? `${m.videosPosted.now} posted` : "more sales from new content"}${hn != null ? `, ${pc(hn)} got ${HIT_ORDERS}+ orders in ${HIT_WINDOW} days` : ""} (${change >= 0 ? "+" : "−"}${rm(dNew + dRecent)}).` } });
  if (dOld > 0) up.push({ w: dOld, r: { tone: "good", text: `Old videos picked up again (+${rm(dOld)}).` } });
  if (dVery > 0) up.push({ w: dVery, r: { tone: "good", text: `Very old videos (over 60 days) are selling again (+${rm(dVery)}).` } });
  if (dLive > 0) up.push({ w: dLive, r: { tone: "good", text: `LIVE sales grew (+${rm(dLive)}).` } });
  if (dOther > 0) up.push({ w: dOther, r: { tone: "good", text: `Product-card sales grew (+${rm(dOther)}).` } });
  if (m.newCreators.count > 0 && m.newCreators.sales >= 0.1 * m.sales.now) up.push({ w: m.newCreators.sales, r: { tone: "good", text: `${m.newCreators.count} new creator${m.newCreators.count === 1 ? "" : "s"} started selling it (${rm(m.newCreators.sales)}).` } });
  const spn = m.salesPerNewVideo;
  if (spn.now != null && spn.prev != null && spn.prev > 0 && spn.now >= spn.prev * 1.2) up.push({ w: base, r: { tone: "good", text: `Each new video sells more: ${rm(spn.now)}, was ${rm(spn.prev)}.` } });

  if (dOld < 0) down.push({ w: -dOld, r: { tone: "bad", text: `Old videos are fading (−${rm(dOld)}${b.prev.old > 0 ? `, −${pc((-dOld / b.prev.old) * 100)}` : ""}).` } });
  if (dVery < 0) down.push({ w: -dVery, r: { tone: "bad", text: `Very old videos (over 60 days) are fading (−${rm(dVery)}${b.prev.veryold > 0 ? `, −${pc((-dVery / b.prev.veryold) * 100)}` : ""}).` } });
  if (m.videosPosted.now === 0) down.push({ w: Math.max(base, 1), r: { tone: "bad", text: "No new video posted in this period." } });
  else if (m.videosPosted.now != null && m.videosPosted.prev != null && m.videosPosted.prev > 0 && m.videosPosted.now < m.videosPosted.prev * 0.7) down.push({ w: base, r: { tone: "bad", text: `Only ${m.videosPosted.now} new video${m.videosPosted.now === 1 ? "" : "s"} posted (was ${m.videosPosted.prev}).` } });
  if (hn != null && hp != null && hn <= hp - 10) down.push({ w: base, r: { tone: "bad", text: `New videos convert worse: ${pc(hn)} got ${HIT_ORDERS}+ orders in ${HIT_WINDOW} days (was ${pc(hp)}).` } });
  if (dNew + dRecent < 0) down.push({ w: -(dNew + dRecent), r: { tone: "bad", text: `Less sales from new and recent videos (−${rm(dNew + dRecent)}).` } });
  if (dLive < 0) down.push({ w: -dLive, r: { tone: "bad", text: `LIVE sales fell (−${rm(dLive)}).` } });
  if (dOther < 0) down.push({ w: -dOther, r: { tone: "warn", text: `Product-card sales fell (−${rm(dOther)}).` } });
  if (m.quietCreator) down.push({ w: m.quietCreator.drop, r: { tone: "bad", text: `@${m.quietCreator.name} nearly stopped selling it (−${rm(m.quietCreator.drop)}).` } });
  const rn = m.returnRate.now, rp = m.returnRate.prev;
  if (rn != null && rp != null && rn >= rp + 5) down.push({ w: base, r: { tone: "warn", text: `More returns and cancellations: ${pc(rn)} (was ${pc(rp)}).` } });

  const top = (l: { w: number; r: Reason }[]) => l.sort((x, y) => y.w - x.w).slice(0, 3).map((x) => x.r);
  let reasons: Reason[];
  if (tag === "Growing") reasons = top(up);
  else if (tag === "Slipping" || tag === "Dying") reasons = top(down);
  else {
    reasons = [];
    if (fragile) reasons.push({ tone: "warn", text: `Fragile: ${pc((share ?? 0) * 100)} of sales come from old videos and little new is selling.` });
    else if (share != null) reasons.push({ tone: "good", text: `Healthy: ${pc((1 - share) * 100)} of sales come from videos under 30 days old and LIVE.` });
    reasons.push(...top(change >= 0 ? up : down).slice(0, 2));
  }
  if (!reasons.length) reasons = [{ tone: "info", text: changePct == null ? "A new product line this period." : `Sales moved ${changePct >= 0 ? "+" : "−"}${pc(Math.abs(changePct))} with no single clear cause.` }];
  return { tag, change, changePct, fragile, oldShare: share, reasons };
}
