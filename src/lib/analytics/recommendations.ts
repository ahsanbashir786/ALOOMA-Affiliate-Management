import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, products, recommendations } from "@/db/schema";
import { resolvePeriod } from "@/lib/period";
import type { Period } from "@/lib/period-core";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { classifyCreators, classifyNonSellers, type Classified, type ClassifiedNonSeller, type SegmentContext } from "./classify";
import { getCreatorMetrics, getNonSellers } from "./creators";
import { getThresholds, type Thresholds } from "./settings";
import { getSampleScorecard } from "@/lib/samples/analysis";
import { waMessage, type SampleVerdict } from "@/lib/samples/states";

export type Recommendation = {
  username: string;
  type: SegmentKey;
  priority: number;
  title: string;
  reason: string;
  instruction: string;
  /** The same message in Bahasa Melayu. */
  instructionMs: string;
  expectedUplift: number;
  baselineGmv: number;
};

const BASE_PRIORITY: Record<SegmentKey, number> = {
  underposting: 80,
  slipping: 75,
  inactive: 70,
  low_conversion: 55,
  rising: 50,
  sample_no_post: 45,
  star: 40,
  new: 35,
  untapped: 30,
  steady: 10,
  sample_chase: 72,
  more_samples: 60,
  more_content: 66,
  refresh_content: 58,
  stop_samples: 38,
};

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-MY");

function priorityScore(segment: SegmentKey, gmv: number, uplift: number): number {
  const value = Math.min(1, Math.log10(1 + gmv + uplift) / 4.5) * 20;
  return Math.max(1, Math.min(100, Math.round(BASE_PRIORITY[segment] * 0.8 + value)));
}

type Names = Map<string, string>;

