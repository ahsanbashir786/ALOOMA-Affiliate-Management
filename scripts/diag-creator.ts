export {};
// Read-only check of one creator: what the TikTok sync stored about her samples and sales, so a missing sample can be traced.
//   npm run diag:creator <username>
const username = (process.argv[2] ?? "").replace(/^@/, "");
if (!username) { console.error("Usage: npm run diag:creator <username>"); process.exit(1); }

async function main() {
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  const title = (id: unknown) => String(id ?? "");

  const [ctx] = await q(sql`select count(*)::int as n, to_char(min(first_seen_at), 'YYYY-MM-DD') as oldest, to_char(max(first_seen_at), 'YYYY-MM-DD') as newest from tt_sample_requests`);
  console.log(`\nAll sample requests stored: ${ctx.n} (first seen ${ctx.oldest} to ${ctx.newest})`);

  const reqs = await q(sql`
    select r.id, r.status, r.product_id, r.sku_id, left(r.product_title, 50) as product, r.order_id, to_char(r.first_seen_at, 'YYYY-MM-DD') as seen,
      o.status as order_status, to_char(o.delivered_at, 'YYYY-MM-DD') as delivered, o.is_sample
    from tt_sample_requests r left join tt_orders o on o.order_id = r.order_id where r.creator = ${username} order by r.first_seen_at`);
  console.log(`\nSample requests stored for @${username}: ${reqs.length}`);
  for (const r of reqs) console.log(`  ${title(r.product_id)} | ${title(r.product)} | status ${title(r.status)} | order ${r.order_id ?? "NONE"} ${r.order_id ? `(${title(r.order_status) || "order not loaded"}, delivered ${r.delivered ?? "–"})` : ""} | seen ${r.seen}`);
  if (!reqs.length) console.log("  → none. TikTok did not return any sample request for this creator.");

  const sold = await q(sql`
    select a.product_id, left(max(k.product_title), 50) as product, count(distinct a.order_id)::int as orders, round(sum(coalesce(a.price,0) * coalesce(a.quantity,1)))::int as gmv,
      array_agg(distinct a.seller_sku) filter (where a.seller_sku is not null) as skus
    from tt_affiliate_order_lines a left join tt_skus k on k.product_id = a.product_id where a.creator = ${username} group by a.product_id order by gmv desc`);
  console.log(`\nProducts she sold (from affiliate orders): ${sold.length}`);
  for (const s of sold) {
    const has = reqs.some((r) => r.product_id === s.product_id);
    console.log(`  ${title(s.product_id)} | ${title(s.product) || "title unknown"} | ${s.orders} orders RM ${s.gmv} | ${(s.skus as string[] | null)?.slice(0, 4).join(", ")} | ${has ? "HAS a stored sample request" : "no sample request with this product ID"}`);
  }

  const vids = await q(sql`select count(*)::int as n, to_char(min(posted_at), 'YYYY-MM-DD') as oldest from tt_videos where creator = ${username}`);
  console.log(`\nVideos stored for her: ${vids[0].n} (oldest ${vids[0].oldest ?? "–"})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
