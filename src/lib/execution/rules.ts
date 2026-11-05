// The Execution Plan rules: which actions to create for a product, from its numbers.
// Pure (no database). Every task carries the numbers that caused it, the people to contact, and a checklist, so staff never have to guess.
import type { ProductAnalysis, CreatorRow } from "@/lib/products/analysis";

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

export type Draft = {
  fingerprint: string;
  productKey: string;
  category: Category;
  kind: string;
  priority: Priority;
  title: string;
  summary: string;
  steps: string[];
  creators: { name: string; note: string }[];
  /** RM at stake: the sales that were lost, or that this action can plausibly win back or add. */
  impactRm: number;
  dueDays: number;
  evidence: Record<string, number | string>;
};

const rm = (n: number) => `RM ${Math.round(Math.abs(n)).toLocaleString("en-MY")}`;
const pc = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hitPct = (h: { matured: number; converting: number } | null) => (h && h.matured > 0 ? (h.converting / h.matured) * 100 : null);

/** Priority from how much money is at stake compared with the product's sales. */
function priorityOf(impact: number, sales: number, bump = 0): Priority {
  const r = sales > 0 ? impact / sales : 0;
  const base = r >= 0.1 ? 1 : r >= 0.03 ? 2 : 3;
  return Math.max(1, base - bump) as Priority;
}
const DUE: Record<Priority, number> = { 1: 3, 2: 7, 3: 14 };

