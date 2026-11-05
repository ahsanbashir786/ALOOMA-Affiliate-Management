// The Execution Plan rules: which actions to create for a product, from its numbers and from each creator's whole history.
// Pure (no database). Every task carries the numbers that caused it, EVERY creator it is about (with the videos that matter for them), and a checklist.
import type { CreatorRow, ProductAnalysis } from "@/lib/products/analysis";
import { productName } from "@/lib/products/catalog";
import type { History, Life, VideoRef } from "./history";
import { daysBetweenISO } from "@/lib/time";

export type Category = "content" | "creators" | "samples" | "shop";
export const CATEGORIES: { key: Category; label: string; hint: string }[] = [
  { key: "content", label: "Content", hint: "More and better videos and LIVE" },
  { key: "creators", label: "Creators", hint: "Win back, grow and find creators" },
  { key: "samples", label: "Samples", hint: "Get more out of every sample sent" },
  { key: "shop", label: "Shop & Offer", hint: "Listing, price, stock, returns" },
];
export const CATEGORY_LABEL = (c: string) => CATEGORIES.find((x) => x.key === c)?.label ?? c;

export type Priority = 1 | 2 | 3;
export const PRIORITY_LABEL: Record<Priority, string> = { 1: "High", 2: "Medium", 3: "Low" };

/** What staff see about one creator inside an action. */
export type LineData = {
  /** Sold in the period / the one before / ever, in RM. */
  now?: number; before?: number; lifetime?: number;
  orders?: number; firstSale?: string; lastSale?: string; daysSince?: number;
  /** The videos that matter for this action (the old ones that still sell, the best ones, …). */
  videos?: VideoRef[];
  /** For samples: the day it was delivered. For cross-sell: what they sell today. */
  sampleDay?: string; sells?: string;
};
export type CreatorLine = { name: string; note: string; value: number; data: LineData };

export type Draft = {
  fingerprint: string;
  productKey: string;
  category: Category;
  kind: string;
  priority: Priority;
  title: string;
  summary: string;
  steps: string[];
  creators: CreatorLine[];
  /** RM at stake: the sales that were lost, or that this action can plausibly win back or add. */
  impactRm: number;
  dueDays: number;
  evidence: Record<string, number | string>;
};

export const LIST_CAP = 2000;
const rm = (n: number) => `RM ${Math.round(Math.abs(n)).toLocaleString("en-MY")}`;
const pc = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hitPct = (h: { matured: number; converting: number } | null) => (h && h.matured > 0 ? (h.converting / h.matured) * 100 : null);
const dayLabel = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "unknown date");
export const videoText = (v: VideoRef) => `${v.kind === "live" ? "LIVE" : "Video"} from ${dayLabel(v.postDay)}${v.estimated ? " (est.)" : ""}${v.ageDays != null ? `, ${v.ageDays} days old` : ""}, sold ${rm(v.sales)}`;

function priorityOf(impact: number, sales: number, bump = 0): Priority {
  const r = sales > 0 ? impact / sales : 0;
  const base = r >= 0.1 ? 1 : r >= 0.03 ? 2 : 3;
  return Math.max(1, base - bump) as Priority;
}
const DUE: Record<Priority, number> = { 1: 3, 2: 7, 3: 14 };

export type Ctx = { history: History; today: string; periodStart: string; prevStart: string };

