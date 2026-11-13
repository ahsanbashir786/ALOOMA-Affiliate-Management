process.env.SWR_OFF = "1";
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

  // ── Products module rules (pure) ──
  const { bucketOfAge, tagOf, diagnose, oldShare } = await import("../src/lib/products/diagnose");
  const zero = { new: 0, recent: 0, old: 0, veryold: 0, live: 0, other: 0 };
  const M = (now: number, prev: number, over: Record<string, unknown> = {}) => ({
    sales: { now, prev }, creators: { now: 5, prev: 5 }, newCreators: { count: 0, sales: 0 },
    buckets: { now: { ...zero, new: now * 0.5, old: now * 0.5 }, prev: { ...zero, new: prev * 0.5, old: prev * 0.5 } },
    videosPosted: { now: 10, prev: 10 }, hit: { now: { matured: 10, converting: 5 }, prev: { matured: 10, converting: 5 } },
    salesPerNewVideo: { now: 100, prev: 100 }, returnRate: { now: 5, prev: 5 }, quietCreator: null, ...over,
  });
  check("content age: 0–14 new, 15–30 recent, 31–60 old, over 60 very old", bucketOfAge(0) === "new" && bucketOfAge(14) === "new" && bucketOfAge(15) === "recent" && bucketOfAge(30) === "recent" && bucketOfAge(31) === "old" && bucketOfAge(60) === "old" && bucketOfAge(61) === "veryold" && bucketOfAge(400) === "veryold");
  check("tag: +15% or more is Growing, −15% or worse is Slipping, in between Steady", tagOf(M(115, 100)) === "Growing" && tagOf(M(114, 100)) === "Steady" && tagOf(M(86, 100)) === "Steady" && tagOf(M(85, 100)) === "Slipping" && tagOf(M(100, 100)) === "Steady");
  check("tag: −50% or worse is Dying; no new video with falling sales is Dying", tagOf(M(50, 100)) === "Dying" && tagOf(M(49, 100)) === "Dying" && tagOf(M(80, 100, { videosPosted: { now: 0, prev: 8 } })) === "Dying" && tagOf(M(95, 100, { videosPosted: { now: 0, prev: 8 } })) === "Steady");
  check("tag: an unknown video count (period before the video list) never makes Dying by itself", tagOf(M(80, 100, { videosPosted: { now: null, prev: null } })) === "Slipping");
  check("tag: nothing sold before is Growing; nothing sold at all is No Sales", tagOf(M(500, 0)) === "Growing" && tagOf(M(0, 0)) === "No Sales" && tagOf(M(0, 100)) === "Dying");
  const frag = diagnose(M(100, 100, { buckets: { now: { ...zero, old: 80, new: 10, live: 10 }, prev: { ...zero, old: 80, new: 10, live: 10 } } }));
  const heal = diagnose(M(100, 100, { buckets: { now: { ...zero, old: 40, new: 50, live: 10 }, prev: { ...zero, old: 40, new: 50, live: 10 } } }));
  check("fragile: over 70% of video and LIVE sales from old videos; healthy otherwise; unknown with no sales", frag.fragile === true && heal.fragile === false && diagnose(M(0, 0)).fragile === null && oldShare({ ...zero, other: 50 }) === null && oldShare({ ...zero, old: 70, new: 30 }) === 0.7 && diagnose(M(100, 100, { buckets: { now: { ...zero, old: 70, new: 30 }, prev: zero } })).fragile === false);
  check("reasons: a steady fragile product is called fragile; a steady healthy one healthy", /^Fragile: 80%/.test(frag.reasons[0].text) && /^Healthy: 60%/.test(heal.reasons[0].text), frag.reasons[0].text + " | " + heal.reasons[0].text);
  const falling = diagnose(M(60, 100, { buckets: { now: { ...zero, old: 40, new: 20 }, prev: { ...zero, old: 70, new: 30 } }, videosPosted: { now: 3, prev: 10 }, hit: { now: { matured: 3, converting: 0 }, prev: { matured: 10, converting: 5 } }, quietCreator: { name: "star", drop: 12 } }));
  const texts = falling.reasons.map((r) => r.text).join(" | ");
  check("reasons: a slipping product says old videos fade, few new videos and the quiet creator (top 3 by size)", falling.tag === "Slipping" && falling.reasons.length === 3 && /Old videos are fading/.test(texts), texts);
  check("reasons: poor conversion of new videos is named when the hit rate drops 10 points or more", diagnose(M(60, 100, { hit: { now: { matured: 10, converting: 1 }, prev: { matured: 10, converting: 6 } }, videosPosted: { now: 10, prev: 10 }, buckets: { now: { ...zero, new: 60 }, prev: { ...zero, new: 100 } } })).reasons.some((r) => /convert worse: 10% got 3\+ orders in 14 days \(was 60%\)/.test(r.text)));
  const rising = diagnose(M(160, 100, { buckets: { now: { ...zero, new: 100, old: 60 }, prev: { ...zero, new: 40, old: 60 } }, newCreators: { count: 2, sales: 50 } }));
  check("reasons: a growing product says new videos are selling, with how many posted and how many got 3+ orders", rising.tag === "Growing" && /New videos are selling: 10 posted, 50% got 3\+ orders in 14 days/.test(rising.reasons[0].text), rising.reasons.map((r) => r.text).join(" | "));
  check("reasons: new creators and a better sales-per-video are listed when they matter", rising.reasons.some((r) => /2 new creators started selling it/.test(r.text)) && diagnose(M(160, 100, { salesPerNewVideo: { now: 200, prev: 100 } })).reasons.some((r) => /Each new video sells more: RM 200, was RM 100/.test(r.text)));
  check("reasons: always at least one sentence, and No Sales says so", diagnose(M(100, 100)).reasons.length >= 1 && diagnose(M(0, 0)).reasons[0].text.startsWith("No sales"));
  check("reasons: more returns than before is named (5 points or more)", diagnose(M(80, 100, { returnRate: { now: 14, prev: 5 } })).reasons.some((r) => /More returns and cancellations: 14% \(was 5%\)/.test(r.text)));

  // ── database: automatic product names ──
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  for (const t of ["tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_orders", "tt_skus", "product_map"]) await q(sql.raw(`delete from ${t}`));
  const MP = "1111111111", PL = "2222222222", TOY = "3333333333", NEWP = "4444444444", MPX = "5555555555";
  await q(sql`insert into tt_skus (sku_id, product_id, product_title, seller_sku, price, stock) values
    ('S1', ${MP}, ${NWPL}, 'NMP-Q-WH-ST', 59, 1), ('S2', ${PL}, 'ALOOMA Kualiti Premium Bantal Tidur Hotel Pillow', 'STD-PLW-WH', 30, 1),
    ('S3', ${TOY}, 'Magnetic Stick Toy Balls', 'MST25', 35, 1), ('S4', ${MPX}, ${"{Exclusive} " + NWPL}, 'NMP-Q-WH-ST', 59, 1)`);
  let n = 0;
  const line = (pid: string, sku: string, seller: string, count: number) => (async () => { for (let i = 0; i < count; i++) await q(sql`insert into tt_affiliate_order_lines (order_id, sku_id, created_at, creator, content_type, product_id, seller_sku, quantity, price) values (${"T" + ++n}, ${sku}, now(), 'zz_p', 'VIDEO', ${pid}, ${seller}, 1, 10)`); })();
  await line(MP, "S1", "NMP-Q-WH-ST", 60); await line(MP, "S1b", "STD-PLW-WH", 4); await line(PL, "S2", "STD-PLW-WH", 30); await line(MPX, "S4", "NMP-Q-WH-ST", 25); await line(TOY, "S3", "MST25", 3); await line(NEWP, "S9", "ZZ-1", 2);
  const { refreshProductKeys } = await import("../src/lib/products/classify");
  await refreshProductKeys();
  const maps = new Map((await q(sql`select product_id, product_key, updated_at from product_map`)).map((r) => [r.product_id as string, r]));
  check("auto: every recognised listing gets its product; a toy is excluded; an unrecognised one gets nothing", maps.get(MP)?.product_key === "mp_nwp" && maps.get(PL)?.product_key === "pillows" && maps.get(TOY)?.product_key === EXCLUDED && maps.get(MPX)?.product_key === "mp_nwp_x" && !maps.has(NEWP), JSON.stringify([...maps.entries()].map(([k, v]) => [k, v.product_key])));
  check("auto: the exclusive twin selling the same SKU is its own product", maps.get(MP)?.product_key !== maps.get(MPX)?.product_key);
  await refreshProductKeys();
  const again = new Map((await q(sql`select product_id, updated_at from product_map`)).map((r) => [r.product_id as string, String(r.updated_at)]));
  check("auto: running it again changes nothing (so caches stay valid)", [...maps.entries()].every(([k, v]) => again.get(k) === String(v.updated_at)));
  await q(sql`update product_map set product_key = 'quilt' where product_id = ${PL}`);
  await refreshProductKeys();
  check("auto: a wrong stored answer is corrected by the rules on the next refresh", ((await q(sql`select product_key from product_map where product_id = ${PL}`))[0].product_key) === "pillows");
  await q(sql`update tt_skus set product_title = 'ALOOMA Premium Coral Fleece Bath Towel' where product_id = ${PL}`);
  await refreshProductKeys();
  check("auto: when a listing's title changes, its product follows", ((await q(sql`select product_key from product_map where product_id = ${PL}`))[0].product_key) === "towel_coral");
  for (const t of ["tt_affiliate_order_lines", "tt_skus", "product_map"]) await q(sql.raw(`delete from ${t}`));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
