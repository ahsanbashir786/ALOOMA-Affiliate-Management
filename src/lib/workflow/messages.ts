// Plain, polite follow-up texts for cases with no specific recommendation (EN / BM). Pure – safe in client components.
export type FollowKind = "promise" | "follow_up" | "help" | "resume";

export function followUpMessage(username: string, kind: FollowKind, promisedLabel?: string | null): { en: string; ms: string } {
  if (kind === "promise")
    return {
      en: `Hi ${username}, just a friendly check-in – you mentioned you'd post${promisedLabel ? ` by ${promisedLabel}` : ""}. How is it going? Let us know if you need a brief, a voucher or anything else from us. 😊`,
      ms: `Hai ${username}, sekadar bertanya khabar – awak ada sebut akan upload${promisedLabel ? ` pada ${promisedLabel}` : ""}. Macam mana setakat ini? Beritahu kami kalau awak perlukan brief, baucar atau apa-apa bantuan. 😊`,
    };
  return {
    en: `Hi ${username}, hope you're well! Just following up on our last message. Is there anything we can help with – a brief, a voucher or a product question? 😊`,
    ms: `Hai ${username}, harap awak sihat! Sekadar menyusuli mesej kami yang lepas. Ada apa-apa yang boleh kami bantu – brief, baucar atau soalan produk? 😊`,
  };
}
