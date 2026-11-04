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
  lastVideoDaysAgo?: number | null;
  action: CreatorAction;
  status: string;
};
export const statsOf = (l: LineStats): LineStats => ({ name: l.name, orders: l.orders, gmv: l.gmv, gmvVideo: l.gmvVideo, gmvLive: l.gmvLive, videos: l.videos, videos28: l.videos28, lastVideoLabel: l.lastVideoLabel, lastVideoDaysAgo: l.lastVideoDaysAgo, action: l.action, status: l.status });
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

/** How long since the last video, in plain words ("last video 90 days ago (12 Aug)"). */
const lastVid = (l: LineStats, ms: boolean) => {
  if (l.videos <= 0) return ms ? "Belum ada video" : "No video posted yet";
  const ago = l.lastVideoDaysAgo != null && l.lastVideoDaysAgo >= 14 ? (ms ? ` (${l.lastVideoDaysAgo} hari lalu)` : ` (${l.lastVideoDaysAgo} days ago)`) : "";
  return ms ? `${l.videos} video, terakhir ${l.lastVideoLabel ?? "?"}${ago}` : `${l.videos} video${l.videos === 1 ? "" : "s"}, last on ${l.lastVideoLabel ?? "?"}${ago}`;
};

// Opening (thanks / encouragement) by status, closing request by action. Short, polite, motivating.
const OPEN: Record<string, (p: string) => Msg> = {
  Winner: (p) => ({ en: `Amazing work on ${p}! 🎉`, ms: `Syabas untuk ${p}! 🎉` }),
  Rising: (p) => ({ en: `Great momentum on ${p}! 🚀`, ms: `Prestasi ${p} makin naik! 🚀` }),
  Steady: (p) => ({ en: `Thank you for selling ${p} steadily 🙏`, ms: `Terima kasih sebab terus menjual ${p} 🙏` }),
  Slipping: (p) => ({ en: `${p} did really well for you earlier – let's bring it back up 💪`, ms: `${p} dulu laku untuk awak – jom naikkan semula 💪` }),
  Quiet: (p) => ({ en: `We miss your ${p} videos 😊`, ms: `Kami rindu video ${p} awak 😊` }),
  Silent: (p) => ({ en: `Hope you're well! 😊 Your ${p} sample has arrived.`, ms: `Harap awak sihat! 😊 Sampel ${p} awak sudah sampai.` }),
  Posted: (p) => ({ en: `Thank you for posting ${p}! 🙌`, ms: `Terima kasih upload ${p}! 🙌` }),
};
const CLOSE: Record<CreatorAction, Msg | null> = {
  Push: { en: "You're one of our best – could you post 2 more videos this week? We'll support you with a brief.", ms: "Awak antara yang terbaik – boleh upload 2 video lagi minggu ini? Kami bantu dengan brief." },
  Reward: { en: "You've earned it – we'd love to send you another sample. Which one next?", ms: "Awak layak – kami nak hantar sampel lagi. Yang mana seterusnya?" },
  Revive: { en: "One fresh video could bring those orders back – could you post one soon?", ms: "Satu video baharu boleh bawa balik pesanan itu – boleh upload tak lama lagi?" },
  Chase: { en: "We'd love to see your video – when do you plan to post? Need a brief? Just reply.", ms: "Kami teringin tengok video awak – bila awak nak upload? Perlukan brief? Balas sahaja." },
  Coach: { en: "Want a hook idea or voucher code to turn views into orders? Happy to share!", ms: "Nak idea hook atau kod baucar untuk tukar tontonan jadi pesanan? Kami kongsi!" },
  Approach: null, Resume: null, Keep: null, Wait: null,
};

/** Short message about ONE product: thanks by status, the numbers (LIVE only if any), last video age, then one clear request. */
export function lineMessage(action: CreatorAction, username: string, product: string | null, l: LineStats | null, period: string): Msg | null {
  if (action === "Approach") {
    const p = product ?? "our products";
    return {
      en: `Hi ${username}, we love your content and think our ${p} would suit your audience. Want a free sample? Reply here and we'll set it up.`,
      ms: `Hai ${username}, kami suka kandungan awak dan rasa ${p} kami sesuai untuk penonton awak. Nak sampel percuma? Balas di sini dan kami uruskan.`,
    };
  }
  const close = CLOSE[action];
  if (!close || !l) return null;
  const open = (OPEN[l.status] ?? OPEN.Steady)(product ?? l.name);
  const nums = (ms: boolean) => {
    const o = numbers(l, ms)[0];
    return `• ${o} · ${period}\n• ${lastVid(l, ms)}`;
  };
  return {
    en: `Hi ${username}, ${open.en}\n${nums(false)}\n${close.en}`,
    ms: `Hai ${username}, ${open.ms}\n${nums(true)}\n${close.ms}`,
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
    en: `Hi ${username}, ${gmv > 0 ? "thank you for being a great partner! 🙌" : "thank you for working with us! 🙏"} Your summary (${period}):\n${rows(false)}\nTotal: ${orders} orders, ${rm(gmv)}.\n${asksEn.join("\n")} ${gmv > 0 ? "You're doing great – let's grow it together! 🚀" : "Let's get your first sales going! 💪"}`,
    ms: `Hai ${username}, ${gmv > 0 ? "terima kasih kerana jadi rakan kongsi yang hebat! 🙌" : "terima kasih kerana bekerjasama dengan kami! 🙏"} Ringkasan awak (${period}):\n${rows(true)}\nJumlah: ${orders} pesanan, ${rm(gmv)}.\n${asksMs.join("\n")} ${gmv > 0 ? "Awak buat dengan baik – jom berkembang bersama! 🚀" : "Jom mulakan jualan pertama awak! 💪"}`,
  };
}
