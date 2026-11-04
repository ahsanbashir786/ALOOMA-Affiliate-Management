// Ready-to-send WhatsApp text for each action, in English and Bahasa Melayu. Pure (safe in client components).
import type { CreatorAction } from "./status";

export type ActionMsgInput = { username: string; product: string; videos28: number; lastVideoLabel: string | null };

/** Returns null for actions that need no message (Keep, Wait, Resume). */
export function actionMessage(action: CreatorAction, m: ActionMsgInput): { en: string; ms: string } | null {
  const hi = `Hi ${m.username}, `;
  const hiMs = `Hai ${m.username}, `;
  switch (action) {
    case "Push":
      return {
        en: `${hi}your ${m.product} content is doing really well – thank you! 🎉\n\nCould you post ${m.videos28 <= 1 ? "2 more videos" : "a fresh video"} for it this week? A "part 2" of your best video with a new angle works well. Need a brief or a voucher code? Just reply.`,
        ms: `${hiMs}kandungan ${m.product} awak memang berjaya – terima kasih! 🎉\n\nBoleh awak upload ${m.videos28 <= 1 ? "2 video lagi" : "satu video baharu"} untuk produk ini minggu ini? "Part 2" video terbaik awak dengan sudut baharu memang berkesan. Perlukan brief atau kod baucar? Balas sahaja.`,
      };
    case "Reward":
      return {
        en: `${hi}thank you for the great ${m.product} content – it is selling well! 🎉\n\nWe would like to send you another free sample. Which product or size would you like next?`,
        ms: `${hiMs}terima kasih untuk kandungan ${m.product} yang hebat – jualannya bagus! 🎉\n\nKami nak hantar satu lagi sampel percuma. Produk atau saiz apa yang awak mahu seterusnya?`,
      };
    case "Revive":
      return {
        en: `${hi}we have missed your ${m.product} videos${m.lastVideoLabel ? ` (the last one was ${m.lastVideoLabel})` : ""}! 😊\n\nCould you post a fresh video or a sequel? Happy to send a new sample or a short brief if that helps.`,
        ms: `${hiMs}kami rindu video ${m.product} awak${m.lastVideoLabel ? ` (yang terakhir pada ${m.lastVideoLabel})` : ""}! 😊\n\nBoleh awak upload video baharu atau sambungan? Kami boleh hantar sampel baharu atau brief ringkas jika perlu.`,
      };
    case "Chase":
      return {
        en: `${hi}hope you're well! 😊 Your free sample (${m.product}) has arrived – we'd love to see your video.\n\nCould you let us know when you plan to post? Tag the product so viewers can tap the yellow basket. Need a brief? Just reply.`,
        ms: `${hiMs}harap awak sihat! 😊 Sampel percuma awak (${m.product}) sudah sampai – kami teringin tengok video awak.\n\nBoleh beritahu bila awak merancang untuk upload? Tag produk supaya penonton boleh tekan bakul kuning. Perlukan brief? Balas sahaja.`,
      };
    case "Coach":
      return {
        en: `${hi}thank you for posting with ${m.product}! 🙌 Let's turn more viewers into buyers:\n• Show the product in use in the first 5 seconds.\n• Say the key benefit and the offer out loud, and tell viewers to tap the yellow basket.\n• Pin a comment with the product name and any voucher.\nWant us to share a brief or a voucher code?`,
        ms: `${hiMs}terima kasih sebab upload video dengan ${m.product}! 🙌 Jom ubah lebih ramai penonton jadi pembeli:\n• Tunjukkan produk digunakan dalam 5 saat pertama.\n• Sebut manfaat utama dan tawaran dengan jelas, dan minta penonton tekan bakul kuning.\n• Pin komen dengan nama produk dan baucar.\nNak kami kongsikan brief atau kod baucar?`,
      };
    case "Approach":
      return {
        en: `${hi}we love your content and think our ${m.product} would suit your audience.\n\nWe'd like to send you a free sample and share a simple brief. Interested? Reply here and we'll set it up.`,
        ms: `${hiMs}kami suka kandungan awak dan rasa ${m.product} kami sesuai untuk penonton awak.\n\nKami nak hantar sampel percuma dan kongsi brief mudah. Berminat? Balas di sini dan kami akan uruskan.`,
      };
    default:
      return null;
  }
}