export function buildDrafts(p: ProductAnalysis, ctx: Ctx): Draft[] {
  const m = p.metrics, d = p.diagnosis;
  if (d.tag === "No Sales") return [];
  const out: Draft[] = [];
  const sales = m.sales.now;
  const key = p.key;
  const B = m.buckets;
  const H = ctx.history;
  const life: Map<string, Life> = H.life.get(key) ?? new Map();
  const fresh = { now: B.now.new + B.now.recent, prev: B.prev.new + B.prev.recent };
  const old = { now: B.now.old + B.now.veryold, prev: B.prev.old + B.prev.veryold };
  const videoLive = B.now.new + B.now.recent + B.now.old + B.now.veryold + B.now.live;
  const avgPerCreator = m.creators.now > 0 ? sales / m.creators.now : 0;
  const tagBump = d.tag === "Dying" ? 1 : 0;
  const name = productName(key);

  const add = (x: Omit<Draft, "fingerprint" | "productKey" | "dueDays" | "priority"> & { priority?: Priority; bump?: number }) => {
    const priority = x.priority ?? priorityOf(x.impactRm, Math.max(sales, m.sales.prev), x.bump ?? tagBump);
    // One line per creator; never anyone we must not contact.
    const seen = new Set<string>();
    const creators = x.creators.filter((c) => !H.blocked.has(c.name) && (seen.has(c.name) ? false : (seen.add(c.name), true))).slice(0, LIST_CAP);
    out.push({ ...x, creators, fingerprint: `${key}:${x.kind}`, productKey: key, priority, dueDays: DUE[priority] });
  };
  const line = (c: { name: string }, note: string, value: number, data: LineData): CreatorLine => ({ name: c.name, note, value, data });
  const lifeOf = (n: string) => life.get(n);
  const base = (c: CreatorRow): LineData => {
    const l = lifeOf(c.name);
    return { now: c.now, before: c.prev, lifetime: l?.total, orders: l?.orders, firstSale: l?.firstDay, lastSale: l?.lastDay, daysSince: l ? daysBetweenISO(l.lastDay, ctx.today) : undefined };
  };
  const creatorsNow = p.creatorsAll.filter((c) => c.now > 0);

  // ── CONTENT ─────────────────────────────────────────────
  // 1. Few or fewer new videos: every creator who sells it but made no new video of it
  const vp = m.videosPosted;
  const fewVideos = vp.now != null && (vp.now === 0 || (vp.prev != null && vp.prev > 0 && vp.now < vp.prev * 0.8));
  const freshShare = videoLive > 0 ? fresh.now / videoLive : 1;
  if (fewVideos || (freshShare < 0.3 && sales >= 1000)) {
    const targets = p.creatorsAll.filter((c) => c.mix.new === 0 && (c.now > 0 || c.prev > 0)).map((c) =>
      line(c, `${c.now > 0 ? `${rm(c.now)} this period` : `${rm(c.prev)} last period`}, no new video of it`, c.now + c.prev, { ...base(c), videos: lifeOf(c.name)?.recent.length ? lifeOf(c.name)!.recent.slice(0, 1) : lifeOf(c.name)?.tops.slice(0, 1) }));
    const lost = Math.max(fresh.prev - fresh.now, 0);
    add({
      category: "content", kind: "new_videos",
      title: targets.length ? `Ask ${plural(targets.length, "creator")} for new videos` : "Get new videos of this product posted",
      summary: vp.now != null
        ? `${vp.now === 0 ? "No new video" : `Only ${plural(vp.now, "new video")}`} posted${vp.prev ? ` (was ${vp.prev})` : ""}. Sales from new and recent videos ${lost > 0 ? `fell by ${rm(lost)}` : `are ${pc(freshShare * 100)} of video and LIVE sales`}. Without a steady flow of new videos, sales fade. Every creator who sold it lately is listed, biggest sellers first.`
        : `Only ${pc(freshShare * 100)} of video and LIVE sales come from new or recent videos.`,
      steps: [
        "Start with the biggest sellers at the top of the list; message each one and ask for 1 new video this week.",
        "Mention their last video (shown under their name) and ask for a fresh hook, not the same script.",
        "Offer a new sample or a small bonus to creators who post within 7 days.",
        "Tick each creator after you contact them; check again in 7 days.",
      ],
      creators: targets.sort((x, y) => y.value - x.value), impactRm: lost > 0 ? lost : sales * 0.1,
      evidence: { newVideos: vp.now ?? -1, newVideosBefore: vp.prev ?? -1, freshSharePct: Math.round(freshShare * 100) },
    });
  }

  // 2. New videos do not convert: show the best ones to learn from
  const hn = hitPct(m.hit.now), hp = hitPct(m.hit.prev);
  if (m.hit.now && m.hit.now.matured >= 8 && hn != null && (hn < 8 || (hp != null && hn <= hp - 10))) {
    const best = [...H.life.get(key) ?? []].map(([, l]) => l).filter((l) => l.tops[0]?.kind === "video").sort((x, y) => (y.tops[0]?.sales ?? 0) - (x.tops[0]?.sales ?? 0)).slice(0, 10);
    add({
      category: "content", kind: "fix_conversion",
      title: "New videos get views but few orders, brief creators on what works",
      summary: `${m.hit.now.converting} of ${m.hit.now.matured} new videos got 3+ orders in 14 days (${pc(hn)}${hp != null ? `, was ${pc(hp)}` : ""}). Views come, orders do not, so the way the product is shown or the offer is the problem. Videos already posted cannot be edited, so this is about the NEXT videos: show creators what the best videos do. The best videos ever are listed below to learn from.`,
      steps: [
        "Open the 3 best videos in the list and watch them.",
        "Write down what they share: the first 3 seconds (the hook), a proof shot, the price shown, a call to buy.",
        "Send that as a short brief to every creator who will post this product next. Existing videos stay as they are.",
        "Check the offer: price, voucher, free gift, delivery time. Test one change for 7 days.",
      ],
      creators: best.map((l) => line({ name: l.creator }, videoText(l.tops[0]), l.tops[0].sales, { lifetime: l.total, lastSale: l.lastDay, videos: l.tops.slice(0, 2) })),
      impactRm: Math.max(sales * 0.08, ((m.salesPerNewVideo.prev ?? 0) - (m.salesPerNewVideo.now ?? 0)) * (vp.now ?? 0)),
      evidence: { hitPct: Math.round(hn), hitPctBefore: hp == null ? -1 : Math.round(hp), judged: m.hit.now.matured },
    });
  }

  // 3. Old and very old videos carry the product: list every creator with the old videos that still sell
  const oldShare = d.oldShare ?? 0;
  if (oldShare >= 0.6 && sales >= 1000) {
    const targets = creatorsNow.filter((c) => (c.mix.old + c.mix.veryold) / Math.max(c.now, 1) >= 0.5).map((c) => {
      const l = lifeOf(c.name);
      const vids = (l?.recent.filter((v) => (v.ageDays ?? 0) > 30).length ? l!.recent.filter((v) => (v.ageDays ?? 0) > 30) : l?.tops ?? []).slice(0, 3);
      const top = vids[0];
      return line(c, top ? videoText(top) : `${pc(((c.mix.old + c.mix.veryold) / Math.max(c.now, 1)) * 100)} of their sales are from old videos`, c.now, { ...base(c), videos: vids });
    }).sort((x, y) => y.value - x.value);
    const fading = Math.max(old.prev - old.now, 0);
    add({
      category: "content", kind: "refresh_old",
      title: `Refresh the old videos of ${plural(targets.length, "creator")} before they fade`,
      summary: `${pc(oldShare * 100)} of video and LIVE sales come from videos older than 30 days${fading > 0 ? `, and they lost ${rm(fading)}` : ""}. ${d.fragile ? "This product is Fragile: when those videos stop, sales drop." : "A lot depends on videos that will not last."} Each creator below shows the exact old video that still sells, with its link, so you can ask them to remake that one.`,
      steps: [
        "Open the creator's old video (link under their name) so you know exactly what you are asking about.",
        "Message them: that video still sells, ask for a new version with a new hook, angle or proof.",
        "Ask for a LIVE session that features the product, to reach buyers again.",
        "Tick each creator once contacted. Aim for 3 new videos within 10 days.",
      ],
      creators: targets, impactRm: fading > 0 ? fading : sales * 0.1,
      evidence: { oldSharePct: Math.round(oldShare * 100), oldSalesFell: Math.round(fading) }, bump: d.fragile ? 1 : 0,
    });
  }

  // 4. Put ad money behind the videos that already win
  const winners = [...life.values()].filter((l) => l.tops[0]?.kind === "video" && l.tops[0].sales >= 150).sort((x, y) => y.tops[0].sales - x.tops[0].sales).slice(0, 15);
  if (sales >= 2000 && winners.length >= 3) {
    add({
      category: "content", kind: "promote_best",
      title: `Put ad budget behind the ${winners.length} videos that already sell`,
      summary: `These videos have already proven they sell ${name}. Paid reach on a proven video is cheaper and safer than on a new one. Best video: ${videoText(winners[0].tops[0])}.`,
      steps: [
        "Ask each creator for the video's ad authorization code (Spark Ads) or use TikTok Shop's affiliate ads option.",
        "Start with a small daily budget on the top 3 videos and compare orders after 3 days.",
        "Keep the ones that sell below your cost per order, stop the rest.",
        "Note the results in the comments.",
      ],
      creators: winners.map((l) => line({ name: l.creator }, videoText(l.tops[0]), l.tops[0].sales, { lifetime: l.total, lastSale: l.lastDay, videos: l.tops.slice(0, 1) })),
      impactRm: winners.reduce((n, l) => n + l.tops[0].sales, 0) * 0.15, evidence: { videos: winners.length, best: Math.round(winners[0].tops[0].sales) }, priority: 2,
    });
  }

  // 5. LIVE is small or fell
  const liveNow = B.now.live, livePrev = B.prev.live;
  const liveFell = livePrev >= 500 && liveNow <= livePrev * 0.75;
  if (liveFell || (sales >= 3000 && liveNow < sales * 0.1)) {
    const lc = creatorsNow.filter((c) => c.mix.live > 0).map((c) => line(c, `${rm(c.mix.live)} from LIVE`, c.mix.live, base(c)));
    const fallback = creatorsNow.slice(0, 20).map((c) => line(c, `${rm(c.now)} sold, ask for a LIVE`, c.now, base(c)));
    add({
      category: "content", kind: "live_push",
      title: liveFell ? "LIVE sales fell, bring LIVE back" : "Get this product into more LIVE sessions",
      summary: liveFell ? `LIVE sales fell from ${rm(livePrev)} to ${rm(liveNow)}.` : `Only ${pc(sales > 0 ? (liveNow / sales) * 100 : 0)} of sales come from LIVE. LIVE buyers order fast and in groups.`,
      steps: [
        "Ask the creators below to feature this product in their next LIVE (pin it, give a LIVE-only offer).",
        "Share the selling points and the price ladder (1 item / 2 items / set).",
        "Agree a LIVE date and note it in the task comments.",
      ],
      creators: (lc.length ? lc : fallback).sort((x, y) => y.value - x.value), impactRm: liveFell ? livePrev - liveNow : sales * 0.08,
      evidence: { liveNow: Math.round(liveNow), livePrev: Math.round(livePrev) },
    });
  }

  // 6. Fewer views per video
  const nc = p.newContent;
  if (nc.now.matured >= 8 && nc.prev.matured >= 8 && nc.now.views != null && nc.prev.views != null && nc.prev.views > 0 && nc.now.views <= nc.prev.views * 0.6) {
    add({
      category: "content", kind: "low_views",
      title: "Videos get fewer views, change the hook or timing",
      summary: `Each new video gets ${Math.round(nc.now.views).toLocaleString("en-MY")} views, down from ${Math.round(nc.prev.views).toLocaleString("en-MY")}. Fewer people see it before they can buy.`,
      steps: [
        "Compare the first 3 seconds of the best and worst videos.",
        "Ask creators to post at peak times (evening) and to use trending sounds.",
        "Try shorter videos with the product result in the first second.",
      ],
      creators: creatorsNow.slice(0, 20).map((c) => line(c, `${rm(c.now)} sold`, c.now, base(c))), impactRm: sales * 0.06,
      evidence: { views: Math.round(nc.now.views), viewsBefore: Math.round(nc.prev.views) },
    });
  }

  // ── CREATORS ────────────────────────────────────────────
  // 7. Creators who nearly stopped (sold in the last period, almost nothing now): the full list
  const quiet = p.creatorsAll.filter((c) => c.prev >= Math.max(100, m.sales.prev * 0.01) && c.now <= c.prev * 0.25).sort((x, y) => y.prev - y.now - (x.prev - x.now));
  if (quiet.length) {
    const drop = quiet.reduce((n, c) => n + (c.prev - c.now), 0);
    add({
      category: "creators", kind: "reactivate",
      title: `Win back ${plural(quiet.length, "creator")} who just stopped selling it`,
      summary: `${plural(quiet.length, "creator")} sold ${rm(quiet.reduce((n, c) => n + c.prev, 0))} in the period before and now almost nothing (${rm(drop)} lost). They already know the product and sold it recently, so they are the easiest sales to win back. Biggest losses first.`,
      steps: [
        "Message each creator: ask if something changed (commission, stock, sample, personal).",
        "Offer what fits: new sample, higher commission for 2 weeks, a new video idea for their best video (shown under their name).",
        "If there is no reply in 3 days, try another contact (call or another owner).",
        "Note the reason in the comments. If the problem is ours (price, stock), tell the owner.",
      ],
      creators: quiet.map((c) => line(c, `${rm(c.prev)} before, ${rm(c.now)} now`, c.prev - c.now, { ...base(c), videos: lifeOf(c.name)?.tops.slice(0, 2) })),
      impactRm: drop, evidence: { creators: quiet.length, lost: Math.round(drop) },
    });
  }

  // 8. Creators whose sales are falling but not gone
  const falling = p.creatorsAll.filter((c) => c.prev >= 200 && c.now > c.prev * 0.25 && c.now <= c.prev * 0.6).sort((x, y) => y.prev - y.now - (x.prev - x.now));
  if (falling.length) {
    const drop = falling.reduce((n, c) => n + (c.prev - c.now), 0);
    add({
      category: "creators", kind: "falling",
      title: `${plural(falling.length, "creator")} are selling much less, check in before they stop`,
      summary: `${plural(falling.length, "creator")} still sell it but 40% to 75% less than the period before (${rm(drop)} lost). It is easier to help someone who is slowing down than to win them back later.`,
      steps: [
        "Message them: thank them and ask how it is going.",
        "Offer a fresh idea or a new sample; ask for one new video this week.",
        "Check the product page for their video (shown under their name): is it old? Ask for a new one.",
      ],
      creators: falling.map((c) => line(c, `${rm(c.prev)} before, ${rm(c.now)} now`, c.prev - c.now, { ...base(c), videos: lifeOf(c.name)?.recent.slice(0, 2) })),
      impactRm: drop * 0.5, evidence: { creators: falling.length, lost: Math.round(drop) },
    });
  }

  // 9. Creators who once sold it and went to sleep (the whole history)
  const sleeping = [...life.values()].filter((l) => l.lastDay < ctx.prevStart && !H.blocked.has(l.creator));
  const monthly = (l: { total: number; firstDay: string; lastDay: string }) => l.total / Math.max(1, daysBetweenISO(l.firstDay, l.lastDay) / 30 + 1);
  const mkSleep = (l: typeof sleeping[number]) => line({ name: l.creator }, `Sold ${rm(l.total)} in total, last sale ${dayLabel(l.lastDay)} (${daysBetweenISO(l.lastDay, ctx.today)} days ago)`, l.total, {
    lifetime: l.total, orders: l.orders, firstSale: l.firstDay, lastSale: l.lastDay, daysSince: daysBetweenISO(l.lastDay, ctx.today), videos: l.tops.slice(0, 2),
  });
  const stars = sleeping.filter((l) => l.total >= 500).sort((x, y) => y.total - x.total);
  const regulars = sleeping.filter((l) => l.total < 500 && l.total >= 100 && l.orders >= 3).sort((x, y) => y.total - x.total);
  const onehit = sleeping.filter((l) => l.total < 500 && !(l.total >= 100 && l.orders >= 3) && l.total >= 30).sort((x, y) => y.total - x.total);
  if (stars.length) {
    const mo = stars.reduce((n, l) => n + monthly(l), 0);
    add({
      category: "creators", kind: "lapsed_stars",
      title: `Win back ${plural(stars.length, "past star")} who sold RM 500+ of it and went quiet`,
      summary: `${plural(stars.length, "creator")} sold ${rm(stars.reduce((n, l) => n + l.total, 0))} of ${name} in total, but nothing in the last 8 weeks or more. These are proven sellers, the best creators to bring back. Their best video is shown under each name.`,
      steps: [
        "Start at the top: the creator who sold the most. Message them personally, not a copy and paste.",
        "Mention their best video (shown under their name) and say it made real sales.",
        "Offer what brings stars back: new sample, higher commission, exclusive product, or a call from the owner.",
        "Note the answer. If the creator left the platform, tick them and move on.",
      ],
      creators: stars.map(mkSleep), impactRm: mo * 0.25,
      evidence: { creators: stars.length, lifetime: Math.round(stars.reduce((n, l) => n + l.total, 0)), perMonth: Math.round(mo) }, priority: stars.length >= 3 || mo * 0.25 >= sales * 0.03 ? 1 : 2,
    });
  }
  if (regulars.length) {
    const mo = regulars.reduce((n, l) => n + monthly(l), 0);
    add({
      category: "creators", kind: "lapsed_regular",
      title: `Wake up ${plural(regulars.length, "creator")} who sold it several times and stopped`,
      summary: `${plural(regulars.length, "creator")} made 3 or more orders of this product, then went quiet for 8 weeks or more. A simple message can restart them.`,
      steps: ["Send a short friendly message, using their best video as the reason.", "Offer a fresh sample or a new idea.", "If they do not reply in 7 days, leave them for next month."],
      creators: regulars.map(mkSleep), impactRm: mo * 0.15, evidence: { creators: regulars.length, perMonth: Math.round(mo) },
    });
  }
  if (onehit.length >= 5) {
    add({
      category: "creators", kind: "one_hit",
      title: `Give ${plural(onehit.length, "one-time seller")} a second chance`,
      summary: `${plural(onehit.length, "creator")} sold this once or twice and never again. Many only needed a nudge or a better sample. Biggest first sales at the top.`,
      steps: ["Message the top 20 first, with a new idea for the product.", "Offer a second sample if the first one sold.", "Tick them off as you go; do the rest over the next weeks."],
      creators: onehit.map(mkSleep), impactRm: onehit.reduce((n, l) => n + monthly(l), 0) * 0.08, evidence: { creators: onehit.length }, priority: 3,
    });
  }

  // 10. Protect the biggest sellers so they do not become next month's quiet list
  const keep = creatorsNow.filter((c) => c.now >= Math.max(300, sales * 0.02) && (c.prev === 0 || c.now >= c.prev * 0.6)).slice(0, 25);
  if (keep.length >= 3) {
    add({
      category: "creators", kind: "retain_top",
      title: `Look after your top ${keep.length} sellers of this product`,
      summary: `These ${keep.length} creators sold ${rm(keep.reduce((n, c) => n + c.now, 0))}, ${pc(sales > 0 ? (keep.reduce((n, c) => n + c.now, 0) / sales) * 100 : 0)} of the product. Losing even one hurts. A thank you and a perk costs little compared with finding a new one.`,
      steps: ["Send a personal thank you with their sales number.", "Offer something early: a new variant sample, higher commission or an exclusive offer.", "Ask what they need (stock, content ideas, faster sample)."],
      creators: keep.map((c) => line(c, `${rm(c.now)} this period${c.prev ? `, ${rm(c.prev)} before` : ""}`, c.now, { ...base(c), videos: lifeOf(c.name)?.recent.slice(0, 1) })),
      impactRm: keep.reduce((n, c) => n + c.now, 0) * 0.1, evidence: { creators: keep.length }, priority: 2,
    });
  }

  // 11. Proven sellers of OTHER products who never tried this one
  const candidates = [...H.overall.values()].filter((o) => !H.blocked.has(o.creator) && o.total >= 500 && !life.has(o.creator) && daysBetweenISO(o.lastDay, ctx.today) <= 60 && !o.products.has(key)).sort((x, y) => y.total - x.total);
  if (sales >= 1000 && candidates.length >= 5) {
    add({
      category: "creators", kind: "cross_sell",
      title: `Offer this to ${plural(candidates.length, "proven seller")} who never sold it`,
      summary: `${plural(candidates.length, "active creator")} sold RM 500+ of our other products in total but never ${name}. They already convert for us, so this is the cheapest way to find new sellers. Strongest sellers first.`,
      steps: ["Message the top 20: tell them how well this product sells for others.", "Send a sample to those who say yes.", "Remind them in 7 days to post. Tick them off as they reply."],
      creators: candidates.map((o) => line({ name: o.creator }, `Sells ${o.best ? productName(o.best.pk) : "other products"}: ${rm(o.total)} in total`, o.total, { lifetime: o.total, lastSale: o.lastDay, daysSince: daysBetweenISO(o.lastDay, ctx.today), sells: o.best ? productName(o.best.pk) : undefined })),
      impactRm: avgPerCreator * Math.min(candidates.length, 40) * 0.25, evidence: { creators: candidates.length }, priority: 2,
    });
  }

  // 12. Too few creators, or too much depends on a few
  const t1 = p.creatorStats.top1, t3 = p.creatorStats.top3;
  const fewer = m.creators.prev > 0 && m.creators.now < m.creators.prev * 0.85;
  if (sales >= 1000 && (t1 >= 30 || t3 >= 55 || fewer)) {
    add({
      category: "creators", kind: "recruit",
      title: fewer ? "Fewer creators sell it, recruit new ones" : "Too much depends on a few creators, add more",
      summary: `${fewer ? `${m.creators.now} creators sold it (was ${m.creators.prev}). ` : ""}The top 3 creators bring ${pc(t3)} of sales${t1 >= 30 ? `, the top one alone ${pc(t1)}` : ""}. If one stops, sales drop fast. Average per selling creator is ${rm(avgPerCreator)}. Use the Cross-Sell and Past Star actions first, they are warmer than strangers.`,
      steps: [
        "In Find Creators, filter for creators like the top sellers (same niche, similar size).",
        "Invite 10 and send samples to the 5 that reply.",
        "Give each new creator a product brief and the best selling video as an example.",
        "Check in 14 days: who posted, who sold.",
      ],
      creators: creatorsNow.slice(0, 3).map((c) => line(c, `${pc(c.share)} of this product's sales`, c.now, base(c))),
      impactRm: avgPerCreator * 5 * 0.5,
      evidence: { top1Pct: Math.round(t1), top3Pct: Math.round(t3), creators: m.creators.now, creatorsBefore: m.creators.prev },
    });
  }

  // 13. Winners to scale
  const rising = creatorsNow.filter((c) => c.now >= 200 && (c.prev > 0 ? c.now >= c.prev * 1.3 : c.isNew) && c.mix.new + c.mix.recent > 0).sort((x, y) => y.now - y.prev - (x.now - x.prev));
  if (rising.length) {
    const gain = rising.reduce((n, c) => n + Math.max(c.now - c.prev, 0), 0);
    add({
      category: "creators", kind: "scale_winners",
      title: `Back ${plural(rising.length, "creator")} who are taking off`,
      summary: `${plural(rising.length, "creator")} sold ${rm(rising.reduce((n, c) => n + c.now, 0))}, up ${rm(gain)}, from new videos. Winners are the best place to put extra effort, they convert already.`,
      steps: [
        "Thank them and tell them the sales numbers. People post more when they see results.",
        "Send an extra sample (another variant) and ask for 2 more videos this week.",
        "Offer a short higher commission or a bonus for hitting a target.",
        "Ask for a LIVE on the weekend.",
      ],
      creators: rising.map((c) => line(c, `${rm(c.now)} now, ${rm(c.prev)} before`, c.now - c.prev, { ...base(c), videos: lifeOf(c.name)?.recent.slice(0, 1) })),
      impactRm: gain, evidence: { creators: rising.length, gain: Math.round(gain) }, priority: gain >= sales * 0.05 ? 1 : 2,
    });
  }

  // 14. New creators who just started
  const fresh1 = creatorsNow.filter((c) => c.isNew);
  if (fresh1.length) {
    add({
      category: "creators", kind: "welcome_new",
      title: `Follow up ${plural(fresh1.length, "new creator")} who just started selling it`,
      summary: `${plural(fresh1.length, "creator")} made their first sale of this product in this period (${rm(m.newCreators.sales)} in total). A second video within a week turns a first sale into a habit.`,
      steps: ["Thank them for the first sale.", "Ask for a second video this week and share what worked in the best videos.", "Offer another sample if the first one sold."],
      creators: fresh1.map((c) => line(c, `Started selling it: ${rm(c.now)} so far`, c.now, { ...base(c), videos: lifeOf(c.name)?.recent.slice(0, 1) })),
      impactRm: m.newCreators.sales, evidence: { creators: fresh1.length, sales: Math.round(m.newCreators.sales) }, priority: 2,
    });
  }

  // ── SAMPLES ─────────────────────────────────────────────
  if (p.unposted.length) {
    const per = p.samples.now.salesPerSample ?? p.samples.prev.salesPerSample ?? avgPerCreator * 0.5;
    const people = new Set(p.unposted.map((u) => u.creator));
    add({
      category: "samples", kind: "chase_unposted",
      title: `Chase ${plural(people.size, "creator")} who did not post their sample`,
      summary: `${plural(people.size, "creator")} received this product 14+ days ago and have not posted a video or sold it. A sample that is not posted is money lost. Longest waiting first.`,
      steps: [
        "Send a friendly reminder on WhatsApp (message ready below).",
        "If no reply in 3 days, ask their owner or try another contact.",
        "If still nothing after 14 more days, stop sending samples to them.",
        "Tick each creator when they reply or are stopped.",
      ],
      creators: [...p.unposted].sort((x, y) => y.days - x.days).map((s) => line({ name: s.creator }, `Delivered ${s.days} days ago`, s.days, { sampleDay: s.givenOn, daysSince: s.days })),
      impactRm: people.size * per * 0.5, evidence: { samples: people.size, perSample: Math.round(per) }, priority: people.size >= 5 ? 1 : 2,
    });
  }
  const sp = p.samples.now.salesPerSample;
  if (sp != null && sp >= 40 && p.samples.now.sent >= 3 && (p.samples.now.sent < p.samples.prev.sent * 0.9 || p.samples.now.sent < 5)) {
    const n = Math.max(p.samples.prev.sent - p.samples.now.sent, 5);
    add({
      category: "samples", kind: "more_samples",
      title: `Send ${n} more samples, they pay back`,
      summary: `Each sample of this product earned about ${rm(sp)} within 45 days. ${p.samples.now.sent} sent this period${p.samples.prev.sent ? ` (was ${p.samples.prev.sent})` : ""}, so there is room to send more. The best candidates are listed: creators who already sell it.`,
      steps: ["Pick creators who posted well before or who match the best sellers.", "Skip creators with unposted samples (see the Samples task).", "Send the samples and set a reminder to check posting after 7 days."],
      creators: creatorsNow.slice(0, 40).map((c) => line(c, `${rm(c.now)} sold, send another variant`, c.now, base(c))),
      impactRm: n * sp * 0.6, evidence: { perSample: Math.round(sp), sent: p.samples.now.sent, sentBefore: p.samples.prev.sent },
    });
  }
  const s = p.samples.now;
  if (s.delivered >= 6 && s.notPosted / s.delivered >= 0.4) {
    add({
      category: "samples", kind: "tighten_samples",
      title: "Too many samples are never posted, be stricter",
      summary: `${s.notPosted} of ${s.delivered} delivered samples were not posted (${pc((s.notPosted / s.delivered) * 100)}). Every one costs the product and the shipping.`,
      steps: ["Send samples only to creators who posted a video for a sample before, or who sell other products well.", "Ask for a promise date in the message before sending.", "Stop sending to creators who were chased twice without posting."],
      creators: [], impactRm: 0, evidence: { notPosted: s.notPosted, delivered: s.delivered }, priority: 2,
    });
  }

  // ── SHOP & OFFER ────────────────────────────────────────
  const rn = m.returnRate.now, rp = m.returnRate.prev;
  if (rn != null && ((rp != null && rn >= rp + 3 && rn >= 5) || rn >= 10)) {
    const top = p.quality.reasons[0];
    add({
      category: "shop", kind: "returns",
      title: "Returns and cancellations are too high",
      summary: `${pc(rn)} of order lines were returned or cancelled${rp != null ? ` (was ${pc(rp)})` : ""}${top ? `. Top reason: "${top.reason}" (${top.n}).` : "."} Each one loses the sale and the shipping.`,
      steps: ["Read the reasons on the product page (Quality).", "If it is size or description: fix the photos, size chart and title.", "If it is damage or quality: check packing and ask the supplier.", "Reply to the buyers who returned, and tell creators how to describe the product honestly."],
      creators: [], impactRm: (sales * Math.max(rn - (rp ?? rn - 3), 3)) / 100, evidence: { returnPct: Math.round(rn), returnPctBefore: rp == null ? -1 : Math.round(rp) },
    });
  }
  if (d.tag === "Dying" || d.tag === "Slipping") {
    const lost = Math.abs(Math.min(d.change, 0));
    add({
      category: "shop", kind: "rescue",
      title: d.tag === "Dying" ? "Rescue plan: sales have collapsed" : "Slowing down: check the offer and listing",
      summary: `Sales are down ${d.changePct != null ? pc(Math.abs(d.changePct)) : ""} (${rm(lost)}). ${d.reasons[0]?.text ?? ""} Check what changed in the shop, not only in the videos.`,
      steps: ["Check the listing: is it active, in stock, are price and photos the same as before?", "Compare the price with the 3 closest competitors.", "Try a voucher or flash sale for 7 days and tell creators about it.", "Check that the best sellers still have the product and the right link.", "Review this task in 7 days: did sales recover?"],
      creators: [], impactRm: lost, evidence: { change: Math.round(d.change), changePct: d.changePct == null ? 0 : Math.round(d.changePct) }, priority: d.tag === "Dying" ? 1 : lost >= sales * 0.1 ? 1 : 2,
    });
  }
  if (d.tag === "Growing" && d.change > 0) {
    add({
      category: "shop", kind: "scale_growing",
      title: "Growing: make sure stock and offer can keep up",
      summary: `Sales are up ${d.changePct != null ? pc(d.changePct) : ""} (+${rm(d.change)}). ${d.reasons[0]?.text ?? ""} Do not lose this to empty stock or a weak offer.`,
      steps: ["Check stock for the next 3 weeks at the current speed and reorder if needed.", "Give creators a clear offer to push (bundle, voucher, free gift).", "Send more samples to creators who are posting.", "Consider a shop ad or campaign while the product is moving."],
      creators: [], impactRm: d.change * 0.5, evidence: { change: Math.round(d.change) }, priority: d.change >= sales * 0.1 ? 1 : 2,
    });
  }

  return out.sort((a, b) => a.priority - b.priority || b.impactRm - a.impactRm);
}

