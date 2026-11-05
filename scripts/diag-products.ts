export {};
// Read-only list of every product ID found in the synced data, so each can be matched to one of the 13 ALOOMA products.
//   npm run diag:products
async function main() {
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];

  const prods = await q(sql`
    with ids as (
      select product_id from tt_skus where product_id is not null
      union select product_id from tt_affiliate_order_lines where product_id is not null
      union select product_id from tt_sample_requests where product_id is not null)
    select i.product_id,
      (select max(product_title) from tt_skus k where k.product_id = i.product_id) as title,
      (select max(product_title) from tt_sample_requests r where r.product_id = i.product_id) as req_title,
      (select min(price) from tt_skus k where k.product_id = i.product_id)::float8 as pmin,
      (select max(price) from tt_skus k where k.product_id = i.product_id)::float8 as pmax,
      (select count(*) from tt_skus k where k.product_id = i.product_id)::int as skus,
      (select count(distinct order_id) from tt_affiliate_order_lines a where a.product_id = i.product_id)::int as orders,
      (select count(distinct creator) from tt_affiliate_order_lines a where a.product_id = i.product_id)::int as creators,
      (select round(sum(coalesce(price,0) * coalesce(quantity,1))) from tt_affiliate_order_lines a where a.product_id = i.product_id)::float8 as gmv,
      (select count(*) from tt_sample_requests r where r.product_id = i.product_id)::int as samples
    from ids i order by orders desc, samples desc`);

  console.log(`\nProduct IDs found: ${prods.length}\n`);
  for (const p of prods) {
    const names = await q(sql`select sku_name, count(*)::int as n from tt_affiliate_order_lines where product_id = ${p.product_id as string} and sku_name is not null group by sku_name order by n desc limit 4`);
    const codes = await q(sql`select seller_sku from tt_skus where product_id = ${p.product_id as string} and seller_sku is not null order by seller_sku limit 3`);
    console.log(`${p.product_id} | ${String(p.title ?? p.req_title ?? "title unknown").slice(0, 90)}`);
    console.log(`   price RM ${p.pmin ?? "?"}–${p.pmax ?? "?"} | ${p.skus} SKUs | ${p.orders} orders | ${p.creators} creators | RM ${p.gmv ?? 0} | ${p.samples} sample requests`);
    if (names.length) console.log(`   variations: ${names.map((n) => String(n.sku_name)).join(" / ")}`);
    if (codes.length) console.log(`   SKU codes: ${codes.map((c) => String(c.seller_sku)).join(", ")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
