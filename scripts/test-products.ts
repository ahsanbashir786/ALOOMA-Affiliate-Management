export {};
// Product mapping tests: the 13 products, suggestions, add-on SKUs, coverage. Needs a *_test database.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 300) : "")); };

async function main() {
  const { PRODUCTS, productName, productRank, isMappable, EXCLUDED, UNMAPPED } = await import("../src/lib/products/catalog");
  const { suggestListing, skuFamily } = await import("../src/lib/products/suggest");

  // ── catalogue ──
  check("catalogue: 13 products in the owner's order", PRODUCTS.length === 13 && PRODUCTS[0].name === "Mattress Protector · Non-Waterproof" && PRODUCTS[2].name === "Quilt Comforter" && PRODUCTS[12].name === "Pillow Protectors", PRODUCTS.map((p) => p.key).join());
  check("catalogue: ranks follow the order, unmapped is after the 13, unknown last", productRank("mp_nwp") === 0 && productRank("pillow_protectors") === 12 && productRank(UNMAPPED) === 13 && productRank("zzz") === 14 && productRank(null) === 14);
  check("catalogue: names and valid keys", productName("towel_coral") === "Coral Fleece Towel" && productName(EXCLUDED) === "Excluded" && productName("nope") === "Unmapped product" && isMappable("mp_wp") && isMappable(EXCLUDED) && !isMappable("nope") && !isMappable(UNMAPPED));
  check("sku family is the part before the first dash", skuFamily("WPMP-Q-WH-ST") === "WPMP" && skuFamily("nmp-k") === "NMP" && skuFamily(null) === "");

  // ── suggestions from titles and what a listing sells ──
  const WPL = "ALOOMA Washable Quilted THICK Mattress Protector | Sejuk Pelapik Tilam Kallis Air Kencing";
  const NWPL = "ALOOMA Washable Quilted THICK Mattress Protector | Lembut Sejuk Pelapik Tilam Tebal | Anti Dust Mite";
  const wpFam = { WPMP: 2936, WP: 181, ERGONOMIC: 57, STD: 52, BOLS: 35, LUMB: 26 }, nwpFam = { NMP: 2556, NWP: 207, STD: 41, LUMB: 36, BOLS: 30, ERGONOMIC: 29 };
  check("suggest: mostly WPMP sold → Waterproof Mattress Protector (high)", suggestListing(WPL, wpFam).key === "mp_wp" && suggestListing(WPL, wpFam).confidence === "high");
  check("suggest: mostly NMP sold → Non-Waterproof, even if the title mentions anti dust mite", suggestListing(NWPL, nwpFam).key === "mp_nwp");
  check("suggest: Exclusive listings", suggestListing("{Exclusive} " + NWPL, { NMP: 1371, NWP: 85, STD: 25 }).key === "mp_nwp_x" && suggestListing("{Exclusive} " + WPL, { WPMP: 235, WP: 19 }).key === "mp_wp_x");
  const clash = suggestListing(WPL, { NMP: 900, NWP: 60 });
  check("suggest: sales say non-waterproof but the title says waterproof → follows the sales, marked medium", clash.key === "mp_nwp" && clash.confidence === "medium", JSON.stringify(clash));
  check("suggest: no sales yet → title wording only; unclear → no suggestion", suggestListing(WPL, {}).key === "mp_wp" && suggestListing(NWPL, {}).key === null);
  const BS = "ALOOMA Plain Premium Fitted Bedsheet / Pillowcase / Bolster Case, Lembut, Sejuk";
  check("suggest: bedsheets – single or set, waterproof or not", suggestListing(BS).key === "bs_nwp" && suggestListing("ALOOMA Waterproof Plain Premium Fitted Bedsheet / Pillowcase").key === "bs_wp" && suggestListing("ALOOMA Set Plain Premium Fitted Bedsheet / Pillowcase").key === "bs_nwp_set" && suggestListing("ALOOMA Set Waterproof Plain Premium Fitted Bedsheet").key === "bs_wp_set" && suggestListing("ALOOMA Waterproof Set Plain Premium Fitted Bedsheet").key === "bs_wp_set");
  check("suggest: towels, pillows, quilt, pillow protector", suggestListing("ALOOMA 100% Cotton Bath Towel 70x140cm").key === "towel_cotton" && suggestListing("ALOOMA Premium Coral Fleece Bath Towel | Tuala Mandi").key === "towel_coral" && suggestListing("ALOOMA Kualiti Premium Bantal Tidur 100% Premium Quality Hotel Pillow").key === "pillows" && suggestListing("ALOOMA Premium Selimut Lembut Sejuk | Duvet Quilt Comforter").key === "quilt" && suggestListing("LOOMA Premium Duvet Quilt Comforter | Tebal").key === "quilt" && suggestListing("ALOOMA Pillow Protector Tebal Lembut Sejuk 51x75 cm | Anti-Dust Mite & Waterproof").key === "pillow_protectors" && suggestListing("ALOOMA Washable Quilted THICK Pillow Protector | Lembut").key === "pillow_protectors");
  check("suggest: other brands and toys are excluded", suggestListing("Magnetic Stick Toy Balls Building Blocks 25/42/64").key === EXCLUDED && suggestListing("【TENDER TWIGS】Kids Magical Tracing Workbook").key === EXCLUDED);
  check("suggest: no title → no suggestion", suggestListing(null).key === null && suggestListing("ALOOMA Something New Entirely").key === null);

  // ── database: seeding, add-ons, coverage ──
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  for (const t of ["tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_orders", "tt_skus", "product_map", "sku_map", "product_map_log"]) await q(sql.raw(`delete from ${t}`));
  const MP = "1111111111", PL = "2222222222", TOY = "3333333333", NEWP = "4444444444", MPX = "5555555555";
  await q(sql`insert into tt_skus (sku_id, product_id, product_title, seller_sku, price, stock) values
    ('S1', ${MP}, ${NWPL}, 'NMP-Q-WH-ST', 59, 1), ('S2', ${PL}, 'ALOOMA Kualiti Premium Bantal Tidur Hotel Pillow', 'STD-PLW-WH', 30, 1),
    ('S3', ${TOY}, 'Magnetic Stick Toy Balls', 'MST25', 35, 1), ('S4', ${MPX}, ${"{Exclusive} " + NWPL}, 'NMP-Q-WH-ST', 59, 1)`);
  let n = 0;
  const line = (pid: string, sku: string, seller: string, count: number) => (async () => { for (let i = 0; i < count; i++) await q(sql`insert into tt_affiliate_order_lines (order_id, sku_id, created_at, creator, content_type, product_id, seller_sku, quantity, price) values (${"T" + ++n}, ${sku}, now(), 'zz_p', 'VIDEO', ${pid}, ${seller}, 1, 10)`); })();
  await line(MP, "S1", "NMP-Q-WH-ST", 60);          // the mattress protector listing: mostly NMP
  await line(MP, "S1b", "STD-PLW-WH", 4);           // a pillow add-on sold inside it (4 of 64 lines = 6%)
  await line(PL, "S2", "STD-PLW-WH", 30);           // pillows listing: STD is its main item
  await line(MPX, "S4", "NMP-Q-WH-ST", 25);         // the Exclusive twin sells the same NMP SKU: NOT an add-on
  await line(TOY, "S3", "MST25", 3);
  await line(NEWP, "S9", "ZZ-1", 2);                // a listing with no title: stays unmapped

  const { ensureSuggested, getMappingView } = await import("../src/lib/products/mapping");
  const added = await ensureSuggested();
  const maps = new Map((await q(sql`select product_id, product_key, confirmed from product_map`)).map((r) => [r.product_id as string, r]));
  check("seed: listings with a suggestion get an unconfirmed mapping; unknown ones get none", added === 4 && maps.get(MP)?.product_key === "mp_nwp" && maps.get(PL)?.product_key === "pillows" && maps.get(TOY)?.product_key === EXCLUDED && maps.get(MPX)?.product_key === "mp_nwp_x" && !maps.has(NEWP) && [...maps.values()].every((m) => m.confirmed === false), `${added} ${JSON.stringify([...maps.entries()])}`);
  check("seed: running it again adds nothing", (await ensureSuggested()) === 0);

  const v = await getMappingView();
  check("view: add-on pillow SKU inside the mattress protector listing is found and suggested as Pillows", v.addons.length === 1 && v.addons[0].skuId === "S1b" && v.addons[0].suggestedKey === "pillows" && v.addons[0].listingKey === "mp_nwp", JSON.stringify(v.addons));
  check("view: the same SKU sold evenly in the normal and Exclusive listing is not an add-on", !v.addons.some((a) => a.sellerSku === "NMP-Q-WH-ST"));
  check("view: coverage adds up and shows what is unmapped", v.coverage.adds && v.coverage.totalLines === 124 && v.coverage.unmappedLines === 2 && v.coverage.rows.find((r) => r.key === "pillows")?.lines === 30 && v.coverage.rows.find((r) => r.key === EXCLUDED)?.lines === 3, JSON.stringify(v.coverage));
  check("view: an owner's add-on decision moves its lines to that product", await (async () => {
    await q(sql`insert into sku_map (sku_id, product_id, product_key) values ('S1b', ${MP}, 'pillows')`);
    const v2 = await getMappingView();
    return v2.coverage.adds && v2.coverage.rows.find((r) => r.key === "pillows")?.lines === 34 && v2.coverage.rows.find((r) => r.key === "mp_nwp")?.lines === 60 && v2.addons[0].overrideKey === "pillows";
  })());
  check("view: unconfirmed listings are counted", v.unconfirmed === 4 && v.listings.length === 5);

  for (const t of ["tt_affiliate_order_lines", "tt_skus", "product_map", "sku_map", "product_map_log"]) await q(sql.raw(`delete from ${t}`));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
