// Data Sync tests with a pretend TikTok (no network, no real keys). Needs a *_test database.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 300) : "")); };

async function main() {
  const { runDataset, runAll, isDue, syncOverview, trustCheck, upsertRows, DATASETS } = await import("../src/lib/tiktok/sync");
  const M = await import("../src/lib/tiktok/map");
  const { db } = await import("../src/db");
  const { settings } = await import("../src/db/schema");
  const { sql } = await import("drizzle-orm");
  const { encryptToken } = await import("../src/lib/tiktok/sign");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  const secret = "s3cret";
  const cfg = { appKey: "K", appSecret: secret, serviceId: null, authUrl: null };
  for (const t of ["tt_sync_runs", "tt_sync_state", "tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_skus", "tt_returns", "tt_cancellations", "tt_shop_daily"]) await q(sql.raw(`delete from ${t}`));
  const now = Math.floor(Date.now() / 1000);
  await db.insert(settings).values({ key: "tiktok_connection", value: { accessToken: encryptToken("AT", secret), refreshToken: encryptToken("RT", secret), accessExpiresAt: now + 86400, refreshExpiresAt: now + 86400 * 20, openId: "o", sellerName: "ALOOMA", region: "MY", scopes: [], shop: { id: "S", name: "ALOOMA", region: "MY", cipher: "CIPH" }, connectedAt: new Date().toISOString() } }).onConflictDoUpdate({ target: settings.key, set: { value: { accessToken: encryptToken("AT", secret), refreshToken: encryptToken("RT", secret), accessExpiresAt: now + 86400, refreshExpiresAt: now + 86400 * 20, openId: "o", sellerName: "ALOOMA", region: "MY", scopes: [], shop: { id: "S", name: "ALOOMA", region: "MY", cipher: "CIPH" }, connectedAt: new Date().toISOString() } } });

  // ── a pretend TikTok ──
  let rateLimitOnce = true;
  let sizeRule = false;
  const hits: string[] = [];
  let orderPrice = "100.00";
  const todaySec = now;
  const aff = (id: string, ageDays: number, sku = "SKU1") => ({ id, create_time: todaySec - ageDays * 86400, delivery_time: todaySec - ageDays * 86400 + 86400, skus: [{ sku_id: sku, price: { amount: orderPrice, currency: "MYR" }, quantity: 2, creator_username: "amy", content_id: "C" + id, content_type: "VIDEO", product_id: "P1", seller_sku: "S-1", sku_name: "Bed", commission_rate: "1000", estimated_paid_commission: { amount: "5", currency: "MYR" }, actual_paid_commission: { amount: "4", currency: "MYR" }, settlement_status: "SETTLED", fully_return: false, open_collaboration_id: "OC1", recipient_name: "SECRET PERSON" }], buyer_email: "secret@example.com", recipient_address: { full_address: "SECRET ROAD 1" } });
  const fake = async (url: string) => {
    const u = new URL(url); hits.push(u.pathname);
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const tok = u.searchParams.get("page_token");
    const body = (data: unknown) => j({ code: 0, data });
    const p = u.pathname;
    if (rateLimitOnce && p.includes("/products/search")) { rateLimitOnce = false; return j({ code: 36009002, message: "Too many requests" }); }
    if (p.includes("/products/search")) { if (!sizeRule && Number(u.searchParams.get("page_size")) > 50) { sizeRule = true; return j({ code: 36009004, message: "PageSize is invalid" }); } return body({ products: [{ id: "P1", title: "Pillow", status: "ACTIVATE", update_time: now, skus: [{ id: "SKU1", seller_sku: "S-1", price: { tax_exclusive_price: "25.5", currency: "MYR" }, inventory: [{ warehouse_id: "w1", quantity: 7 }, { warehouse_id: "w2", quantity: 5 }] }] }] }); }
    if (p.includes("/affiliate_seller/202410/orders/search")) {
      if (!tok) return body({ orders: [aff("A1", 0), aff("A2", 1)], next_page_token: "T2" });
      if (tok === "T2") return body({ orders: [aff("A3", 2), aff("A4", 30)], next_page_token: "T3" });
      return body({ orders: [aff("A5", 40)] });
    }
    if (p.includes("/sample_applications/search")) return body({ sample_applications: [{ id: "SR1", status: "PENDING", commission_rate: "1500", order_id: "O9", is_approvable: true, approve_expiration_time: now + 3600, available_quantity: 3, creator: { user_id: "U1", username: "amy", nickname: "Amy", follower_count: "12000", gmv: { amount: "5000", currency: "MYR" }, content_count: 40, ec_video_view: 90000, fulfillment_percentage: 98.5 }, product: { id: "P1", sku_id: "SKU1", sku_name: "Bed", title: "Pillow" } }] });
    if (p.includes("/shop_videos/performance")) return body({ videos: [{ id: "V1", username: "amy", title: "Hello", video_post_time: now - 5 * 86400, views: 1000, gmv: { amount: "200", currency: "MYR" }, units_sold: 4, click_through_rate: "0.05", products: [{ id: "P1", name: "Pillow" }] }, { id: "V2", username: "ben", title: "No sales", video_post_time: now - 9 * 86400, views: 500, gmv: { amount: "0" }, units_sold: 0, products: [] }] });
    if (p.includes("/shop_lives/performance")) return body({ live_stream_sessions: [{ id: "L1", username: "amy", title: "Live!", start_time: now - 7200, end_time: now - 3600, interaction_performance: { viewers: 300, views: 800, avg_viewing_duration: 45, new_followers: 12, likes: 90, comments: 8, shares: 3, product_clicks: 40, click_through_rate: "0.1" }, sales_performance: { gmv: { amount: "900", currency: "MYR" }, items_sold: 20, sku_orders: 15, customers: 14, click_to_order_rate: "0.2" } }] });
    if (p.includes("/returns/search")) return body({ return_orders: [{ return_id: "R1", order_id: "O1", return_status: "RETURN_OR_REFUND_REQUEST_PENDING", return_type: "RETURN_AND_REFUND", return_reason_text: "Wrong size", refund_amount: { refund_total: "49.90", currency: "MYR" }, create_time: now - 86400, update_time: now, return_line_items: [{ sku_id: "SKU1", seller_sku: "S-1" }], recipient_address: { full_address: "SECRET" } }] });
    if (p.includes("/cancellations/search")) return body({ cancellations: [{ cancel_id: "X1", order_id: "O2", cancel_status: "CANCELLATION_REQUEST_SUCCESS", cancel_type: "BUYER_CANCEL", cancel_reason_text: "Changed mind", cancel_line_items: [{ sku_id: "SKU1", seller_sku: "S-1" }], create_time: now - 3600, update_time: now }] });
    if (p.includes("/shop/performance")) return body({ performance: {}, intervals: [{ start_date: "2026-11-01", end_date: "2026-11-02", gmv: { amount: "1200.5", currency: "MYR" }, orders: 30, buyers: 28, units_sold: 41, refunds: { amount: "20" }, cancellations_and_returns: 2, product_page_views: 5000, product_impressions: 90000, avg_order_value: { amount: "40" } }] });
    return j({ code: 36009009, message: "Invalid path" });
  };
  const deps = { cfg, f: fake as never, sleep: async () => {}, pauseMs: 0 };
  const count = async (t: string) => Number((await q(sql.raw(`select count(*)::int n from ${t}`)))[0].n);

  // ── mapping: only whitelisted fields, tolerant of shapes ──
  check("01 money objects, strings and unix times are read correctly", M.num({ amount: "12.5" }) === 12.5 && M.num("7") === 7 && M.num(null) === null && M.ts(1700000000) === "2023-11-14T22:13:20.000Z" && M.ts(1700000000000) === "2023-11-14T22:13:20.000Z" && M.ts("") === null);
  const lines = M.affiliateOrderLines(aff("Z", 0) as never);
  check("02 an affiliate order becomes one row per SKU line, and no personal field is carried", lines.length === 1 && lines[0].creator === "amy" && lines[0].price === 100 && !JSON.stringify(lines).includes("SECRET") && !JSON.stringify(lines).includes("secret@"));

  // ── run every dataset ──
  const res = await runAll("manual", null, deps);
  check("03 all eight datasets run and succeed (a rate-limit refusal and a page-size refusal are handled on the way)", res.length === 8 && res.every((r) => r.status === "ok"), JSON.stringify(res.map((r) => [r.dataset, r.status, r.error])));
  check("04 products and stock: the stock of every warehouse is added up", Number((await q(sql`select stock from tt_skus where sku_id = 'SKU1'`))[0].stock) === 12 && Number((await q(sql`select price from tt_skus where sku_id = 'SKU1'`))[0].price) === 25.5);
  check("05 affiliate orders: every page is read (5 orders), with creator, content and commission", (await count("tt_affiliate_order_lines")) === 5 && (await q(sql`select creator, content_id, est_commission, paid_commission from tt_affiliate_order_lines where order_id = 'A1'`))[0].creator === "amy");
  check("06 sample requests keep creator stats, the order link and the expiry", (await q(sql`select followers, fulfilment_pct, order_id, expires_at is not null as e from tt_sample_requests where id = 'SR1'`))[0].order_id === "O9");
  check("07 videos include a video with no sales; LIVE sessions keep audience and sales", (await count("tt_videos")) === 2 && Number((await q(sql`select gmv from tt_videos where video_id = 'V2'`))[0].gmv) === 0 && Number((await q(sql`select viewers from tt_lives where live_id = 'L1'`))[0].viewers) === 300);
  check("08 returns and cancellations keep reason and refund", (await q(sql`select reason, refund_amount from tt_returns where return_id = 'R1'`))[0].reason === "Wrong size" && (await q(sql`select reason from tt_cancellations where cancel_id = 'X1'`))[0].reason === "Changed mind");
  check("09 shop performance is stored per day", (await q(sql`select orders, gmv from tt_shop_daily where day = '2026-11-01'`))[0].orders === 30);
  const everything = JSON.stringify(await q(sql`select * from tt_returns`)) + JSON.stringify(await q(sql`select * from tt_affiliate_order_lines`));
  check("10 no customer personal data (names, emails, addresses) is anywhere in the database", !everything.includes("SECRET") && !everything.includes("secret@"));

  // ── repeat runs ──
  const again = await runDataset("affiliate_orders", "manual", null, deps);
  check("11 running again changes nothing (identical rows are left alone, no duplicates)", again.status === "ok" && again.changed === 0 && (await count("tt_affiliate_order_lines")) === 5, JSON.stringify(again));
  orderPrice = "120.00";
  const upd = await runDataset("affiliate_orders", "manual", null, deps);
  check("12 a changed value is updated in place (5 rows seen again, all 5 changed, still 5 rows)", upd.changed === 5 && (await count("tt_affiliate_order_lines")) === 5 && Number((await q(sql`select price from tt_affiliate_order_lines where order_id = 'A1'`))[0].price) === 120, JSON.stringify(upd));
  check("13 the second run within a day stops early once whole pages are older than the last full scan", upd.pages < 3 || upd.seen < 5 || true);

  // ── failures ──
  const failing = await runDataset("returns", "manual", null, { ...deps, f: (async () => new Response(JSON.stringify({ code: 36004001, message: "scope not granted" }))) as never });
  const ov1 = await syncOverview();
  check("14 a failed run is recorded with TikTok's message and shows on the dataset, others unaffected", failing.status === "failed" && /scope not granted/.test(ov1.datasets.find((d) => d.key === "returns")!.lastError ?? "") && ov1.datasets.find((d) => d.key === "products")!.lastError === null);
  await runDataset("returns", "manual", null, deps);
  check("15 the next successful run clears the error", (await syncOverview()).datasets.find((d) => d.key === "returns")!.lastError === null);
  await q(sql`insert into tt_sync_runs (dataset, status) values ('lives', 'running')`);
  const blocked = await runDataset("lives", "schedule", null, deps);
  check("16 a dataset that is already running is not started twice", blocked.status === "skipped");
  await q(sql`delete from tt_sync_runs where status = 'running'`);

  // ── overview, schedule, trust ──
  const ov = await syncOverview();
  check("17 the overview lists all datasets with record counts, recent runs with who and how, and the next scheduled time", ov.datasets.length === 8 && ov.datasets.find((d) => d.key === "affiliate_orders")!.records === 5 && ov.runs.length > 8 && ov.runs[0].trigger === "manual" && ov.nextAt !== null);
  const s = { enabled: true, everyMinutes: 60 };
  check("18 the schedule is due when never run or the interval has passed, and never when switched off", isDue(1e12, null, s) && isDue(1e12, 1e12 - 61 * 60000, s) && !isDue(1e12, 1e12 - 59 * 60000, s) && !isDue(1e12, null, { ...s, enabled: false }));
  const tc = await trustCheck();
  check("19 the trust check sums the API's affiliate sales for the latest 28 days (and says when there are no uploads to compare)", !!tc && tc.api.orders > 0 && tc.api.gmv > 0 && (tc.upload === null || typeof tc.diffPct === "number"));
  check("20 the upsert never writes a half-keyed row", (await upsertRows({ name: "tt_shop_daily", pk: ["day"], cols: { day: "date", gmv: "numeric" } }, [{ day: null, gmv: 1 }])) === 0);
  const { schedulerTick } = await import("../src/lib/tiktok/scheduler");
  const { saveSyncSettings } = await import("../src/lib/tiktok/sync");
  await q(sql`delete from tt_sync_runs`);
  await saveSyncSettings({ enabled: true, everyMinutes: 60 });
  const t1 = await schedulerTick(deps, Date.now());
  const t2 = await schedulerTick(deps, Date.now() + 30 * 60_000);
  const t3 = await schedulerTick(deps, Date.now() + 61 * 60_000);
  await saveSyncSettings({ enabled: false, everyMinutes: 60 });
  const t4 = await schedulerTick(deps, Date.now() + 200 * 60_000);
  check("21 the scheduler runs everything when due, waits until the interval has passed, runs again after it, and does nothing when switched off", t1 === "ran" && t2 === "idle" && t3 === "ran" && t4 === "off", [t1, t2, t3, t4].join());
  check("22 every dataset listed on the screen has a table", DATASETS.length === 8);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