export function buildDrafts(p: ProductAnalysis): Draft[] {
  const m = p.metrics, d = p.diagnosis;
  if (d.tag === "No Sales") return [];
  const out: Draft[] = [];
  const sales = m.sales.now;
  const key = p.key;
  const B = m.buckets;
  const fresh = { now: B.now.new + B.now.recent, prev: B.prev.new + B.prev.recent };
  const old = { now: B.now.old + B.now.veryold, prev: B.prev.old + B.prev.veryold };
  const videoLive = B.now.new + B.now.recent + B.now.old + B.now.veryold + B.now.live;
  const avgPerCreator = m.creators.now > 0 ? sales / m.creators.now : 0;
  const tagBump = d.tag === "Dying" ? 1 : 0;
  const add = (x: Omit<Draft, "fingerprint" | "productKey" | "dueDays" | "priority"> & { priority?: Priority; bump?: number }) => {
    const priority = x.priority ?? priorityOf(x.impactRm, Math.max(sales, m.sales.prev), x.bump ?? tagBump);
    out.push({ ...x, fingerprint: `${key}:${x.kind}`, productKey: key, priority, dueDays: DUE[priority] });
  };

  const creatorsNow = p.creatorsAll.filter((c) => c.now > 0);
  const pick = (list: CreatorRow[], n: number, note: (c: CreatorRow) => string) => list.slice(0, n).map((c) => ({ name: c.name, note: note(c) }));

  // ── CONTENT ─────────────────────────────────────────────
  // 1. Few or fewer new videos
  const vp = m.videosPosted;
  const fewVideos = vp.now != null && (vp.now === 0 || (vp.prev != null && vp.prev > 0 && vp.now < vp.prev * 0.8));
  const freshShare = videoLive > 0 ? fresh.now / videoLive : 1;
  if (fewVideos || (freshShare < 0.3 && sales >= 1000)) {
    const targets = pick(creatorsNow.filter((c) => c.mix.new === 0), 8, (c) => `${rm(c.now)} this period, no new video of it`);
    const lost = Math.max(fresh.prev - fresh.now, 0);
    add({
      category: "content", kind: "new_videos",
      title: targets.length ? `Ask ${plural(targets.length, "creator")} for new videos` : "Get new videos of this product posted",
      summary: vp.now != null
        ? `${vp.now === 0 ? "No new video" : `Only ${plural(vp.now, "new video")}`} posted${vp.prev ? ` (was ${vp.prev})` : ""}. Sales from new and recent videos ${lost > 0 ? `fell by ${rm(lost)}` : `are ${pc(freshShare * 100)} of video and LIVE sales`}. Without a steady flow of new videos, sales fade.`
        : `Only ${pc(freshShare * 100)} of video and LIVE sales come from new or recent videos.`,
      steps: [
        targets.length ? `Message the creators listed below and ask for 1 new video each this week.` : "Pick 5 creators who sold it before and ask for a new video.",
        "Send a fresh hook idea (problem + proof + price), not the same script as before.",
        "Offer a new sample or a small bonus to creators who post within 7 days.",
        "Tick the creators off as their videos go live; check again in 7 days.",
      ],
      creators: targets, impactRm: lost > 0 ? lost : sales * 0.1,
      evidence: { newVideos: vp.now ?? -1, newVideosBefore: vp.prev ?? -1, freshSharePct: Math.round(freshShare * 100) },
    });
  }

  // 2. New videos do not convert
  const hn = hitPct(m.hit.now), hp = hitPct(m.hit.prev);
  if (m.hit.now && m.hit.now.matured >= 8 && hn != null && (hn < 8 || (hp != null && hn <= hp - 10))) {
    const best = p.topContent.filter((t) => t.kind === "video").slice(0, 3);
    add({
      category: "content", kind: "fix_conversion",
      title: "New videos are not selling it, fix the hook",
      summary: `${m.hit.now.converting} of ${m.hit.now.matured} new videos got ${3}+ orders in 14 days (${pc(hn)}${hp != null ? `, was ${pc(hp)}` : ""}). Views come, orders do not, so the video or the offer is the problem.`,
      steps: [
        best.length ? `Watch the best videos: ${best.map((b) => `@${b.creator}`).join(", ")} (see Top Content on the product page).` : "Watch the 3 best selling videos of this product.",
        "Write down what they share: first 3 seconds, proof shot, price shown, call to buy.",
        "Send that as a short brief to every creator posting this product.",
        "Check the offer: price, voucher, free gift, delivery time. Test one change for 7 days.",
      ],
      creators: best.map((b) => ({ name: b.creator, note: `${rm(b.sales)} from one ${b.kind}` })),
      impactRm: Math.max(sales * 0.08, (m.salesPerNewVideo.prev ?? 0) * (vp.now ?? 0) - (m.salesPerNewVideo.now ?? 0) * (vp.now ?? 0)),
      evidence: { hitPct: Math.round(hn), hitPctBefore: hp == null ? -1 : Math.round(hp), judged: m.hit.now.matured },
    });
  }

  // 3. Old and very old videos carry the product
  const oldShare = d.oldShare ?? 0;
  if (oldShare >= 0.6 && sales >= 1000) {
    const targets = pick(creatorsNow.filter((c) => (c.mix.old + c.mix.veryold) / Math.max(c.now, 1) >= 0.6), 8, (c) => `${pc(((c.mix.old + c.mix.veryold) / Math.max(c.now, 1)) * 100)} of their sales are from old videos`);
    const fading = Math.max(old.prev - old.now, 0);
    add({
      category: "content", kind: "refresh_old",
      title: "Refresh old videos before they fade",
      summary: `${pc(oldShare * 100)} of video and LIVE sales come from videos older than 30 days${fading > 0 ? `, and they lost ${rm(fading)}` : ""}. ${d.fragile ? "This product is Fragile: when those videos stop, sales drop." : "A lot depends on videos that will not last."}`,
      steps: [
        "List the old videos that still sell (Top Content on the product page).",
        "Ask each of those creators to remake it with a new hook, new angle or new proof.",
        "Ask for a LIVE session that features the product, to reach buyers again.",
        "Aim for 3 new videos from these creators within 10 days.",
      ],
      creators: targets, impactRm: fading > 0 ? fading : sales * 0.1,
      evidence: { oldSharePct: Math.round(oldShare * 100), oldSalesFell: Math.round(fading) }, bump: d.fragile ? 1 : 0,
    });
  }

  // 4. LIVE is small or fell
  const liveNow = B.now.live, livePrev = B.prev.live;
  const liveFell = livePrev >= 500 && liveNow <= livePrev * 0.75;
  if (liveFell || (sales >= 3000 && liveNow < sales * 0.1)) {
    const targets = pick(creatorsNow.filter((c) => c.mix.live > 0), 6, (c) => `${rm(c.mix.live)} from LIVE`);
    const top = targets.length ? targets : pick(creatorsNow, 5, (c) => `${rm(c.now)} sold, ask for a LIVE`);
    add({
      category: "content", kind: "live_push",
      title: liveFell ? "LIVE sales fell, bring LIVE back" : "Get this product into more LIVE sessions",
      summary: liveFell ? `LIVE sales fell from ${rm(livePrev)} to ${rm(liveNow)}.` : `Only ${pc(sales > 0 ? (liveNow / sales) * 100 : 0)} of sales come from LIVE. LIVE buyers order fast and in groups.`,
      steps: [
        "Ask the creators below to feature this product in their next LIVE (pin it, give a LIVE-only offer).",
        "Share the selling points and the price ladder (1 item / 2 items / set).",
        "Agree a LIVE date and note it in the task comments.",
      ],
      creators: top, impactRm: liveFell ? livePrev - liveNow : sales * 0.08,
      evidence: { liveNow: Math.round(liveNow), livePrev: Math.round(livePrev) },
    });
  }

  // 5. Fewer views per video / fewer clicks
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
      creators: pick(creatorsNow, 5, (c) => `${rm(c.now)} sold`), impactRm: sales * 0.06,
      evidence: { views: Math.round(nc.now.views), viewsBefore: Math.round(nc.prev.views) },
    });
  }

  // ── CREATORS ────────────────────────────────────────────
  // 6. Creators who nearly stopped
  const quiet = p.creatorsAll.filter((c) => c.prev >= Math.max(150, m.sales.prev * 0.02) && c.now <= c.prev * 0.25).sort((x, y) => y.prev - y.now - (x.prev - x.now));
  if (quiet.length) {
    const drop = quiet.reduce((n, c) => n + (c.prev - c.now), 0);
    add({
      category: "creators", kind: "reactivate",
      title: `Win back ${plural(quiet.length, "creator")} who stopped selling it`,
      summary: `${plural(quiet.length, "creator")} sold ${rm(quiet.reduce((n, c) => n + c.prev, 0))} before and now almost nothing (${rm(drop)} lost). They already know the product, so they are the easiest sales to win back.`,
      steps: [
        "Message each creator: ask if something changed (commission, stock, sample, personal).",
        "Offer what fits: new sample, higher commission for 2 weeks, a new video idea.",
        "If there is no reply in 3 days, try another contact (call or another owner).",
        "Note the reason in the comments. If the problem is ours (price, stock), tell the owner.",
      ],
      creators: quiet.slice(0, 8).map((c) => ({ name: c.name, note: `${rm(c.prev)} before, ${rm(c.now)} now` })),
      impactRm: drop, evidence: { creators: quiet.length, lost: Math.round(drop) },
    });
  }

  // 7. Too few creators, or too much depends on a few
  const t1 = p.creatorStats.top1, t3 = p.creatorStats.top3;
  const fewer = m.creators.prev > 0 && m.creators.now < m.creators.prev * 0.85;
  if (sales >= 1000 && (t1 >= 30 || t3 >= 55 || fewer)) {
    const top3 = creatorsNow.slice(0, 3);
    add({
      category: "creators", kind: "recruit",
      title: fewer ? "Fewer creators sell it, recruit new ones" : "Too much depends on a few creators, add more",
      summary: `${fewer ? `${m.creators.now} creators sold it (was ${m.creators.prev}). ` : ""}The top 3 creators bring ${pc(t3)} of sales${t1 >= 30 ? `, the top one alone ${pc(t1)}` : ""}. If one stops, sales drop fast. Average per selling creator is ${rm(avgPerCreator)}.`,
      steps: [
        "In Find Creators, filter for creators like the top sellers (same niche, similar size).",
        "Invite 10 and send samples to the 5 that reply.",
        "Give each new creator a product brief and the best selling video as an example.",
        "Check in 14 days: who posted, who sold.",
      ],
      creators: top3.map((c) => ({ name: c.name, note: `${pc(c.share)} of this product's sales` })),
      impactRm: avgPerCreator * 5 * 0.5,
      evidence: { top1Pct: Math.round(t1), top3Pct: Math.round(t3), creators: m.creators.now, creatorsBefore: m.creators.prev },
    });
  }

  // 8. Winners to scale
  const winners = creatorsNow.filter((c) => c.now >= 200 && (c.prev > 0 ? c.now >= c.prev * 1.3 : c.isNew) && c.mix.new + c.mix.recent > 0).sort((x, y) => y.now - y.prev - (x.now - x.prev));
  if (winners.length) {
    const gain = winners.reduce((n, c) => n + Math.max(c.now - c.prev, 0), 0);
    add({
      category: "creators", kind: "scale_winners",
      title: `Back ${plural(winners.length, "creator")} who are taking off`,
      summary: `${plural(winners.length, "creator")} sold ${rm(winners.reduce((n, c) => n + c.now, 0))}, up ${rm(gain)}, from new videos. Winners are the best place to put extra effort, they convert already.`,
      steps: [
        "Thank them and tell them the sales numbers. People post more when they see results.",
        "Send an extra sample (another variant) and ask for 2 more videos this week.",
        "Offer a short higher commission or a bonus for hitting a target.",
        "Ask for a LIVE on the weekend.",
      ],
      creators: winners.slice(0, 6).map((c) => ({ name: c.name, note: `${rm(c.now)} now, ${rm(c.prev)} before` })),
      impactRm: gain, evidence: { creators: winners.length, gain: Math.round(gain) }, priority: gain >= sales * 0.05 ? 1 : 2,
    });
  }

  // 9. New creators who just started
  const fresh1 = creatorsNow.filter((c) => c.isNew);
  if (fresh1.length) {
    add({
      category: "creators", kind: "welcome_new",
      title: `Follow up ${plural(fresh1.length, "new creator")} who just started selling it`,
      summary: `${plural(fresh1.length, "creator")} made their first sale of this product this period (${rm(m.newCreators.sales)}). A second video within a week turns a first sale into a habit.`,
      steps: [
        "Thank them for the first sale.",
        "Ask for a second video this week and share what worked in the best videos.",
        "Offer another sample if the first one sold.",
      ],
      creators: fresh1.slice(0, 8).map((c) => ({ name: c.name, note: `${rm(c.now)} first period` })),
      impactRm: m.newCreators.sales, evidence: { creators: fresh1.length, sales: Math.round(m.newCreators.sales) }, priority: 2,
    });
  }

  // ── SAMPLES ─────────────────────────────────────────────
  // 10. Delivered but not posted
  if (p.unposted.length) {
    const per = p.samples.now.salesPerSample ?? p.samples.prev.salesPerSample ?? avgPerCreator * 0.5;
    add({
      category: "samples", kind: "chase_unposted",
      title: `Chase ${plural(p.unposted.length, "sample")} that were delivered but not posted`,
      summary: `${plural(p.unposted.length, "creator")} received this product 14+ days ago and have not posted a video or sold it. A sample that is not posted is money lost.`,
      steps: [
        "Send a friendly reminder on WhatsApp (message ready below).",
        "If no reply in 3 days, ask their owner or try another contact.",
        "If still nothing after 14 more days, stop sending samples to them.",
        "Mark the task done when everyone has replied or been stopped.",
      ],
      creators: p.unposted.slice(0, 12).map((s) => ({ name: s.creator, note: `delivered ${s.days} days ago` })),
      impactRm: p.unposted.length * per * 0.5, evidence: { samples: p.unposted.length, perSample: Math.round(per) }, priority: p.unposted.length >= 5 ? 1 : 2,
    });
  }

  // 11. Samples pay back, send more
  const sp = p.samples.now.salesPerSample;
  if (sp != null && sp >= 40 && p.samples.now.sent >= 3 && (p.samples.now.sent < p.samples.prev.sent * 0.9 || p.samples.now.sent < 5)) {
    const n = Math.max(p.samples.prev.sent - p.samples.now.sent, 5);
    add({
      category: "samples", kind: "more_samples",
      title: `Send ${n} more samples, they pay back`,
      summary: `Each sample of this product earned about ${rm(sp)} within 45 days. ${p.samples.now.sent} sent this period${p.samples.prev.sent ? ` (was ${p.samples.prev.sent})` : ""}, so there is room to send more.`,
      steps: [
        "Pick creators who posted well before or who match the best sellers.",
        "Skip creators with unposted samples (see the Samples task).",
        "Send the samples and set a reminder to check posting after 7 days.",
      ],
      creators: pick(creatorsNow.filter((c) => c.now > 0), 5, (c) => `${rm(c.now)} sold, send another variant`),
      impactRm: n * sp * 0.6, evidence: { perSample: Math.round(sp), sent: p.samples.now.sent, sentBefore: p.samples.prev.sent },
    });
  }

  // 12. Too many samples are wasted
  const s = p.samples.now;
  if (s.delivered >= 6 && s.notPosted / s.delivered >= 0.4) {
    add({
      category: "samples", kind: "tighten_samples",
      title: "Too many samples are never posted, be stricter",
      summary: `${s.notPosted} of ${s.delivered} delivered samples were not posted (${pc((s.notPosted / s.delivered) * 100)}). Every one costs the product and the shipping.`,
      steps: [
        "Send samples only to creators who posted a video for a sample before, or who sell other products well.",
        "Ask for a promise date in the message before sending.",
        "Stop sending to creators who were chased twice without posting.",
      ],
      creators: [], impactRm: 0, evidence: { notPosted: s.notPosted, delivered: s.delivered }, priority: 2,
    });
  }

  // ── SHOP & OFFER ────────────────────────────────────────
  // 13. Returns and cancellations
  const rn = m.returnRate.now, rp = m.returnRate.prev;
  if (rn != null && ((rp != null && rn >= rp + 3 && rn >= 5) || rn >= 10)) {
    const top = p.quality.reasons[0];
    add({
      category: "shop", kind: "returns",
      title: "Returns and cancellations are too high",
      summary: `${pc(rn)} of order lines were returned or cancelled${rp != null ? ` (was ${pc(rp)})` : ""}${top ? `. Top reason: "${top.reason}" (${top.n}).` : "."} Each one loses the sale and the shipping.`,
      steps: [
        "Read the reasons on the product page (Quality).",
        "If it is size or description: fix the photos, size chart and title.",
        "If it is damage or quality: check packing and ask the supplier.",
        "Reply to the buyers who returned, and tell creators how to describe the product honestly.",
      ],
      creators: [], impactRm: (sales * Math.max(rn - (rp ?? rn - 3), 3)) / 100, evidence: { returnPct: Math.round(rn), returnPctBefore: rp == null ? -1 : Math.round(rp) },
    });
  }

  // 14. Rescue a slipping or dying product
  if (d.tag === "Dying" || d.tag === "Slipping") {
    const lost = Math.abs(Math.min(d.change, 0));
    add({
      category: "shop", kind: "rescue",
      title: d.tag === "Dying" ? "Rescue plan: sales have collapsed" : "Slowing down: check the offer and listing",
      summary: `Sales are down ${d.changePct != null ? pc(Math.abs(d.changePct)) : ""} (${rm(lost)}). ${d.reasons[0]?.text ?? ""} Check what changed in the shop, not only in the videos.`,
      steps: [
        "Check the listing: is it active, in stock, are price and photos the same as before?",
        "Compare the price with the 3 closest competitors.",
        "Try a voucher or flash sale for 7 days and tell creators about it (they can promote the deal).",
        "Check that the best sellers still have the product and the right link.",
        "Review this task in 7 days: did sales recover?",
      ],
      creators: [], impactRm: lost, evidence: { change: Math.round(d.change), changePct: d.changePct == null ? 0 : Math.round(d.changePct) },
      priority: d.tag === "Dying" ? 1 : lost >= sales * 0.1 ? 1 : 2,
    });
  }

  // 15. Back a growing product
  if (d.tag === "Growing" && d.change > 0) {
    add({
      category: "shop", kind: "scale_growing",
      title: "Growing: make sure stock and offer can keep up",
      summary: `Sales are up ${d.changePct != null ? pc(d.changePct) : ""} (+${rm(d.change)}). ${d.reasons[0]?.text ?? ""} Do not lose this to empty stock or a weak offer.`,
      steps: [
        "Check stock for the next 3 weeks at the current speed and reorder if needed.",
        "Give creators a clear offer to push (bundle, voucher, free gift).",
        "Send more samples to creators who are posting (see Samples and Creators tasks).",
        "Consider a shop ad or campaign while the product is moving.",
      ],
      creators: [], impactRm: d.change * 0.5, evidence: { change: Math.round(d.change) }, priority: d.change >= sales * 0.1 ? 1 : 2,
    });
  }

  return out.sort((a, b) => a.priority - b.priority || b.impactRm - a.impactRm);
}

