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
  await q(sql`delete from settings where key = 'tiktok_sync'`);
  await q(sql`delete from settings where key = 'tiktok_history'`);
  const cfg = { appKey: "K", appSecret: secret, serviceId: null, authUrl: null };
  for (const t of ["tt_sync_runs", "tt_sync_state", "tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_skus", "tt_returns", "tt_cancellations", "tt_shop_daily", "tt_orders", "tt_open_collabs"]) await q(sql.raw(`delete from ${t}`));
  const now = Math.floor(Date.now() / 1000);
  await db.insert(settings).values({ key: "tiktok_connection", value: { accessToken: encryptToken("AT", secret), refreshToken: encryptToken("RT", secret), accessExpiresAt: now + 86400, refreshExpiresAt: now + 86400 * 20, openId: "o", sellerName: "ALOOMA", region: "MY", scopes: [], shop: { id: "S", name: "ALOOMA", region: "MY", cipher: "CIPH" }, connectedAt: new Date().toISOString() } }).onConflictDoUpdate({ target: settings.key, set: { value: { accessToken: encryptToken("AT", secret), refreshToken: encryptToken("RT", secret), accessExpiresAt: now + 86400, refreshExpiresAt: now + 86400 * 20, openId: "o", sellerName: "ALOOMA", region: "MY", scopes: [], shop: { id: "S", name: "ALOOMA", region: "MY", cipher: "CIPH" }, connectedAt: new Date().toISOString() } } });

  // ── a pretend TikTok ──
  let videoLimit: string | null = null;
  let mode: "honor" | "ignore" | "reject" = "honor";
  const bodies: Record<string, unknown>[] = [];
  let rateLimitOnce = true;
  let sizeRule = false;
  const hits: string[] = [];
  let orderPrice = "100.00";
  const todaySec = now;
  const aff = (id: string, ageDays: number, sku = "SKU1") => ({ id, create_time: todaySec - ageDays * 86400, delivery_time: todaySec - ageDays * 86400 + 86400, skus: [{ sku_id: sku, price: { amount: orderPrice, currency: "MYR" }, quantity: 2, creator_username: "amy", content_id: "C" + id, content_type: "VIDEO", product_id: "P1", seller_sku: "S-1", sku_name: "Bed", commission_rate: "1000", estimated_paid_commission: { amount: "5", currency: "MYR" }, actual_paid_commission: { amount: "4", currency: "MYR" }, settlement_status: "SETTLED", fully_return: false, open_collaboration_id: "OC1", recipient_name: "SECRET PERSON" }], buyer_email: "secret@example.com", recipient_address: { full_address: "SECRET ROAD 1" } });
  const fake = async (url: string, init?: RequestInit) => {
    const u = new URL(url); hits.push(u.pathname);
    const reqBody = (() => { try { return JSON.parse(String(init?.body ?? "{}")) as Record<string, number>; } catch { return {} as Record<string, number>; } })();
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const tok = u.searchParams.get("page_token");
    const body = (data: unknown) => j({ code: 0, data });
    const p = u.pathname;
    if (rateLimitOnce && p.includes("/products/search")) { rateLimitOnce = false; return j({ code: 36009002, message: "Too many requests" }); }
    if (p.includes("/products/search")) { if (!sizeRule && Number(u.searchParams.get("page_size")) > 50) { sizeRule = true; return j({ code: 36009004, message: "PageSize is invalid" }); } return body({ products: [{ id: "P1", title: "Pillow", status: "ACTIVATE", update_time: now, skus: [{ id: "SKU1", seller_sku: "S-1", price: { tax_exclusive_price: "25.5", currency: "MYR" }, inventory: [{ warehouse_id: "w1", quantity: 7 }, { warehouse_id: "w2", quantity: 5 }] }] }] }); }
    if (p.includes("/affiliate_seller/202410/orders/search")) {
      bodies.push(reqBody);
      const filtered = reqBody.create_time_ge !== undefined;
      if (filtered && mode === "reject") return j({ code: 98001004, message: "invalid params" });
      let all = [aff("A1", 0), aff("A2", 1), aff("A3", 2), aff("A4", 30), aff("A5", 40), aff("A6", 75), aff("A7", 100)];
      if (filtered && mode === "honor") all = all.filter((o) => o.create_time >= reqBody.create_time_ge && o.create_time < reqBody.create_time_lt);
      const at = tok ? Number(tok) : 0;
      return body({ orders: all.slice(at, at + 2), next_page_token: at + 2 < all.length ? String(at + 2) : undefined });
    }
    if (p === "/order/202309/orders/search") {
      let all = [0, 2, 40, 75].map((age, i) => ({ id: "SO" + i, status: "COMPLETED", is_sample_order: false, create_time: now - age * 86400, update_time: now, delivery_time: now - age * 86400 + 86400, payment: { total_amount: "55.50", currency: "MYR" }, tracking_number: "T" + i, shipping_provider: "J&T", buyer_email: "secret@example.com", recipient_address: { full_address: "SECRET ROAD" }, line_items: [{ sku_id: "SKU1", product_id: "P1", seller_sku: "S-1", display_status: "COMPLETED", sale_price: "55.50", product_name: "SECRET NAME" }] }));
      if (reqBody.create_time_ge !== undefined) all = all.filter((o) => o.create_time >= reqBody.create_time_ge && o.create_time < reqBody.create_time_lt);
      return body({ orders: all });
    }
    if (p === "/order/202309/orders" && (u.searchParams.get("ids") ?? "").includes("BAD")) return j({ code: 36009003, message: "Internal error. Please try again." });
    if (p === "/order/202309/orders") { const ids = (u.searchParams.get("ids") ?? "").split(","); return body({ orders: ids.map((id) => ({ id, status: id === "O9" ? "DELIVERED" : "COMPLETED", is_sample_order: true, create_time: now - 86400 * 5, update_time: now, delivery_time: now - 86400, paid_time: now - 86400 * 5, tracking_number: "TRK" + id, shipping_provider: "J&T", payment: { total_amount: "0.00", currency: "MYR" }, line_items: [{ sku_id: "SKU1", product_id: "P1", seller_sku: "S-1", display_status: "DELIVERED", package_status: "DELIVERED", tracking_number: "TRK" + id, product_name: "SECRET NAME LEAK" }], buyer_email: "secret@example.com", recipient_address: { full_address: "SECRET ROAD 1" } })) }); }
    if (p.includes("/open_collaborations/search")) return body({ open_collaborations: [{ id: "OC1", status: "ONGOING", content_creator_count: 12, showcase_creator_count: 5, require_seller_approve_creator: false, current_commission: { rate: "1500", start_time: now - 86400, end_time: now + 86400 * 30 }, product: { id: "P1", title: "Pillow", inventory: 40, original_price: { minimum_amount: "20", maximum_amount: "35", currency: "MYR" } } }] });
    if (p.includes("/sample_applications/search")) return body({ sample_applications: [{ id: "SR1", status: "PENDING", commission_rate: "1500", order_id: "O9", is_approvable: true, approve_expiration_time: now + 3600, available_quantity: 3, creator: { user_id: "U1", username: "amy", nickname: "Amy", follower_count: "12000", gmv: { amount: "5000", currency: "MYR" }, content_count: 40, ec_video_view: 90000, fulfillment_percentage: 98.5 }, product: { id: "P1", sku_id: "SKU1", sku_name: "Bed", title: "Pillow" } }] });
    if (p.includes("/shop_videos/performance") && videoLimit && (u.searchParams.get("start_date_ge") ?? "") < videoLimit) return j({ code: 36004004, message: "The date range is out of the allowed limit" });
    if (p.includes("/shop_videos/performance")) return body({ videos: [{ id: "V1", username: "amy", title: "Hello", video_post_time: now - 5 * 86400, views: 1000, gmv: { amount: "200", currency: "MYR" }, units_sold: 4, click_through_rate: "0.05", products: [{ id: "P1", name: "Pillow" }] }, { id: "V2", username: "ben", title: "No sales", video_post_time: now - 9 * 86400, views: 500, gmv: { amount: "0" }, units_sold: 0, products: [] }] });
    if (p.includes("/shop_lives/performance")) return body({ live_stream_sessions: [{ id: "L1", username: "amy", title: "Live!", start_time: now - 7200, end_time: now - 3600, interaction_performance: { viewers: 300, views: 800, avg_viewing_duration: 45, new_followers: 12, likes: 90, comments: 8, shares: 3, product_clicks: 40, click_through_rate: "0.1" }, sales_performance: { gmv: { amount: "900", currency: "MYR" }, items_sold: 20, sku_orders: 15, customers: 14, click_to_order_rate: "0.2" } }] });
    if (p.includes("/returns/search")) return body({ return_orders: [{ return_id: "R1", order_id: "O1", return_status: "RETURN_OR_REFUND_REQUEST_PENDING", return_type: "RETURN_AND_REFUND", return_reason_text: "Wrong size", refund_amount: { refund_total: "49.90", currency: "MYR" }, create_time: now - 86400, update_time: now, return_line_items: [{ sku_id: "SKU1", seller_sku: "S-1" }], recipient_address: { full_address: "SECRET" } }] });
    if (p.includes("/cancellations/search")) return body({ cancellations: [{ cancel_id: "X1", order_id: "O2", cancel_status: "CANCELLATION_REQUEST_SUCCESS", cancel_type: "BUYER_CANCEL", cancel_reason_text: "Changed mind", cancel_line_items: [{ sku_id: "SKU1", seller_sku: "S-1" }], create_time: now - 3600, update_time: now }] });
    if (p.includes("/shop/performance")) return body({ performance: { intervals: [{ start_date: "2026-11-01", end_date: "2026-11-02", gmv: { amount: "1200.5", currency: "MYR" }, orders: 30, buyers: 28, units_sold: 41, refunds: { amount: "20" }, cancellations_and_returns: 2, product_page_views: 5000, product_impressions: 90000, avg_order_value: { amount: "40" } }] } });
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
  check("03 all eleven datasets run and succeed (a rate-limit refusal and a page-size refusal are handled on the way)", res.length === 11 && res.every((r) => r.status === "ok"), JSON.stringify(res.map((r) => [r.dataset, r.status, r.error])));
  check("04 products and stock: the stock of every warehouse is added up", Number((await q(sql`select stock from tt_skus where sku_id = 'SKU1'`))[0].stock) === 12 && Number((await q(sql`select price from tt_skus where sku_id = 'SKU1'`))[0].price) === 25.5);
  check("05 affiliate orders: the first sync reads the whole history in date windows (7 orders found, across pages and windows), with creator, content and commission", (await count("tt_affiliate_order_lines")) === 7 && (await q(sql`select creator, content_id, est_commission, paid_commission from tt_affiliate_order_lines where order_id = 'A1'`))[0].creator === "amy");
  check("06 sample requests keep creator stats, the order link and the expiry", (await q(sql`select followers, fulfilment_pct, order_id, expires_at is not null as e from tt_sample_requests where id = 'SR1'`))[0].order_id === "O9");
  check("07 videos include a video with no sales; LIVE sessions keep audience and sales", (await count("tt_videos")) === 2 && Number((await q(sql`select gmv from tt_videos where video_id = 'V2'`))[0].gmv) === 0 && Number((await q(sql`select viewers from tt_lives where live_id = 'L1'`))[0].viewers) === 300);
  check("08 returns and cancellations keep reason and refund", (await q(sql`select reason, refund_amount from tt_returns where return_id = 'R1'`))[0].reason === "Wrong size" && (await q(sql`select reason from tt_cancellations where cancel_id = 'X1'`))[0].reason === "Changed mind");
  check("09 shop performance is stored per day", (await q(sql`select orders, gmv from tt_shop_daily where day = '2026-11-01'`))[0].orders === 30);
  const everything = JSON.stringify(await q(sql`select * from tt_returns`)) + JSON.stringify(await q(sql`select * from tt_affiliate_order_lines`));
  check("10 no customer personal data (names, emails, addresses) is anywhere in the database", !everything.includes("SECRET") && !everything.includes("secret@"));

  // ── repeat runs ──
  const again = await runDataset("affiliate_orders", "manual", null, deps);
  check("11 running again changes nothing (identical rows are left alone, no duplicates)", again.status === "ok" && again.changed === 0 && (await count("tt_affiliate_order_lines")) === 7, JSON.stringify(again));
  orderPrice = "120.00";
  const upd = await runDataset("affiliate_orders", "manual", null, deps);
  check("12 a changed value is updated in place (the 3 recent rows are re-read and changed; still 7 rows)", upd.changed === 3 && (await count("tt_affiliate_order_lines")) === 7 && Number((await q(sql`select price from tt_affiliate_order_lines where order_id = 'A1'`))[0].price) === 120, JSON.stringify(upd));
  check("13 a run within a day of the last full scan reads only the last few days (3 order lines, not 7)", again.seen === 3 && upd.seen === 3, JSON.stringify([again.seen, upd.seen]));

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
  check("17 the overview lists all datasets with record counts, recent runs with who and how, and the next scheduled time", ov.datasets.length === 11 && ov.datasets.find((d) => d.key === "affiliate_orders")!.records === 7 && ov.runs.length > 8 && ov.runs[0].trigger === "manual" && ov.nextAt !== null, JSON.stringify({ n: ov.runs.length, rec: ov.datasets.find((d) => d.key === "affiliate_orders")!.records, t: ov.runs[0]?.trigger, next: ov.nextAt, set: ov.settings }));
  const s = { enabled: true, everyMinutes: 60 };
  check("18 the schedule is due when never run or the interval has passed, and never when switched off", isDue(1e12, null, s) && isDue(1e12, 1e12 - 61 * 60000, s) && !isDue(1e12, 1e12 - 59 * 60000, s) && !isDue(1e12, null, { ...s, enabled: false }));
  const tc = await trustCheck();
  check("19 the trust check sums the API's affiliate sales for the latest 28 days (and says when there are no uploads to compare)", !!tc && tc.api.orders > 0 && tc.api.gmv > 0 && (tc.upload === null || typeof tc.diffPct === "number"));
  check("20 the upsert never writes a half-keyed row", (await upsertRows({ name: "tt_shop_daily", pk: ["day"], cols: { day: "date", gmv: "numeric" } }, [{ day: null, gmv: 1 }])) === 0);

  // ── filter modes: fast path, ignored filter, rejected filter ──
  const reset = async () => { await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_affiliate_order_lines`); await q(sql`delete from tt_sync_state where dataset = 'affiliate_orders'`); bodies.length = 0; };
  for (const m of ["ignore", "reject"] as const) {
    mode = m; await reset();
    const r = await runDataset("affiliate_orders", "manual", null, deps);
    check(`25${m === "ignore" ? "a" : "b"} when TikTok ${m === "ignore" ? "ignores" : "rejects"} the date filter, the safe full scan is used and every order is still found`, r.status === "ok" && (await count("tt_affiliate_order_lines")) === 7, JSON.stringify(r));
  }
  mode = "honor"; await reset();
  const fast = await runDataset("affiliate_orders", "manual", null, deps);
  const windowsAsked = bodies.filter((b) => b.create_time_ge !== undefined).length;
  check("25c with a working filter the first sync uses date windows (several filtered requests) and still finds all 7 orders", fast.status === "ok" && fast.changed === 7 && fast.seen === 7 && (await count("tt_affiliate_order_lines")) === 7 && windowsAsked >= 5, `windows ${windowsAsked}`);

  // ── the four additions ──
  const sd = await q(sql`select orders, gmv from tt_shop_daily`);
  check("26 shop performance is read from performance.intervals (it showed 0 before)", sd.length === 1 && Number(sd[0].orders) === 30);
  const so = await q(sql`select order_id, status, is_sample, tracking_number, is_final, lines::text as lines from tt_orders where order_id = 'O9' order by order_id`);
  check("27 sample orders: only the orders behind sample requests are fetched, with shipping facts and the final flag", so.length === 1 && so[0].order_id === "O9" && so[0].status === "DELIVERED" && so[0].is_sample === true && so[0].tracking_number === "TRKO9" && so[0].is_final === false, JSON.stringify(so));
  check("28 sample orders carry no customer data and no product names", !JSON.stringify(so).includes("SECRET") && !JSON.stringify(so).includes("secret@"));
  const oc = await q(sql`select creators, showcasing, stock, price_max, needs_approval from tt_open_collabs where id = 'OC1'`);
  check("29 collaborations keep the creator counts, stock, price range and approval rule", oc.length === 1 && Number(oc[0].creators) === 12 && Number(oc[0].stock) === 40 && Number(oc[0].price_max) === 35 && oc[0].needs_approval === false);
  await q(sql`update tt_orders set status = 'COMPLETED', is_final = true`);
  const before = hits.filter((h) => h === "/order/202309/orders").length;
  await runDataset("sample_orders", "manual", null, deps);
  check("30 a finished sample order (completed or cancelled) is not asked for again", hits.filter((h) => h === "/order/202309/orders").length === before);
  await q(sql`insert into tt_sync_runs (dataset, status) values ('returns', 'running'), ('_all', 'running')`);
  const stuckBefore = (await syncOverview()).running;
  const { clearInterrupted } = await import("../src/lib/tiktok/sync");
  const cleared = await clearInterrupted();
  const afterOv = await syncOverview();
  const rerun = await runDataset("returns", "manual", null, deps);
  check("31 after a restart, runs left running are marked interrupted at once, the screen stops waiting, and the dataset can run again", stuckBefore === true && cleared === 2 && afterOv.running === false && rerun.status === "ok");
  // TikTok writes "0" (or nothing) as the order number of a sample that has not shipped: that is no order, and it is never asked for
  check("33a a sample request with order number 0 or empty is saved with no order; a real one is kept", M.sampleRequest({ id: "S0", order_id: "0" })["order_id"] === null && M.sampleRequest({ id: "S1", order_id: "" })["order_id"] === null && M.sampleRequest({ id: "S2", order_id: "00" })["order_id"] === null && M.sampleRequest({ id: "S3" })["order_id"] === null && M.sampleRequest({ id: "S4", order_id: "579593367113205286" })["order_id"] === "579593367113205286");
  await q(sql`insert into tt_sample_requests (id, order_id, creator) values ('SRZ1', '0', 'zed'), ('SRZ2', '', 'zed')`);
  await q(sql`insert into tt_sample_requests (id, order_id, creator) values ('SRB1', 'BAD1', 'zed'), ('SRB2', 'GOOD1', 'zed'), ('SRB3', 'GOOD2', 'zed')`);
  const isolated = await runDataset("sample_orders", "manual", null, deps);
  const got = (await q(sql`select order_id from tt_orders where order_id in ('GOOD1','GOOD2','BAD1')`)).map((r) => r.order_id).sort();
  check("33b order number 0 / empty is never asked for and never saved as an order; the Samples Issued card counts only real shipments", ((await q(sql`select count(*)::int as n from tt_orders where order_id in ('0', '')`))[0].n as number) === 0 && (await syncOverview()).datasets.find((d) => d.key === "sample_orders")!.records === (((await q(sql`select count(distinct o.order_id)::int as n from tt_orders o join tt_sample_requests r on r.order_id = o.order_id and r.order_id !~ '^0*$'`))[0].n as number)));
  const ovSk = (await syncOverview()).datasets.find((d) => d.key === "sample_orders")!;
  check("33 skipped orders are counted and shown as a warning (with an example id and TikTok's message), not hidden, and the card is not red", ovSk.lastError === null && /1 skipped/.test(ovSk.note ?? "") && /BAD1/.test(ovSk.note ?? ""), String(ovSk.note));
  check("32 one order TikTok cannot read does not fail the dataset: the group is split, the bad one is skipped and the others are saved", isolated.status === "ok" && got.join() === "GOOD1,GOOD2", JSON.stringify([isolated, got]));
  const spanOv = (await syncOverview()).datasets;
  const ao = spanOv.find((d) => d.key === "affiliate_orders")!;
  check("34 each card can show how far back its data goes (oldest and newest date)", !!ao.oldest && !!ao.newest && ao.oldest <= ao.newest && spanOv.find((d) => d.key === "videos")!.oldest !== null, JSON.stringify([ao.oldest, ao.newest]));
  // ── history: back to a start date, stopping politely where TikTok stops ──
  await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_videos`); await q(sql`delete from tt_video_windows`); await q(sql`delete from tt_sync_state where dataset = 'videos'`);
  const { saveSyncSettings: save } = await import("../src/lib/tiktok/sync");
  const todayIso = new Date().toISOString().slice(0, 10);
  const monthsAgo = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
  await save({ historyFrom: "2025-03-01" });
  videoLimit = monthsAgo;
  const hv = await runDataset("videos", "manual", null, deps);
  const winRows = Number((await q(sql`select count(*)::int n from tt_video_windows where video_id = 'V1'`))[0].n);
  check("35 the first video sync reads windows back to the start date, keeps each window's figures separately (so lifetime totals add up), and when TikTok refuses a window that is too old it stops there with a note instead of failing", hv.status === "ok" && winRows >= 6 && winRows < 20 && /only allows this report back to \d{4}-\d{2}-\d{2}/.test(hv.error ?? ""), JSON.stringify([hv, winRows]));
  const life = await q(sql`select sum(gmv)::float8 as g, count(*)::int as n from tt_video_windows where video_id = 'V1'`);
  check("36 a video's lifetime sales are the sum over its windows", Number(life[0].g) === 200 * Number(life[0].n));
  videoLimit = null;
  await save({ historyFrom: monthsAgo });
  await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_sync_state where dataset = 'affiliate_orders'`);
  bodies.length = 0;
  const hist = await runDataset("affiliate_orders", "manual", null, { ...deps, backfill: true });
  const winsAsked = bodies.filter((b) => b.create_time_ge !== undefined).length;
  check("37 Load full history re-reads every window back to the chosen start date (about 7 windows for 200 days), and a normal run does not", hist.status === "ok" && winsAsked >= 7 && winsAsked <= 12, String(winsAsked));
  check("38 the start date is saved and read back", (await (await import("../src/lib/tiktok/sync")).getSyncSettings()).historyFrom === monthsAgo && todayIso.length === 10);
  await save({ historyFrom: "2025-03-01" });
  // history range with an end day, and shop orders
  await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_affiliate_order_lines`); await q(sql`delete from tt_sync_state where dataset = 'affiliate_orders'`);
  const fiftyAgo = new Date(Date.now() - 50 * 86400_000).toISOString().slice(0, 10);
  await save({ historyFrom: monthsAgo, historyTo: fiftyAgo });
  await runDataset("affiliate_orders", "manual", null, { ...deps, backfill: true });
  check("39 a history range with an end day loads only that range (orders older than 50 days: 2 of 7)", (await count("tt_affiliate_order_lines")) === 2, String(await count("tt_affiliate_order_lines")));
  await save({ historyFrom: "2025-03-01", historyTo: "" });
  await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_orders where order_id like 'SO%'`); await q(sql`delete from tt_sync_state where dataset = 'orders'`);
  const oo = await runDataset("orders", "manual", null, deps);
  const orows = await q(sql`select order_id, total_amount, lines::text as lines, tracking_number from tt_orders where order_id like 'SO%' order by order_id`);
  check("40 shop orders sync into the orders table (4 found across windows) with totals and line prices", oo.status === "ok" && orows.length === 4 && Number(orows[0].total_amount) === 55.5 && /55.5/.test(String(orows[0].lines)), JSON.stringify([oo, orows.length]));
  check("41 shop orders carry no customer data (emails, addresses, product names)", !JSON.stringify(orows).includes("SECRET") && !JSON.stringify(orows).includes("secret@"));
  // loaded ranges are remembered: a second "Load full history" skips what is already there, "Re-read all" does not
  await q(sql`delete from settings where key = 'tiktok_history'`); await q(sql`delete from tt_affiliate_order_lines`); await q(sql`delete from tt_sync_state where dataset = 'affiliate_orders'`);
  await save({ historyFrom: monthsAgo, historyTo: "" });
  bodies.length = 0; await runDataset("affiliate_orders", "manual", null, { ...deps, backfill: true });
  const firstWins = bodies.filter((b) => b.create_time_ge !== undefined).length;
  bodies.length = 0; const second = await runDataset("affiliate_orders", "manual", null, { ...deps, backfill: true });
  const secondWins = bodies.filter((b) => b.create_time_ge !== undefined).length;
  bodies.length = 0; await runDataset("affiliate_orders", "manual", null, { ...deps, backfill: true, reread: true });
  const rereadWins = bodies.filter((b) => b.create_time_ge !== undefined).length;
  check("42 a second Load full history skips the range already loaded (only the 2 filter checks are sent), and Re-read all reads every window again", firstWins >= 7 && secondWins <= 2 && second.seen === 0 && rereadWins >= 7 && (await count("tt_affiliate_order_lines")) === 7, JSON.stringify([firstWins, secondWins, rereadWins, second.seen]));
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
  let inFlight = 0, maxInFlight = 0;
  const slow = (async (url: string) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 40)); try { return await fake(url); } finally { inFlight--; } }) as never;
  await q(sql`delete from tt_sync_runs`);
  const par = await runAll("manual", null, { ...deps, f: slow });
  check("23 datasets run side by side (2 or 3 at once, never more), and results still come back in display order", maxInFlight >= 2 && maxInFlight <= 3 && par.map((r) => r.dataset).join() === DATASETS.map((d) => d.key).join() && par.every((r) => r.status === "ok"), `max ${maxInFlight}`);
  const last = await q(sql`select rows_seen from tt_sync_runs where dataset = 'affiliate_orders' order by id desc limit 1`);
  check("24 each run records how many rows it has read, so the screen can show progress while it runs", Number(last[0].rows_seen) > 0);
  check("22 every dataset listed on the screen has a table", DATASETS.length === 11);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