/** A ready-to-send message per kind. {name}, {product}, {video}, {videoDate}, {videoSales}, {lifetime} are filled in for each creator. */
export const MESSAGES: Record<string, { en: string; ms: string }> = {
  new_videos: {
    en: "Hi {name}! Thank you for selling {product}. Could you make a new video of it this week? {lastVideo}We can send a fresh sample if you need one.",
    ms: "Hai {name}! Terima kasih sebab jual {product}. Boleh buat video baru produk ni minggu ni? {lastVideo}Kami boleh hantar sample baru kalau perlu 😊",
  },
  refresh_old: {
    en: "Hi {name}! Your {product} video from {videoDate} is still selling (RM {videoSales} lately) {video}. Could you remake it with a new angle this week? We will support you with a sample.",
    ms: "Hai {name}! Video {product} awak pada {videoDate} masih laku (RM {videoSales} baru-baru ni) {video}. Boleh buat semula dengan idea baru minggu ni? Kami support dengan sample 😊",
  },
  promote_best: {
    en: "Hi {name}! Your {product} video from {videoDate} sold really well {video}. Could you share its ad authorization code so we can promote it?",
    ms: "Hai {name}! Video {product} awak pada {videoDate} laku sangat {video}. Boleh kongsi kod kebenaran iklan supaya kami boleh promosi? 🙏",
  },
  live_push: {
    en: "Hi {name}! Could you feature {product} in your next LIVE? We can set up a LIVE-only offer for you.",
    ms: "Hai {name}! Boleh letak {product} dalam LIVE seterusnya? Kami boleh sediakan tawaran khas untuk LIVE 😊",
  },
  reactivate: {
    en: "Hi {name}, we have not seen a {product} video from you in a while. Is there anything we can help with? We can send a new sample or a special commission.",
    ms: "Hai {name}, dah lama tak nampak video {product} dari awak. Ada apa-apa kami boleh bantu? Kami boleh hantar sample baru atau komisen khas 🙏",
  },
  falling: {
    en: "Hi {name}, thanks for your {product} sales! We noticed it slowed down lately. Anything we can help with? We can send a new sample or fresh ideas.",
    ms: "Hai {name}, terima kasih untuk jualan {product}! Kami perasan jualan agak perlahan sekarang. Ada apa-apa kami boleh bantu? Kami boleh hantar sample baru atau idea baru 😊",
  },
  lapsed_stars: {
    en: "Hi {name}, you were one of our best {product} sellers (RM {lifetime} in total)! Your video from {videoDate} {video}was a big hit. We would love to work with you again. Can we send a new sample and a special commission?",
    ms: "Hai {name}, awak antara penjual {product} terbaik kami (RM {lifetime} semuanya)! Video awak pada {videoDate} {video}memang laku. Kami nak kerjasama lagi dengan awak. Boleh kami hantar sample baru dan komisen khas? 🙏",
  },
  lapsed_regular: {
    en: "Hi {name}, you sold {product} for us before and it did well! {video}Would you like to make a new video? We can send a fresh sample.",
    ms: "Hai {name}, awak pernah jual {product} dan hasilnya bagus! {video}Nak buat video baru? Kami boleh hantar sample baru 😊",
  },
  one_hit: {
    en: "Hi {name}, thanks for selling {product} before! We have new ideas and a fresh sample if you would like to try again.",
    ms: "Hai {name}, terima kasih pernah jual {product}! Kami ada idea baru dan sample baru kalau awak nak cuba lagi 😊",
  },
  retain_top: {
    en: "Hi {name}, thank you for being one of our top {product} sellers! We would like to give you something special. What would help you most?",
    ms: "Hai {name}, terima kasih jadi antara penjual {product} terbaik kami! Kami nak bagi sesuatu yang istimewa. Apa yang boleh bantu awak paling banyak? 🎉",
  },
  cross_sell: {
    en: "Hi {name}! Your sales have been great. Would you like to try our {product}? It sells well for other creators. We can send a free sample.",
    ms: "Hai {name}! Jualan awak memang bagus. Nak cuba {product} kami? Ia laku untuk kreator lain. Kami boleh hantar sample percuma 😊",
  },
  scale_winners: {
    en: "Hi {name}, congratulations, your {product} sales are great! Can we send an extra sample and a special commission? Could you post 2 more videos this week?",
    ms: "Hai {name}, tahniah, jualan {product} awak bagus! Nak kami hantar sample tambahan dan komisen khas? Boleh buat 2 video lagi minggu ni? 🎉",
  },
  welcome_new: {
    en: "Hi {name}, congratulations on your first {product} sale! Could you post a second video this week? We can send another sample.",
    ms: "Hai {name}, tahniah jualan pertama {product}! Boleh buat video kedua minggu ni? Kami boleh hantar sample tambahan 🎉",
  },
  chase_unposted: {
    en: "Hi {name}, your {product} sample should have arrived. Could you post a video this week? Tell us if there is any problem and we will help 🙏",
    ms: "Hai {name}, sample {product} dah sampai kan? Boleh post video minggu ni? Kalau ada masalah bagitahu kami ya 🙏",
  },
  more_samples: {
    en: "Hi {name}, thanks for your {product} sales! We would like to send you another variant. Which one would you like?",
    ms: "Hai {name}, terima kasih untuk jualan {product}! Kami nak hantar varian lain. Awak nak yang mana? 😊",
  },
};

/** Fills a message for one creator. The video details come from that creator's own line, so each message is personal. */
export function fillMessage(template: string, creator: string, product: string, data: LineData | undefined, lang: "ms" | "en"): string {
  const v = data?.videos?.[0];
  const date = v?.postDay ? dayLabel(v.postDay) : "";
  const link = v?.url ? `(${v.url}) ` : "";
  const last = v ? (lang === "ms" ? `Video terakhir awak pada ${date}${link ? ` ${link}` : " "}` : `Your last video was on ${date}${link ? ` ${link}` : " "}`) : "";
  return template
    .replaceAll("{name}", creator).replaceAll("{product}", product.replace(" · ", " "))
    .replaceAll("{videoDate}", date || "dulu").replaceAll("{videoSales}", v ? String(Math.round(v.sales)) : "")
    .replaceAll("{video}", link).replaceAll("{lastVideo}", last)
    .replaceAll("{lifetime}", data?.lifetime != null ? Math.round(data.lifetime).toLocaleString("en-MY") : "")
    .replace(/\s{2,}/g, " ").trim();
}
