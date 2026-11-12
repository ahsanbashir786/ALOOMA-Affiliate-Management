// SKU codes are matched without caring about upper or lower case (Quilt-C-K-WH = QUILT-C-K-WH), and known spelling pairs are joined.
const ALIASES: Record<string, string> = {
  "LUMB-PLW-STORM-GRAY": "LUMB-PLW-STORM-GREY",
  "SQ-PWL-WH": "SQ-PLW-WH", // the SKU list spells the cushion pillow with the letters swapped
  "LUMB-PLW-UNSPECIFIED": "LUMB-PLW-WH", // order 25 did not state the colour; the warehouse received it as the white lumbar pillow
};

export function normSku(s: unknown): string {
  const t = String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return ALIASES[t] ?? t;
}

/** The Fulfilled-by-Shopee version of a SKU has the same parts as the normal one. */
export function stripFbs(sku: string): string {
  return sku.startsWith("FBS-") ? sku.slice(4) : sku;
}
