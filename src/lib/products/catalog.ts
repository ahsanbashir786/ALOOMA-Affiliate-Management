// ALOOMA's 13 products, in the order the owner wants them listed everywhere. Pure (safe in client components).
// A TikTok listing (product ID) or a single SKU is mapped to exactly one of these, or to "excluded" (no longer sold).

export type ProductKey =
  | "mp_nwp" | "mp_wp" | "quilt" | "pillows" | "bs_nwp" | "bs_wp" | "bs_nwp_set" | "bs_wp_set"
  | "towel_cotton" | "towel_coral" | "mp_nwp_x" | "mp_wp_x" | "pillow_protectors";

export const PRODUCTS: { key: ProductKey; name: string }[] = [
  { key: "mp_nwp", name: "Mattress Protector · Non-Waterproof" },
  { key: "mp_wp", name: "Mattress Protector · Waterproof" },
  { key: "quilt", name: "Quilt Comforter" },
  { key: "pillows", name: "Pillows" },
  { key: "bs_nwp", name: "Bedsheet · Non-Waterproof (Single Item)" },
  { key: "bs_wp", name: "Bedsheet · Waterproof (Single Item)" },
  { key: "bs_nwp_set", name: "Bedsheet · Non-Waterproof (Set)" },
  { key: "bs_wp_set", name: "Bedsheet · Waterproof (Set)" },
  { key: "towel_cotton", name: "Cotton Towel" },
  { key: "towel_coral", name: "Coral Fleece Towel" },
  { key: "mp_nwp_x", name: "Mattress Protector · Non-Waterproof (Exclusive)" },
  { key: "mp_wp_x", name: "Mattress Protector · Waterproof (Exclusive)" },
  { key: "pillow_protectors", name: "Pillow Protectors" },
];
/** Not sold any more (toys, other shops' products): never shown or counted. */
export const EXCLUDED = "excluded";
/** No decision yet: shown, last, and counted in the coverage warning. */
export const UNMAPPED = "unmapped";

const RANK = new Map<string, number>(PRODUCTS.map((p, i) => [p.key, i]));
const NAME = new Map<string, string>(PRODUCTS.map((p) => [p.key, p.name]));

export const isProductKey = (k: string): k is ProductKey => RANK.has(k);
export const isMappable = (k: string) => RANK.has(k) || k === EXCLUDED;
/** Position in the owner's order; unknown keys (and "unmapped") go last. */
export const productRank = (k: string | null | undefined) => (k && RANK.has(k) ? RANK.get(k)! : PRODUCTS.length + (k === UNMAPPED ? 0 : 1));
export const productName = (k: string | null | undefined) => (k && NAME.get(k)) || (k === EXCLUDED ? "Excluded" : "Unmapped product");
