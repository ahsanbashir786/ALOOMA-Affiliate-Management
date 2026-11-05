import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/analytics/sql";
import { skuFamily, suggestListing, type Families } from "./suggest";

/**
 * Works out which of the 13 products every TikTok listing is, from its title and what it mostly sells, and keeps the answer in
 * `product_map` (automatic; nobody edits it). Run whenever the Creators data is rebuilt, so a new listing or a better rule applies at once.
 * A listing that cannot be recognised has no row and shows as "Unmapped product" (last in every list).
 */
export async function refreshProductKeys(): Promise<void> {
  const [titles, fams, have] = await Promise.all([
    rows<{ product_id: string; title: string | null }>(sql`
      select i.product_id, coalesce((select max(product_title) from tt_skus k where k.product_id = i.product_id), (select max(product_title) from tt_sample_requests r where r.product_id = i.product_id)) as title
      from (select product_id from tt_skus where product_id is not null union select product_id from tt_affiliate_order_lines where product_id is not null union select product_id from tt_sample_requests where product_id is not null) i`),
    rows<{ product_id: string; sku: string | null; n: number }>(sql`select product_id, seller_sku as sku, count(*)::int as n from tt_affiliate_order_lines where product_id is not null group by 1, 2`),
    rows<{ product_id: string; product_key: string }>(sql`select product_id, product_key from product_map`),
  ]);
  const famBy = new Map<string, Families>();
  for (const f of fams) { const m = famBy.get(f.product_id) ?? famBy.set(f.product_id, {}).get(f.product_id)!; const k = skuFamily(f.sku); if (k) m[k] = (m[k] ?? 0) + f.n; }
  const stored = new Map(have.map((h) => [h.product_id, h.product_key]));
  for (const t of titles) {
    const key = suggestListing(t.title, famBy.get(t.product_id) ?? {}).key;
    if (key && stored.get(t.product_id) !== key) await rows(sql`insert into product_map (product_id, product_key) values (${t.product_id}, ${key}) on conflict (product_id) do update set product_key = excluded.product_key, updated_at = now()`);
    else if (!key && stored.has(t.product_id)) await rows(sql`delete from product_map where product_id = ${t.product_id}`);
  }
}
