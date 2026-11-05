export {};
// Creators module tests: sales rules, sample results, status, filters, owners, profile, export, score. Needs a *_test database.
if (!/_test$/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL must point to a *_test database."); process.exit(1); }
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? " → " + detail.slice(0, 300) : "")); };

async function main() {
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { creatorScore, tierOf } = await import("../src/lib/creators/score");
  const { parseCreatorParams } = await import("../src/lib/creators/params");
  const { loadCreatorRows } = await import("../src/lib/creators/load");
  const { getCreatorProfile } = await import("../src/lib/creators/profile");
  const { getAffiliateDirectory } = await import("../src/lib/workflow/directory");
  const { buildDirectoryWorkbook } = await import("../src/lib/affiliates/directory-export");
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Record<string, unknown>[];
  const ago = (d: number, h = 12) => new Date(Date.now() - d * 86400000 + (h - 12) * 3600000).toISOString();

  // ── score (pure) ──
  const base = { salesRank: 1, gmv28: 500, gmvAll: 5000, posted: 4, notPosted: 0, fulfilmentPct: 90, posts28: 8, weeks: [1, 1, 1, 1, 1, 1, 1, 1], followers: 1_000_000 };
  const top = creatorScore(base);
  check("score: a top creator is Gold with 100", top.score === 100 && top.tier === "Gold", JSON.stringify(top));
  check("score: nothing known = Starter", creatorScore({ ...base, salesRank: null, gmv28: 0, gmvAll: 0, posted: 0, notPosted: 0, fulfilmentPct: null, posts28: 0, weeks: [0, 0, 0, 0, 0, 0, 0, 0], followers: null }).tier === "Starter");
  check("score: tier edges", tierOf(70) === "Gold" && tierOf(69) === "Silver" && tierOf(45) === "Silver" && tierOf(44) === "Bronze" && tierOf(20) === "Bronze" && tierOf(19) === "Starter");
  check("score: never posting lowers reliability to 0", creatorScore({ ...base, posted: 0, notPosted: 3 }).parts.reliability === 0);
  check("score: posting counts – no posts earns 0, 4 posts half, 8+ full", creatorScore({ ...base, posts28: 0 }).parts.posting === 0 && creatorScore({ ...base, posts28: 4 }).parts.posting === 13 && creatorScore({ ...base, posts28: 20 }).parts.posting === 25);
  check("score: explains itself", /Sales \d+\/35 · Posting \d+\/25 · Reliability \d+\/15 · Consistency \d+\/15 · Reach \d+\/10/.test(top.why));

  // ── sample status (pure) ──
  const { isShippedStatus, isOverdueStatus } = await import("../src/lib/creators/sample-status");
  check("status: COMPLETED and UNFULFILL_CANCELLED (Overdue) were shipped; rejected, expired and cancelled were not",
    isShippedStatus("COMPLETED") && isShippedStatus("UNFULFILL_CANCELLED") && isShippedStatus("APPROVED") && !isShippedStatus("REJECTED") && !isShippedStatus("EXPIRED") && !isShippedStatus("CANCELLED") && !isShippedStatus("CANCELED"));
  check("status: only UNFULFILL_* is TikTok's Overdue", isOverdueStatus("UNFULFILL_CANCELLED") && !isOverdueStatus("COMPLETED") && !isOverdueStatus("CANCELLED"));

  // ── params ──
  const pp = parseCreatorParams({ from: "2026-01-05", to: "2026-02-10", owner: "none", tier: "Gold", sort: "score", samples: "with", status: "Winner", action: "todo", bogus: "x" });
  check("params: parsed", pp.source === "synced" && pp.owner === "none" && pp.tier === "Gold" && pp.sort === "score" && pp.samples === "with" && pp.range?.start === "2026-01-05" && pp.range?.end === "2026-02-10" && pp.from === "2026-01-05", JSON.stringify(pp));
  const pd = parseCreatorParams({ tier: "Platinum", owner: "x'; drop table", sort: "evil", days: "7" });
  check("params: junk is dropped", pd.tier === "" && pd.owner === "" && pd.sort === "gmv" && pd.from === "" && pd.range === undefined && pd.samples === "all");

  check("params: old ?days=28 link still works", parseCreatorParams({ days: "28" }).range !== undefined);
  check("params: only From means up to today; a reversed range is swapped; junk dates are ignored", parseCreatorParams({ from: "2026-01-05" }).range?.start === "2026-01-05" && parseCreatorParams({ from: "2026-03-01", to: "2026-02-01" }).range?.start === "2026-02-01" && parseCreatorParams({ from: "nope", to: "2026-13-45" }).range === undefined);
  check("params: follow-up type", parseCreatorParams({ contact: "contacted" }).contact === "contacted" && parseCreatorParams({ contact: "never" }).contact === "never");

  // ── fixture ──
  for (const t of ["tt_affiliate_order_lines", "tt_videos", "tt_lives", "tt_sample_requests", "tt_orders", "tt_skus", "tt_cancellations", "tt_returns", "tt_video_windows"]) await q(sql.raw(`delete from ${t}`));
  await q(sql`delete from creator_owners`);
  await q(sql`delete from staff_events where username like 'zz_c_%'`);
  await q(sql`delete from users where email like 'zzc-%'`);
  await q(sql`insert into tt_skus (sku_id, product_id, product_title, seller_sku, price, stock) values ('SKU-A', '1111111', 'ALOOMA Waterproof Mattress Protector Anti-Dust Mite', 'MP-A', 59, 10), ('SKU-B', '2222222', 'ALOOMA Selimut Soft Blanket', 'SL-B', 69, 5)`);
  let n = 0;
  const line = (creator: string, daysAgo: number, pid: string, price: number, qty = 1, extra: { type?: string; ret?: boolean; oid?: string } = {}) =>
    q(sql`insert into tt_affiliate_order_lines (order_id, sku_id, created_at, creator, content_type, product_id, seller_sku, quantity, price, commission_rate, est_commission, fully_return)
      values (${extra.oid ?? "O" + ++n}, ${pid === "1111111" ? "SKU-A" : "SKU-B"}, ${ago(daysAgo)}, ${creator}, ${extra.type ?? "VIDEO"}, ${pid}, ${pid === "1111111" ? "MP-A" : "SL-B"}, ${qty}, ${price}, 1000, ${price * 0.1}, ${extra.ret ?? false})`);
  // star: many sales lately
  for (let d = 1; d <= 20; d++) await line("zz_c_star", d, "1111111", 100, 2);
  await line("zz_c_star", 3, "1111111", 50, 1, { type: "LIVE" });
  // fillers (so "winner" means something)
  for (let i = 1; i <= 12; i++) await line("zz_c_fill" + i, 2 + i, "1111111", 20 + i);
  // returns / cancellations
  await line("zz_c_ret", 5, "1111111", 100, 1, { oid: "ORET1", ret: true });
  await line("zz_c_ret", 6, "1111111", 200, 1, { oid: "OCAN1" });
  await line("zz_c_ret", 7, "1111111", 60, 2, { oid: "OOK1" });
  await q(sql`insert into tt_cancellations (cancel_id, order_id, status) values ('X1', 'OCAN1', 'CANCELLATION_REQUEST_SUCCESS'), ('X2', 'OOK1', 'CANCELLATION_REQUEST_CANCELLED')`);
  // samples
  const req = (id: string, creator: string, pid: string, status: string, orderId: string | null, followers: number) =>
    q(sql`insert into tt_sample_requests (id, status, creator, nickname, followers, creator_gmv, fulfilment_pct, product_id, sku_id, product_title, sku_name, order_id, is_approvable, first_seen_at)
      values (${id}, ${status}, ${creator}, ${creator}, ${followers}, 9000, 80, ${pid}, ${pid === "1111111" ? "SKU-A" : "SKU-B"}, 'x', 'y', ${orderId}, ${status === "PENDING"}, ${ago(40)})`);
  const sampleOrder = (id: string, deliveredDaysAgo: number | null) =>
    q(sql`insert into tt_orders (order_id, status, is_sample, created_at, paid_at, updated_at, delivered_at, is_final) values (${id}, ${deliveredDaysAgo == null ? "IN_TRANSIT" : "DELIVERED"}, true, ${ago((deliveredDaysAgo ?? 2) + 4)}, ${ago((deliveredDaysAgo ?? 2) + 4)}, ${ago(1)}, ${deliveredDaysAgo == null ? null : ago(deliveredDaysAgo)}, ${deliveredDaysAgo != null})`);
  await req("R1", "zz_c_silent", "2222222", "APPROVED", "SO1", 12000); await sampleOrder("SO1", 30);
  await req("R2", "zz_c_wait", "2222222", "APPROVED", "SO2", 800); await sampleOrder("SO2", 3);
  await req("R3", "zz_c_posted", "2222222", "APPROVED", "SO3", 50000); await sampleOrder("SO3", 30);
  await q(sql`insert into tt_videos (video_id, creator, title, posted_at, views, gmv, units_sold, products) values ('V1', 'zz_c_posted', 'Selimut review', ${ago(20)}, 5000, 0, 0, ${JSON.stringify([{ id: "2222222", name: "Selimut" }])}::jsonb)`);
  await req("R4", "zz_c_req", "2222222", "PENDING", null, 300);
  await req("R5", "zz_c_rej", "2222222", "REJECTED", null, 300);
  // Overdue on TikTok (UNFULFILL_CANCELLED): shipped and delivered, decided by OUR evidence
  await req("R6", "zz_c_over", "2222222", "UNFULFILL_CANCELLED", "SO6", 900); await sampleOrder("SO6", 40);
  await req("R7", "zz_c_over_new", "2222222", "UNFULFILL_CANCELLED", "SO7", 900); await sampleOrder("SO7", 3);
  await req("R8", "zz_c_over_sold", "2222222", "UNFULFILL_CANCELLED", "SO8", 900); await sampleOrder("SO8", 40);
  await line("zz_c_over_sold", 10, "2222222", 69, 2);
  await req("R9", "zz_c_cancelled", "2222222", "CANCELLED", "SO9", 900); await sampleOrder("SO9", 40);
  await q(sql`insert into tt_videos (video_id, creator, title, posted_at, products) values ('V2', 'zz_c_new', 'hello', ${ago(10)}, '[]'::jsonb)`);
  await q(sql`insert into tt_lives (live_id, creator, title, started_at, ended_at, gmv, items_sold, viewers) values ('L1', 'zz_c_star', 'Live!', ${ago(4)}, ${ago(4, 14)}, 400, 5, 900)`);

  const { all, ref } = await loadCreatorRows();
  const by = (u: string) => all.find((r) => r.username === u);
  const line1 = (u: string, pid: string) => by(u)?.lines.find((l) => l.pid === pid);

  check("load: creators from orders, samples, videos and lives are all known", !!by("zz_c_star") && !!by("zz_c_silent") && !!by("zz_c_new") && !!by("zz_c_req"));
  check("load: reference day is the latest order", !!ref);
  const star = by("zz_c_star")!;
  check("load: sales = unit price × quantity", Math.round(star.gmvAll) === 20 * 200 + 50, String(star.gmvAll));
  check("load: video and LIVE sales are split", Math.round(line1("zz_c_star", "1111111")!.gmvLive) === 50 && line1("zz_c_star", "1111111")!.ordersLive === 1);
  const ret = line1("zz_c_ret", "1111111")!;
  check("sales: fully returned and cancelled orders are not counted, a withdrawn cancel request is", Math.round(ret.gmv) === 120 && ret.orders === 1, `${ret.gmv}/${ret.orders}`);
  check("status: the best seller lately is a Winner", line1("zz_c_star", "1111111")!.status === "Winner", line1("zz_c_star", "1111111")!.status);

  const sil = line1("zz_c_silent", "2222222")!;
  check("samples: delivered long ago, nothing posted → Silent / Chase", sil.status === "Silent" && sil.action === "Chase" && sil.sampled === true, `${sil.status}/${sil.action}`);
  const wt = line1("zz_c_wait", "2222222")!;
  check("samples: delivered 3 days ago → Waiting / Wait", wt.status === "Waiting" && wt.action === "Wait", `${wt.status}/${wt.action}`);
  const ps = line1("zz_c_posted", "2222222")!;
  check("samples: a video of the product after delivery → Posted / Coach", ps.status === "Posted" && ps.action === "Coach" && ps.videos === 1, `${ps.status}/${ps.action}/${ps.videos}`);
  check("samples: a pending request is counted, not turned into a line", by("zz_c_req")!.extra!.requestsOpen === 1 && by("zz_c_req")!.lines.every((l) => !l.sampled));
  check("samples: a declined request is not a sample", by("zz_c_rej")!.lines.every((l) => !l.sampled) && by("zz_c_rej")!.extra!.requestsOpen === 0);
  const ov1 = line1("zz_c_over", "2222222")!, ov2 = line1("zz_c_over_new", "2222222")!, ov3 = line1("zz_c_over_sold", "2222222")!;
  check("overdue on TikTok (UNFULFILL_CANCELLED), delivered, nothing found → a shipped sample, Silent / Chase", ov1?.sampled === true && ov1.status === "Silent" && ov1.action === "Chase", `${ov1?.sampled}/${ov1?.status}/${ov1?.action}`);
  check("overdue on TikTok even inside 14 days is still not posted without evidence", ov2?.sampled === true && ov2.status === "Silent", `${ov2?.status}`);
  check("overdue on TikTok but she sold the product after delivery → posted, not Silent", ov3?.sampled === true && ov3.status !== "Silent" && ov3.orders === 1, `${ov3?.status}/${ov3?.orders}`);
  check("a cancelled request is not a sample", by("zz_c_cancelled")!.lines.every((l) => !l.sampled));
  check("creator with only a video is New / Approach", by("zz_c_new")!.lines[0].status === "New" && by("zz_c_new")!.lines[0].action === "Approach");
  check("followers and TikTok creator GMV come from sample requests", by("zz_c_silent")!.extra!.followers === 12000 && by("zz_c_silent")!.extra!.creatorGmv === 9000);
  check("lines: product names are short listing names", line1("zz_c_star", "1111111")!.name === "Mattress Protector · Waterproof", line1("zz_c_star", "1111111")!.name);
  check("lines: SKU codes come from the sold SKUs", line1("zz_c_star", "1111111")!.skus.includes("MP-A"));
  check("type: LIVE session or LIVE orders make a creator Video + LIVE", star.type === "Video + LIVE", String(star.type));
  check("weeks: 8 weekly points and they add up to the last 8 weeks", star.extra!.weeks.length === 8 && Math.round(star.extra!.weeks.reduce((a, b) => a + b, 0)) > 3000);
  check("score and tier are filled for everyone", all.every((r) => r.extra && r.extra.score >= 0 && r.extra.score <= 100));
  check("score: the star is Gold-ranked above a filler", star.extra!.score > by("zz_c_fill1")!.extra!.score);

  // cache follows the records: a new staff action shows at once
  check("contact: not contacted yet", by("zz_c_star")!.lastContactedOn === null);
  const [u] = await q(sql`insert into users (name, email, password_hash, role, active) values ('Zed Zee', 'zzc-1@test.local', 'x', 'manager', true) returning id`);
  await q(sql`insert into staff_events (username, kind, details) values ('zz_c_star', 'contacted', ${JSON.stringify({ action: "Push", productId: "1111111" })}::jsonb)`);
  await q(sql`insert into creator_owners (username, user_id) values ('zz_c_star', ${u.id as string})`);
  const again = (await loadCreatorRows()).all.find((r) => r.username === "zz_c_star")!;
  check("cache: a new contact and owner show straight away", again.lastContactedOn !== null && again.extra!.ownerName === "Zed Zee" && again.lines[0].doneOn !== null, JSON.stringify([again.lastContactedOn, again.extra!.ownerName]));

  // ── directory filters ──
  const dir = (o: Record<string, unknown>) => getAffiliateDirectory({ source: "synced", samples: "all", size: 500, ...o });
  const all0 = await dir({});
  check("directory: overview counts everyone", all0.overview!.creators === all.length && all0.overview!.unowned === all.length - 1);
  check("directory: owner filter", (await dir({ owner: u.id as string })).rows.map((r) => r.username).join() === "zz_c_star" && (await dir({ owner: "none" })).total === all.length - 1);
  check("directory: search", (await dir({ q: "@ZZ_C_SIL" })).rows.map((r) => r.username).join() === "zz_c_silent");
  check("directory: status filter", (await dir({ status: "Silent" })).rows.every((r) => r.lines.every((l) => l.status === "Silent")) && (await dir({ status: "Silent" })).total >= 1);
  check("directory: To Do includes Chase and Approach", (await dir({ action: "todo" })).rows.some((r) => r.username === "zz_c_silent") && (await dir({ action: "todo" })).rows.some((r) => r.username === "zz_c_new"));
  check("directory: sample filter", (await dir({ samples: "with" })).rows.every((r) => r.allLines.some((l) => l.sampled)) && (await dir({ samples: "none" })).rows.every((r) => !r.allLines.some((l) => l.sampled)));
  check("directory: product filter keeps only that product", (await dir({ product: "2222222" })).rows.every((r) => r.lines.every((l) => l.pid === "2222222")));
  check("directory: sort by score puts the star first", (await dir({ sort: "score" })).rows[0].extra!.score >= (await dir({ sort: "score" })).rows[5].extra!.score);
  check("directory: sort by followers", (await dir({ sort: "followers" })).rows[0].username === "zz_c_posted");
  check("directory: type filter", (await dir({ type: "both" })).rows.every((r) => r.type === "Video + LIVE"));
  const narrow = await dir({ range: { start: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) } });
  check("directory: a short period only counts orders inside it", (narrow.rows.find((r) => r.username === "zz_c_star")?.gmvAll ?? 0) < star.gmvAll);
  const cont = await dir({ contact: "contacted" }), never = await dir({ contact: "never" });
  check("directory: follow-up type Contacted / Not contacted", cont.rows.some((r) => r.username === "zz_c_star") && !never.rows.some((r) => r.username === "zz_c_star") && cont.total + never.total === all.length, `${cont.total}+${never.total} vs ${all.length}`);
  check("overview: new creators in 28 days, sellers now and before", all0.overview!.newCreators28 > 0 && all0.overview!.sellersPrev >= 0 && all0.overview!.sellers28 > 0);
  check("steady seller who posts little gets Push", line1("zz_c_fill3", "1111111")!.action === "Push" || line1("zz_c_fill3", "1111111")!.status !== "Steady");
  check("directory: paging", (await dir({ size: 5, page: 2 })).rows.length === 5);

  // ── daily counts (the change on the top boxes) ──
  const { recordDailyCounts, countsToCompare } = await import("../src/lib/creators/counts");
  await q(sql`delete from creator_daily_counts`);
  check("counts: nothing saved yet → nothing to compare", (await countsToCompare()) === null);
  await recordDailyCounts({ creators: 10, sellers: 5, todo: 7, unowned: 10 });
  check("counts: today only is not a comparison", (await countsToCompare()) === null);
  await q(sql`insert into creator_daily_counts (day, creators, sellers, todo, unowned) values (current_date - 3, 9, 4, 6, 9), (current_date - 40, 5, 2, 3, 5), (current_date - 30, 7, 3, 4, 7)`);
  const cmpC = await countsToCompare();
  check("counts: compares with the newest day at least 28 days old", cmpC?.todo === 4 && cmpC.unowned === 7, JSON.stringify(cmpC));
  await q(sql`delete from creator_daily_counts where day < current_date - 20`);
  check("counts: before 28 days of history it uses the oldest day we have", (await countsToCompare())?.todo === 6);
  await recordDailyCounts({ creators: 11, sellers: 6, todo: 8, unowned: 9 });
  check("counts: the latest view of a day wins", ((await q(sql`select todo from creator_daily_counts where day = current_date`))[0].todo as number) === 8);
  await q(sql`delete from creator_daily_counts`);

  // ── profile ──
  const pr = (await getCreatorProfile("zz_c_silent"))!;
  check("profile: samples with stage and result", pr.samples.length === 1 && pr.samples[0].result === "not_posted" && pr.samples[0].stage === "Delivered" && pr.samples[0].postByOn !== null, JSON.stringify(pr.samples));
  const pov = (await getCreatorProfile("zz_c_over"))!;
  check("profile: overdue sample says so and is Not posted", pov.samples[0].result === "not_posted" && pov.samples[0].stage === "Delivered · overdue on TikTok", JSON.stringify(pov.samples[0]));
  check("profile: overdue sample with sales after delivery is Posted", (await getCreatorProfile("zz_c_over_sold"))!.samples[0].result === "posted");
  check("profile: pending and declined requests are shown too", (await getCreatorProfile("zz_c_req"))!.samples[0].result === "pending" && (await getCreatorProfile("zz_c_rej"))!.samples[0].result === "closed");
  const ps2 = (await getCreatorProfile("zz_c_posted"))!;
  check("profile: posted sample knows days to post", ps2.samples[0].result === "posted" && ps2.samples[0].daysToPost !== null && ps2.videos.length === 1);
  const pstar = (await getCreatorProfile("zz_c_star"))!;
  check("profile: 26 weeks, oldest first", pstar.weeks.length === 26 && pstar.weeks[0].week < pstar.weeks[25].week);
  check("profile: weeks add up to the sales", Math.round(pstar.weeks.reduce((a, w) => a + w.video + w.live, 0)) === Math.round(pstar.totals.gmv), `${pstar.weeks.reduce((a, w) => a + w.video + w.live, 0)} vs ${pstar.totals.gmv}`);
  check("profile: totals", pstar.totals.orders === 21 && pstar.totals.units === 41 && Math.round(pstar.totals.commission90) === 205, JSON.stringify(pstar.totals));
  check("profile: lives and latest orders", pstar.lives.length === 1 && pstar.lives[0].gmv === 400 && pstar.orders.length > 0 && pstar.orders[0].product === "Mattress Protector · Waterproof");
  const pret = (await getCreatorProfile("zz_c_ret"))!;
  check("profile: orders say Counted, Returned or Cancelled", ["Counted", "Returned", "Cancelled"].every((s) => pret.orders.some((o) => o.state === s)) && pret.totals.returnPct !== null && Math.round(pret.totals.returnPct) === 67, JSON.stringify(pret.orders.map((o) => o.state)));
  check("profile: unknown creator is null", (await getCreatorProfile("nobody_here")) === null);

  // ── export ──
  const d2 = await dir({ q: "zz_c_star" });
  const buf = await buildDirectoryWorkbook(d2.rows, d2.dataEnd);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Affiliate data")!;
  const heads = (ws.getRow(1).values as unknown[]).map(String);
  check("export: has the Creators columns", ["Followers", "Tier", "Score", "Owner", "GMV last 28 days (RM)"].every((h) => heads.includes(h)), heads.join());
  check("export: owner name is written", String(ws.getRow(2).getCell(heads.indexOf("Owner")).value) === "Zed Zee");

  await q(sql`delete from creator_owners`);
  await q(sql`delete from staff_events where username like 'zz_c_%'`);
  await q(sql`delete from users where email like 'zzc-%'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