export function buildRecommendation(
  c: Classified,
  period: Period,
  t: Thresholds,
  names: Names,
): Recommendation | null {
  const seg = c.segment;
  if (!seg || seg === "steady") return null;
  const name = c.username;
  const top = (c.topProductId && names.get(c.topProductId)) || "your best-selling product";
  const topMs = (c.topProductId && names.get(c.topProductId)) || "produk terlaris awak";
  const share = Math.round(c.topProductShare * 100);
  const days = period.days;
  const pct = Math.round(c.cancelRate * 100);

  const tipsEn: string[] = [];
  const tipsMs: string[] = [];
  if (c.flags.includes("no_live")) {
    tipsEn.push(`Try one short LIVE this week demonstrating ${top} – viewers can buy straight away.`);
    tipsMs.push(`Cuba satu LIVE pendek minggu ini untuk tunjukkan ${topMs} – penonton boleh terus membeli.`);
  }
  if (c.flags.includes("single_product")) {
    tipsEn.push(`Add a second product to your videos (e.g. a matching bedsheet or pillow) to lift basket size.`);
    tipsMs.push(`Tambah produk kedua dalam video awak (cth. cadar atau sarung bantal yang sepadan) untuk tingkatkan nilai pesanan.`);
  }
  if (c.flags.includes("high_cancel") || c.flags.includes("cod_heavy")) {
    tipsEn.push(`Encourage buyers to pay online (not COD) – ${pct}% of your orders were cancelled or returned, mostly avoidable.`);
    tipsMs.push(`Galakkan pembeli bayar dalam talian (bukan COD) – ${pct}% pesanan awak dibatalkan atau dipulangkan, kebanyakannya boleh dielakkan.`);
  }
  const extraEn = tipsEn.length ? tipsEn.map((x) => `• ${x}`).join("\n") : null;
  const extraMs = tipsMs.length ? tipsMs.map((x) => `• ${x}`).join("\n") : null;
  const closingEn = "Need a sample, a brief or a voucher code? Just reply and we'll sort it out.";
  const closingMs = "Perlukan sampel, brief atau kod baucar? Balas sahaja dan kami uruskan.";
  const lines = (xs: (string | null)[]) => xs.filter((l): l is string => l !== null).join("\n");
  const s1 = t.targetVideosPerWeek === 1 ? "" : "s";

  let title = "";
  let en = "";
  let ms = "";
  switch (seg) {
    case "underposting":
      title = `Ask ${name} for more fresh videos`;
      en = lines([
        `Hi ${name}, thank you for the brilliant results – you've driven ${rm(c.gmv)} in sales for us over the last ${days} days.`,
        ``,
        `To keep that momentum going, here's what would help most:`,
        `• Post at least ${t.targetVideosPerWeek} new shoppable video${s1} a week (you posted ${c.videosPosted ?? 0} recently) – fresh videos replace the older ones as they slow down.`,
        `• Lead with ${top}${share >= 40 ? ` – ${share}% of your sales come from it` : ""}. Show it in use: feel, fit and a clear before/after.`,
        `• Make a "part 2" of your best-selling video: same hook, new angle.`,
        extraEn,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, terima kasih atas keputusan yang cemerlang – awak telah menjana jualan ${rm(c.gmv)} untuk kami dalam ${days} hari lepas.`,
        ``,
        `Untuk kekalkan momentum ini, ini yang paling membantu:`,
        `• Upload sekurang-kurangnya ${t.targetVideosPerWeek} video baharu seminggu (awak upload ${c.videosPosted ?? 0} baru-baru ini) – video baharu menggantikan yang lama apabila jualannya perlahan.`,
        `• Utamakan ${topMs}${share >= 40 ? ` – ${share}% jualan awak datang daripadanya` : ""}. Tunjukkan ia digunakan: rasa, kesesuaian dan sebelum/selepas yang jelas.`,
        `• Buat "part 2" video terlaris awak: hook sama, sudut baharu.`,
        extraMs,
        closingMs,
      ]);
      break;
    case "slipping":
      title = `Re-engage ${name} – sales down ${Math.round(Math.abs(c.change ?? 0) * 100)}%`;
      en = lines([
        `Hi ${name}, we noticed your sales dipped recently (${rm(c.gmv)} vs ${rm(c.prevGmv)} before). Is anything getting in the way – product questions, stock, or ideas you'd like support on?`,
        ``,
        `Some quick ways to bounce back:`,
        `• Re-post or pin your best video featuring ${top}.`,
        `• Refresh the first 3 seconds of your next video with a stronger hook.`,
        `• Share a new angle: comparison, unboxing or "what I wish I knew".`,
        extraEn,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, kami perasan jualan awak menurun baru-baru ini (${rm(c.gmv)} berbanding ${rm(c.prevGmv)} sebelum ini). Ada apa-apa yang menghalang – soalan produk, stok atau idea yang awak perlukan sokongan?`,
        ``,
        `Beberapa cara cepat untuk bangkit semula:`,
        `• Upload semula atau pin video terbaik awak yang menampilkan ${topMs}.`,
        `• Perbaharui 3 saat pertama video seterusnya dengan hook yang lebih kuat.`,
        `• Kongsi sudut baharu: perbandingan, unboxing atau "apa yang saya harap saya tahu dulu".`,
        extraMs,
        closingMs,
      ]);
      break;
    case "inactive":
      title = `Win back ${name}`;
      en = lines([
        `Hi ${name}, we've missed your content! You sold ${rm(c.prevGmv)} for us last period and we'd love to work together again.`,
        ``,
        `• A fresh sample of ${top} is yours if you'd like to post this week.`,
        `• We can share a short brief with what's working for other creators right now.`,
        `• One video this week would make a real difference.`,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, kami rindu kandungan awak! Awak menjana jualan ${rm(c.prevGmv)} untuk kami pada tempoh lepas dan kami teringin bekerjasama lagi.`,
        ``,
        `• Sampel baharu ${topMs} untuk awak jika awak mahu upload minggu ini.`,
        `• Kami boleh kongsi brief ringkas tentang apa yang berkesan untuk kreator lain sekarang.`,
        `• Satu video minggu ini akan membawa perbezaan yang besar.`,
        closingMs,
      ]);
      break;
    case "low_conversion":
      title = `Coach ${name} on conversion`;
      en = lines([
        `Hi ${name}, your videos get great attention (${num(c.views ?? 0)} views) – let's turn more of those viewers into buyers:`,
        ``,
        `• Show the product in use within the first 5 seconds.`,
        `• Say the key benefit and the offer out loud, and tell viewers to tap the yellow basket.`,
        `• Feature ${top}${c.topProductShare >= 0.3 ? ` – it converts best for you (${share}% of your sales)` : ""}.`,
        `• Pin a comment with the product name and any voucher.`,
        extraEn,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, video awak mendapat perhatian yang hebat (${num(c.views ?? 0)} tontonan) – jom ubah lebih ramai penonton jadi pembeli:`,
        ``,
        `• Tunjukkan produk digunakan dalam 5 saat pertama.`,
        `• Sebut manfaat utama dan tawaran dengan jelas, dan minta penonton tekan bakul kuning.`,
        `• Tampilkan ${topMs}${c.topProductShare >= 0.3 ? ` – ia paling berkesan untuk awak (${share}% jualan awak)` : ""}.`,
        `• Pin komen dengan nama produk dan sebarang baucar.`,
        extraMs,
        closingMs,
      ]);
      break;
    case "rising":
      title = `Back ${name}'s momentum`;
      en = lines([
        `Hi ${name}, your sales are up ${Math.round((c.change ?? 0) * 100)}% – fantastic work!`,
        ``,
        `• Keep your current posting pace over the next few weeks.`,
        `• Double down on ${top}.`,
        `• We can send samples of other products so you can keep content fresh.`,
        extraEn,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, jualan awak meningkat ${Math.round((c.change ?? 0) * 100)}% – syabas!`,
        ``,
        `• Kekalkan rentak upload semasa untuk beberapa minggu akan datang.`,
        `• Fokuskan lagi pada ${topMs}.`,
        `• Kami boleh hantar sampel produk lain supaya kandungan awak kekal segar.`,
        extraMs,
        closingMs,
      ]);
      break;
    case "star":
      title = `Nurture star creator ${name}`;
      en = lines([
        `Hi ${name}, you're one of our top creators – thank you! We'd love to look after you better:`,
        ``,
        `• Priority samples for every new launch.`,
        `• A direct contact for anything you need.`,
        `• Let's discuss exclusive products or improved commission on selected items.`,
        ``,
        `Tell us what would help you most.`,
      ]);
      ms = lines([
        `Hai ${name}, awak antara kreator terbaik kami – terima kasih! Kami nak jaga awak dengan lebih baik:`,
        ``,
        `• Sampel keutamaan untuk setiap produk baharu.`,
        `• Hubungan terus untuk apa sahaja yang awak perlukan.`,
        `• Jom bincang produk eksklusif atau komisen yang lebih baik untuk produk terpilih.`,
        ``,
        `Beritahu kami apa yang paling membantu awak.`,
      ]);
      break;
    case "new":
      title = `Welcome ${name} – new seller`;
      en = lines([
        `Hi ${name}, congratulations on your first strong sales (${rm(c.gmv)})!`,
        ``,
        `• Post consistently – even one video a week compounds over time.`,
        `• Your best result so far is ${top}; build on it.`,
        closingEn,
      ]);
      ms = lines([
        `Hai ${name}, tahniah atas jualan pertama yang kukuh (${rm(c.gmv)})!`,
        ``,
        `• Upload secara konsisten – walau satu video seminggu, hasilnya akan terkumpul dari semasa ke semasa.`,
        `• Hasil terbaik awak setakat ini ialah ${topMs}; teruskan membinanya.`,
        closingMs,
      ]);
      break;
    default:
      return null;
  }

  return {
    username: name,
    type: seg,
    priority: priorityScore(seg, c.gmv, c.uplift),
    title,
    reason: c.reason,
    instruction: en,
    instructionMs: ms,
    expectedUplift: Math.round(c.uplift),
    baselineGmv: Math.round(c.gmv),
  };
}

export function buildNonSellerRecommendation(n: ClassifiedNonSeller, topProduct: string): Recommendation {
  if (n.segment === "sample_no_post") {
    const s = n.samplesShipped === 1 ? "" : "s";
    return {
      username: n.username,
      type: "sample_no_post",
      priority: priorityScore("sample_no_post", 0, 0),
      title: `Chase ${n.username} for sample content`,
      reason: n.reason,
      instruction: [
        `Hi ${n.username}, hope you're well! We shipped you ${n.samplesShipped} sample${s} and we'd love to see your take on it.`,
        ``,
        `• Could you let us know roughly when you plan to post?`,
        `• A short demo showing the product in use works best.`,
        `Happy to share a brief if that helps.`,
      ].join("\n"),
      instructionMs: [
        `Hai ${n.username}, harap awak sihat! Kami telah hantar ${n.samplesShipped} sampel kepada awak dan kami teringin tengok pandangan awak.`,
        ``,
        `• Boleh beritahu bila awak merancang untuk upload?`,
        `• Demo ringkas yang menunjukkan produk digunakan adalah yang terbaik.`,
        `Kami boleh kongsi brief jika perlu.`,
      ].join("\n"),
      expectedUplift: 0,
      baselineGmv: 0,
    };
  }
  return {
    username: n.username,
    type: "untapped",
    priority: priorityScore("untapped", n.followers / 100, 0),
    title: `Invite ${n.username} (${Math.round(n.followers / 1000)}k followers)`,
    reason: n.reason,
    instruction: [
      `Hi ${n.username}, we love your content and think our bedding range would suit your audience.`,
      ``,
      `• We'd like to send you a free sample of ${topProduct}.`,
      `• We can share a simple brief and a commission offer for a target collaboration.`,
      `Interested? Reply here and we'll set it up.`,
    ].join("\n"),
    instructionMs: [
      `Hai ${n.username}, kami suka kandungan awak dan rasa rangkaian tilam dan cadar kami sesuai untuk penonton awak.`,
      ``,
      `• Kami nak hantar sampel percuma ${topProduct}.`,
      `• Kami boleh kongsi brief mudah dan tawaran komisen untuk kerjasama sasaran.`,
      `Berminat? Balas di sini dan kami akan uruskan.`,
    ].join("\n"),
    expectedUplift: 0,
    baselineGmv: 0,
  };
}

export async function productNameMap(): Promise<Names> {
  const list = await db.select({ id: products.productId, name: products.shortName }).from(products);
  return new Map(list.map((p) => [p.id, p.name]));
}

export type Analysis = {
  period: Period;
  classified: Classified[];
  nonSellers: ClassifiedNonSeller[];
  ctx: SegmentContext;
  thresholds: Thresholds;
  names: Names;
  snapshots: Awaited<ReturnType<typeof getCreatorMetrics>>["snapshots"];
};

/** Full creator analysis for a period: metrics → segments → non-seller lists. */
export async function analyse(period: Period): Promise<Analysis> {
  const [thresholds, names] = await Promise.all([getThresholds(), productNameMap()]);
  const { rows: metrics, snapshots } = await getCreatorMetrics(period);
  const { classified, ctx } = classifyCreators(metrics, thresholds, period);
  const sellers = new Set(metrics.filter((m) => m.gmv > 0).map((m) => m.username));
  const ns = await getNonSellers(period, sellers);
  const nonSellers = classifyNonSellers(ns.sampled, ns.pool, thresholds);
  return { period, classified, nonSellers, ctx, thresholds, names, snapshots };
}

export function allRecommendations(a: Analysis): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const c of a.classified) {
    const r = buildRecommendation(c, a.period, a.thresholds, a.names);
    if (r) recs.push(r);
  }
  const topProduct = [...a.names.values()][0] ?? "our best-selling product";
  const sampled = a.nonSellers.filter((n) => n.segment === "sample_no_post");
  const untapped = a.nonSellers.filter((n) => n.segment === "untapped").sort((x, y) => y.followers - x.followers).slice(0, 30);
  for (const n of [...sampled, ...untapped]) recs.push(buildNonSellerRecommendation(n, topProduct));
  return recs.sort((x, y) => y.priority - x.priority || y.expectedUplift - x.expectedUplift);
}