/** A ready-to-send message for creator tasks. {name} and {product} are filled in on screen. */
export const MESSAGES: Record<string, { en: string; ms: string }> = {
  new_videos: {
    en: "Hi {name}! Thank you for selling {product}. Could you make a new video of it this week? We can send a fresh sample if you need one.",
    ms: "Hai {name}! Terima kasih sebab jual {product}. Boleh buat video baru produk ni minggu ni? Kami boleh hantar sample baru kalau perlu 😊",
  },
  refresh_old: {
    en: "Hi {name}! Your {product} video sold really well. Could you remake it with a new angle this week? We will support you with a sample.",
    ms: "Hai {name}! Video {product} awak laku sangat. Boleh buat semula dengan idea baru minggu ni? Kami support dengan sample 😊",
  },
  live_push: {
    en: "Hi {name}! Could you feature {product} in your next LIVE? We can set up a LIVE-only offer for you.",
    ms: "Hai {name}! Boleh letak {product} dalam LIVE seterusnya? Kami boleh sediakan tawaran khas untuk LIVE 😊",
  },
  reactivate: {
    en: "Hi {name}, we have not seen a {product} video from you in a while. Is there anything we can help with? We can send a new sample or a special commission.",
    ms: "Hai {name}, dah lama tak nampak video {product} dari awak. Ada apa-apa kami boleh bantu? Kami boleh hantar sample baru atau komisen khas 🙏",
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
