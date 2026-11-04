// Ready-to-send WhatsApp texts built from the creator's own numbers, in English and Bahasa Melayu. Pure (safe in client components).
import type { CreatorAction } from "./status";

/** One sampled product, in the period the table is showing. */
export type LineStats = {
  name: string;
  orders: number;
  gmv: number;
  gmvVideo: number;
  gmvLive: number;
  videos: number;
  videos28: number;
  lastVideoLabel: string | null;
  action: CreatorAction;
  status: string;
};
export const statsOf = (l: LineStats): LineStats => ({ name: l.name, orders: l.orders, gmv: l.gmv, gmvVideo: l.gmvVideo, gmvLive: l.gmvLive, videos: l.videos, videos28: l.videos28, lastVideoLabel: l.lastVideoLabel, action: l.action, status: l.status });
export type Msg = { en: string; ms: string };

const rm = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;

function numbers(l: LineStats, ms: boolean): string[] {
  const out: string[] = [];
  if (l.orders > 0) {
    const split = [l.gmvVideo > 0 ? `${ms ? "video" : "video"} ${rm(l.gmvVideo)}` : null, l.gmvLive > 0 ? `LIVE ${rm(l.gmvLive)}` : null].filter(Boolean).join(" · ");
    out.push(ms ? `${l.orders} pesanan, ${rm(l.gmv)}${split ? ` (${split})` : ""}` : `${l.orders} orders, ${rm(l.gmv)}${split ? ` (${split})` : ""}`);
  } else out.push(ms ? "Belum ada pesanan" : "No orders yet");
  if (l.videos > 0) out.push(ms ? `${l.videos} video dimuat naik${l.lastVideoLabel ? `, terakhir ${l.lastVideoLabel}` : ""}` : `${l.videos} video${l.videos === 1 ? "" : "s"} posted${l.lastVideoLabel ? `, last on ${l.lastVideoLabel}` : ""}`);
  else out.push(ms ? "Belum ada video" : "No video posted yet");
  return out;
}

const REQ: Record<CreatorAction, Msg | null> = {
  Push: { en: "Could you post 2 more videos for it this week?", ms: "Boleh awak upload 2 video lagi untuk produk ini minggu ini?" },
  Reward: { en: "Thank you! We'd like to send you another sample – which product next?", ms: "Terima kasih! Kami nak hantar satu lagi sampel – produk apa seterusnya?" },
  Revive: { en: "Could you post a fresh video for it?", ms: "Boleh awak upload video baharu untuk produk ini?" },
  Chase: { en: "Could you let us know when you plan to post?", ms: "Boleh beritahu bila awak merancang untuk upload?" },
  Coach: { en: "Want a hook idea or voucher code to lift sales?", ms: "Nak idea hook atau kod baucar untuk tingkatkan jualan?" },
  Approach: null, Resume: null, Keep: null, Wait: null,
};

/** Short message about ONE product: its orders, GMV (video / LIVE only if any), videos and last video, then the request. */
export function lineMessage(action: CreatorAction, username: string, product: string | null, l: LineStats | null, period: string): Msg | null {
  if (action === "Approach") {
    const p = product ?? "our products";
    return {
      en: `Hi ${username}, we love your content and think our ${p} would suit your audience. Want a free sample? Reply here and we'll set it up.`,
      ms: `Hai ${username}, kami suka kandungan awak dan rasa ${p} kami sesuai untuk penonton awak. Nak sampel percuma? Balas di sini dan kami uruskan.`,
    };
  }
  const req = REQ[action];
  if (!req || !l) return null;
  const en = numbers(l, false).map((x) => `• ${x}`).join("\n");
  const ms = numbers(l, true).map((x) => `• ${x}`).join("\n");
  return {
    en: `Hi ${username}, your ${product ?? l.name} (${period}):\n${en}\n${req.en}`,
    ms: `Hai ${username}, ${product ?? l.name} awak (${period}):\n${ms}\n${req.ms}`,
  };
}

/** One message for every product she received: a line each, the total, and what we ask for next (worked out from the numbers). */
export function overviewMessage(username: string, all: LineStats[], period: string): Msg | null {
  const ls = all.filter((l) => l.name);
  if (!ls.length) return null;
  const orders = ls.reduce((n, l) => n + l.orders, 0);
  const gmv = ls.reduce((n, l) => n + l.gmv, 0);
  const rows = (ms: boolean) => ls.map((l) => `• ${l.name}: ${l.orders > 0 ? (ms ? `${l.orders} pesanan, ${rm(l.gmv)}` : `${l.orders} orders, ${rm(l.gmv)}`) : ms ? "belum ada pesanan" : "no orders yet"}, ${l.videos > 0 ? (ms ? `${l.videos} video` : `${l.videos} video${l.videos === 1 ? "" : "s"}`) : ms ? "belum ada video" : "no video yet"}`).join("\n");
  const selling = ls.filter((l) => l.gmv > 0).sort((a, b) => b.gmv - a.gmv);
  const fewVideos = selling.filter((l) => l.videos <= 2).sort((a, b) => b.gmv - a.gmv)[0];
  const unposted = ls.filter((l) => l.videos === 0 && l.gmv === 0).map((l) => l.name);
  const top = selling[0];
  const asksEn: string[] = [];
  const asksMs: string[] = [];
  if (fewVideos) { asksEn.push(`${fewVideos.name} sells well from only ${fewVideos.videos} video${fewVideos.videos === 1 ? "" : "s"} – could you post more for it?`); asksMs.push(`${fewVideos.name} laku dengan hanya ${fewVideos.videos} video – boleh upload lebih untuknya?`); }
  if (unposted.length) { asksEn.push(`Still waiting for your video on ${unposted.slice(0, 2).join(" and ")}.`); asksMs.push(`Masih menunggu video awak untuk ${unposted.slice(0, 2).join(" dan ")}.`); }
  if (top && (top.status === "Winner" || top.status === "Rising")) { asksEn.push(`We'd love to send you a new sample to take you to the next level – which one would you like?`); asksMs.push(`Kami nak hantar sampel baharu untuk bawa awak ke tahap seterusnya – awak nak yang mana?`); }
  if (!asksEn.length) { asksEn.push("Could you post a fresh video for one of them this week?"); asksMs.push("Boleh upload video baharu untuk salah satunya minggu ini?"); }
  return {
    en: `Hi ${username}, your summary with us (${period}):\n${rows(false)}\nTotal: ${orders} orders, ${rm(gmv)}.\n${asksEn.join("\n")}`,
    ms: `Hai ${username}, ringkasan awak bersama kami (${period}):\n${rows(true)}\nJumlah: ${orders} pesanan, ${rm(gmv)}.\n${asksMs.join("\n")}`,
  };
}