/** Follow-up actions from the sample tracker, one per creator: chase, coach, ask for more content, reward, fresh video, stop. */
export async function sampleRecommendations(): Promise<Recommendation[]> {
  const { rows: score } = await getSampleScorecard();
  const TYPE: Partial<Record<SampleVerdict, SegmentKey>> = {
    chase: "sample_chase",
    stop: "stop_samples",
    more: "more_samples",
    more_content: "more_content",
    refresh: "refresh_content",
  };
  const out: Recommendation[] = [];
  for (const r of score) {
    const type = TYPE[r.verdict];
    if (!type || r.doNotContact) continue;
    const products = r.products || "our product";
    const msgInput = {
      username: r.username,
      products,
      verdict: r.verdict,
      deliveredLabel: r.oldestUnposted ? new Date(r.oldestUnposted + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "recently",
      contentGmv: r.contentGmv,
      videosSince: r.videosSince,
      posted: r.posted,
      lastVideoLabel: r.newestVideo ? new Date(r.newestVideo + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null,
    };
    const contact = r.phone ? `\n\nWhatsApp: ${r.phone} · https://wa.me/${r.phone.replace(/\D/g, "")}` : "";
    const title: Record<string, string> = {
      sample_chase: `Chase ${r.username} to post sample content`,
      stop_samples: `Pause samples for ${r.username}`,
      more_samples: `Offer ${r.username} another sample`,
      more_content: `Ask ${r.username} for more content`,
      refresh_content: `Ask ${r.username} for a fresh video`,
    };
    out.push({
      username: r.username,
      type,
      priority: priorityScore(type, r.contentGmv, r.value),
      title: title[type],
      reason: r.advice,
      instruction: waMessage(msgInput, "en") + contact,
      instructionMs: waMessage(msgInput, "ms") + contact,
      expectedUplift: Math.round(r.value),
      baselineGmv: Math.round(r.contentGmv),
    });
  }
  return out;
}

/**
 * Refresh the system's recommendations (latest 28 days). They live in their own table and carry no staff state:
 * refreshing only adds, updates or retires recommendations. Contacts, promises, pauses and follow-ups are
 * staff events and are never touched here.
 */
export async function generateActions(): Promise<{ created: number; total: number }> {
  const period = await resolvePeriod({ range: "28d" });
  const analysis = await analyse(period);
  const dnc = new Set(
    (await db.select({ u: creators.username }).from(creators).where(eq(creators.doNotContact, true))).map((r) => r.u),
  );
  // Creators in the sample tracker get precise per-sample follow-ups instead of the
  // coarser "sample, no content" signal from TikTok's sample analysis summary.
  const tracked = new Set(
    (await db.execute<{ creator: string }>(sql`select distinct creator from samples where source = 'orders' and creator is not null`)).map(
      (r) => r.creator,
    ),
  );
  const recs = [...allRecommendations(analysis), ...(await sampleRecommendations())].filter(
    (r) => !dnc.has(r.username) && !(r.type === "sample_no_post" && tracked.has(r.username)),
  );
  let created = 0;
  for (let i = 0; i < recs.length; i += 200) {
    const part = recs.slice(i, i + 200);
    const res = await db
      .insert(recommendations)
      .values(
        part.map((r) => ({
          username: r.username,
          type: r.type,
          priority: r.priority,
          title: r.title,
          reason: r.reason,
          instruction: r.instruction,
          instructionMs: r.instructionMs,
          scenarioValue: r.expectedUplift,
        })),
      )
      .onConflictDoUpdate({
        target: [recommendations.username, recommendations.type],
        set: {
          priority: sql`excluded.priority`,
          title: sql`excluded.title`,
          reason: sql`excluded.reason`,
          instruction: sql`excluded.instruction`,
          instructionMs: sql`excluded.instruction_ms`,
          scenarioValue: sql`excluded.scenario_value`,
          active: sql`true`,
          lastSeenAt: sql`now()`,
          resolvedAt: sql`null`,
        },
      })
      .returning({ created: sql<boolean>`(xmax = 0)` });
    created += res.filter((r) => r.created).length;
  }
  // Recommendations that no longer apply (e.g. the creator has since posted) are retired, not deleted.
  const keep = recs.map((r) => `${r.username}|${r.type}`);
  await db.execute(sql`
    update recommendations set active = false, resolved_at = now()
    where active and not (username || '|' || type = any(${keep.length ? sql`array[${sql.join(keep.map((k) => sql`${k}`), sql`, `)}]::text[]` : sql`'{}'::text[]`}))`);
  return { created, total: recs.length };
}

export const SEGMENT_LABEL = (k: SegmentKey) => SEGMENTS[k].label;
