// Regression tests for the commitment / content / reporting rules. SEPARATE TEST DATABASE ONLY.
//   DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-regressions.ts
// Synthetic records only (creators zz_test_*, events flagged synthetic). Refuses to run unless the database name ends in _test; wipes it first.
import { addDaysISO, todayKL } from "../src/lib/time";

const url = process.env.DATABASE_URL ?? "";
if (!/\/[^/]*_test(\?.*)?$/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point to a database whose name ends in _test (never production).");
  process.exit(2);
}
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`);
};

const T = todayKL();
const d = (n: number) => addDaysISO(T, n);
const dmy = (day: string, hm = "10:00:00") => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} ${hm}`;
const mdyDate = (day: string) => `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`; // date only → midnight
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const AFF = ["Order ID", "SKU ID", "Product ID", "Product Name", "SKU name", "Seller SKU", "Price", "Payment Amount", "Quantity", "Fully returned or refunded", "Payment method", "Order Status", "Creator Username", "Content Type", "Content ID", "Time Created", "Payment time"];
type Aff = { id: string; pid: string; creator: string; amt: number; created: string; status?: string; contentId: string; type?: string; refunded?: boolean; paid?: string };
const aff = (o: Aff) => [o.id, "SKU" + o.pid, o.pid, "ZZ TEST " + o.pid, "variant", "SKU-" + o.pid, o.amt, o.amt, 1, o.refunded ? "Yes" : "No", "Online", o.status ?? "Completed", o.creator, o.type ?? "Video", o.contentId, dmy(o.created), dmy(o.paid ?? o.created)];
const SHOP = ["Order ID", "SKU ID", "Order Status", "Order Substatus", "Product Name", "Variation", "Seller SKU", "Quantity", "SKU Subtotal Before Discount", "Order Amount", "Created Time", "Delivered Time", "Shipped Time", "Payment Method", "Buyer Username", "Creator Handle"];
const smp = (o: { id: string; pid: string; masked: string; created: string; delivered: string }) => [o.id, "SKU" + o.pid, "Completed", "", "ZZ TEST " + o.pid, "variant", "SKU-" + o.pid, 1, 0, 0, dmy(o.created), dmy(o.delivered), dmy(o.created), "", o.masked, ""];
const VID = ["Video ID", "Creator name", "Post date", "Video link", "Video title", "Product ID", "Creator video-attributed GMV", "Video-attributed orders", "Video views"];
const vid = (id: string, creator: string, postDate: string, pid: string) => [id, creator, postDate, `https://www.tiktok.com/@${creator}/video/${id}`, "t", pid, 0, 0, 100];

async function main() {
  const { sql: client, db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { importFile } = await import("../src/lib/ingest/import");
  const { refreshSamples } = await import("../src/lib/samples/service");
  const { generateActions } = await import("../src/lib/analytics/recommendations");
  const { addEvent, revertEvent, revertBatch, getWorkflowStates, loadEvents } = await import("../src/lib/workflow/events");
  const { createCommitment, getCommitments, refreshCommitments, rescheduleCommitment } = await import("../src/lib/workflow/commitments");
  const { getToday } = await import("../src/lib/workflow/today");
  const { getProgress } = await import("../src/lib/workflow/progress");
  const { getSampleScorecard, getSampleTotals, getSampleProducts, getSampleLines } = await import("../src/lib/samples/analysis");
    const { contentDecisions } = await import("../src/db/schema");
  const { replayEvents } = await import("../src/lib/workflow/replay");
  const { comparable, coveredDays } = await import("../src/lib/coverage");
  const { allocate } = await import("../src/lib/workflow/fulfilment");
  const { classify, affiliateDirection } = await import("../src/lib/ingest/freshness");
  const { resolveConflicts } = await import("../src/lib/ingest/conflicts");
  const one = async <R extends Record<string, unknown>>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as R[])[0];

  const tabs = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_\\_%'`)) as unknown as { tablename: string }[];
  await db.execute(sql.raw(`truncate ${tabs.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));

  const imp = (kind: string, header: string[], rows: (string | number)[][], start = d(-80), end = T) =>
    importFile({ kind, filename: `SYNTHETIC-${kind}.xlsx`, header, rows: rows as never, periodStart: start, periodEnd: end } as never);
  const P1 = "7000000000001", P2 = "7000000000002";
  let oid = 9300000000;
  const nid = () => String(++oid);
  const promise = async (username: string, dueOn: string, opts: { daysAgoRecorded?: number; productId?: string; contentType?: "video" | "live"; quantity?: number } = {}) => {
    const eventId = await addEvent({ username, kind: "promised", userId: null, details: { promisedOn: dueOn, ...opts }, synthetic: true, at: daysAgo(opts.daysAgoRecorded ?? 0) });
    const r = await createCommitment({ username, eventId, promisedOn: dueOn, productId: opts.productId, contentType: opts.contentType, quantity: opts.quantity });
    return { eventId, ...r };
  };
  const refresh = async () => { await refreshSamples(); };
  const comm = async (u: string) => (await getCommitments([u])).sort((a, b) => a.id - b.id);
  const mkCreators = async (names: string[]) => { for (const n of names) await db.execute(sql`insert into creators (username, phone) values (${n}, '60100000000') on conflict do nothing`); };

  // ═════ base orders: every test creator has at least one sale so they are known to the system ═════
  const names = ["nosample", "two", "resched", "pausey", "auto", "undated", "edgea", "edgeb", "dup", "unk", "conf", "hist", "other"].map((n) => "zz_test_" + n);
  await mkCreators(names);
  await imp("affiliate_orders", AFF, names.map((n, i) => aff({ id: nid(), pid: P1, creator: n, amt: 10 + i, created: d(-30), contentId: "90" + i })));
  await imp("all_orders", SHOP, []).catch(() => null); // no-op: shop file with no rows is rejected (nothing changes)

  // ───── 1. A creator WITHOUT samples fulfils a product-specific promise ─────
  const c1 = "zz_test_nosample";
  const p1 = await promise(c1, d(3), { productId: P1, contentType: "video", daysAgoRecorded: 1 });
  check("1a promise exists with no sample at all", p1.sampleIds.length === 0 && (await comm(c1))[0].state === "open");
  await imp("video_list", VID, [vid("100001", c1, mdyDate(d(0)), P1), vid("100002", c1, mdyDate(d(0)), P2)]);
  await refresh();
  const k1 = (await comm(c1))[0];
  check("1b a video of the agreed product, posted after the promise, fulfils it (no sample involved)", k1.state === "fulfilled" && k1.contentIds.join() === "100001" && k1.timing === "on_time", JSON.stringify(k1));
  check("1c the video of another product does not", !k1.contentIds.includes("100002"));

  // ───── 2. A two-video promise stays partial; duplicates never count twice ─────
  const c2 = "zz_test_two";
  await promise(c2, d(5), { productId: P1, contentType: "video", quantity: 2, daysAgoRecorded: 1 });
  await imp("video_list", VID, [vid("200001", c2, mdyDate(d(0)), P1)]);
  await refresh();
  let k2 = (await comm(c2))[0];
  check("2a one of two videos → partial 1/2", k2.state === "partial" && k2.done === 1 && k2.needed === 2, JSON.stringify(k2));
  await imp("video_list", VID, [vid("200001", c2, mdyDate(d(0)), P1)]); // duplicate import of the same file
  await refresh();
  for (let i = 0; i < 2; i++) await db.insert(contentDecisions).values({ username: c2, commitmentId: k2.id, contentId: "200001", decision: "verified", synthetic: true }); // repeated verification
  await refreshCommitments();
  k2 = (await comm(c2))[0];
  check("2b duplicate import and repeated verification of the same video still 1/2", k2.state === "partial" && k2.done === 1, JSON.stringify(k2));
  await imp("video_list", VID, [vid("200001", c2, mdyDate(d(0)), P1), vid("200002", c2, mdyDate(d(1) > T ? T : d(0)), P1)], d(-79));
  await refresh();
  k2 = (await comm(c2))[0];
  check("2c a second distinct video completes it (2/2)", k2.state === "fulfilled" && k2.done === 2, JSON.stringify(k2));
  // no silent reuse across commitments
  const c2b = "zz_test_dup";
  await promise(c2b, d(5), { productId: P1, daysAgoRecorded: 3 });
  await promise(c2b, d(6), { productId: P1, daysAgoRecorded: 2 });
  await imp("video_list", VID, [vid("210001", c2b, mdyDate(d(0)), P1)], d(-78));
  await refresh();
  const ks = await comm(c2b);
  check("2d one video completes only ONE of two separate commitments (no silent reuse)", ks.filter((k) => k.state === "fulfilled").length === 1 && ks.filter((k) => k.state !== "fulfilled").length === 1, JSON.stringify(ks.map((k) => k.state)));
  const open = ks.find((k) => k.state !== "fulfilled")!;
  await db.insert(contentDecisions).values({ username: c2b, commitmentId: open.id, contentId: "210001", decision: "verified", shared: true, synthetic: true });
  await refreshCommitments();
  check("2e explicit shared use is possible when deliberately recorded", (await comm(c2b)).every((k) => k.state === "fulfilled"));

  // ───── 3. Rescheduling removes the old reminder and keeps history ─────
  const c3 = "zz_test_resched";
  const p3 = await promise(c3, d(2), { productId: P2, daysAgoRecorded: 0 });
  let st3 = (await getWorkflowStates([c3])).get(c3)!;
  check("3a promise schedules its reminder the day after the deadline", st3.nextOn === d(3) && st3.nextKind === "promise", String(st3.nextOn));
  const second = await promise(c3, d(9), { productId: P1 });
  check("3b a second, independent promise does not overwrite the first", (await comm(c3)).length === 2 && (await comm(c3))[0].dueOn === d(2));
  await revertEvent(second.eventId, null);
  await refreshCommitments();
  const evt = await addEvent({ username: c3, kind: "rescheduled", userId: null, details: { commitmentId: (await comm(c3))[0].id, promiseEventId: p3.eventId, toOn: d(6) }, synthetic: true });
  await rescheduleCommitment({ commitmentId: (await comm(c3))[0].id, eventId: evt, toOn: d(6) });
  const kk = (await comm(c3))[0];
  st3 = (await getWorkflowStates([c3])).get(c3)!;
  check("3c rescheduling moves the current deadline, keeps the original and the change record", kk.dueOn === d(6) && kk.promisedOn === d(2) && kk.rescheduled === 1, JSON.stringify(kk));
  check("3d only the new deadline drives the reminder (old reminder is gone)", st3.nextOn === d(7) && st3.followups.some((f) => f.outcome === "rescheduled"), String(st3.nextOn));
  const prog3 = await getProgress(28);
  check("3e a reschedule is counted as a move, not as another promise secured", prog3.staff.deadlinesMoved === 1 && prog3.staff.promisesRecorded === (await one<{ n: number }>(sql`select count(*)::int n from staff_events where kind = 'promised' and reverted_at is null and username <> ''`)).n);
  await revertEvent(evt, null);
  await refreshCommitments();
  st3 = (await getWorkflowStates([c3])).get(c3)!;
  check("3f undo restores the previous valid state; history keeps the undone event", (await comm(c3))[0].dueOn === d(2) && st3.nextOn === d(3) && (await one<{ n: number }>(sql`select count(*)::int n from staff_events where id = ${evt} and reverted_at is not null`)).n === 1);

  // ───── 4. Pausing does not earn completed-follow-up credit ─────
  const mk = (id: number, kind: "contacted" | "paused", iso: string) => ({ id, username: "x", kind, at: new Date(iso), userId: null, details: kind === "paused" ? { reason: "holiday" } : null, batchId: null, synthetic: true, revertedAt: null });
  const pure = replayEvents("x", [mk(1, "contacted", "2026-11-01T02:00:00Z"), mk(2, "paused", "2026-11-02T02:00:00Z")], { followUpDays: 3, promiseFollowUpDays: 1 });
  check("4a (example) contact 1 Nov → due 4 Nov → pause 2 Nov: outcome paused, not on time", pure.followups[0].dueOn === "2026-11-04" && pure.followups[0].outcome === "paused" && pure.followups[0].onTime !== true && pure.status === "paused", JSON.stringify(pure.followups));
  const c4 = "zz_test_pausey";
  await addEvent({ username: c4, kind: "contacted", userId: null, synthetic: true, at: daysAgo(6) });
  await addEvent({ username: c4, kind: "paused", userId: null, details: { reason: "SYNTHETIC" }, synthetic: true, at: daysAgo(5) });
  const pr4 = await getProgress(28);
  const ctr = await addEvent({ username: "zz_test_other", kind: "contacted", userId: null, synthetic: true, at: daysAgo(6) });
  await addEvent({ username: "zz_test_other", kind: "contacted", userId: null, synthetic: true, at: daysAgo(4) }); // completes the follow-up (due in 3 days) on time
  const pr4b = await getProgress(28);
  check("4b Progress: paused work is shown as paused, earns no on-time credit", pr4.followUps.pausedOrCancelled >= 1 && pr4.followUps.onTime === 0 && pr4.followUps.onTimeRate !== 1);
  check("4c a real second contact counts on time; paused is outside the denominator (1 on time ÷ (1 on time + 1 overdue))", pr4b.followUps.onTime === 1 && pr4b.followUps.overdueOpen === 1 && pr4b.followUps.pausedOrCancelled === 1 && pr4b.followUps.onTimeRate === 0.5, JSON.stringify(pr4b.followUps));
  await revertEvent(ctr, null);

  // ───── 5. Verified content automatically resolves outstanding work ─────
  const c5 = "zz_test_auto";
  await promise(c5, d(-3), { daysAgoRecorded: 6 });
  await imp("video_list", VID, [vid("500001", c5, mdyDate(d(-4)), "")], d(-77)); // no product listed
  await refresh();
  let k5 = (await comm(c5))[0];
  check("5a no agreed product → the match is only suggested (review), never automatic", k5.state === "review" && k5.candidates.length === 1, JSON.stringify(k5));
  const due5 = (await getToday("due")).rows.find((r) => r.username === c5);
  check("5b the creator shows in Today's Work as overdue/needs-check", !!due5);
  await db.insert(contentDecisions).values({ username: c5, commitmentId: k5.id, contentId: "500001", decision: "verified", synthetic: true });
  await refreshCommitments();
  k5 = (await comm(c5))[0];
  check("5c staff verification fulfils it; posting date (not the verification date) judges timing", k5.state === "fulfilled" && k5.timing === "on_time" && k5.contentSource === "staff", JSON.stringify(k5));
  check("5d the outstanding work disappears from Today's Work", !(await getToday("due")).rows.some((r) => r.username === c5));
  const pr5 = await getProgress(28);
  check("5e Progress counts its follow-up as resolved automatically, not overdue", pr5.followUps.resolvedAutomatically >= 1);

  // ───── 6. Unknown posting date never fulfils ─────
  const c6 = "zz_test_undated";
  await imp("all_orders", SHOP, [smp({ id: nid(), pid: P1, masked: "z*********ndated", created: d(-12), delivered: d(-10) })]);
  await refresh();
  await promise(c6, d(2), { productId: P1, daysAgoRecorded: 3 });
  // a video that sells the sampled product but is NOT in Video analysis (so its posting date is unknown)
  await imp("affiliate_orders", AFF, [aff({ id: nid(), pid: P1, creator: c6, amt: 50, created: d(-1), contentId: "600001" })]);
  await refresh();
  const k6 = (await comm(c6))[0];
  const s6 = await one<{ r: string }>(sql`select coalesce(result_override, result) r from samples where creator = ${c6}`);
  check("6a an undated video does not fulfil the commitment (needs review)", k6.state === "review" && k6.done === 0, JSON.stringify(k6));
  check("6b nor does it mark the sample as posted (uncertain)", s6.r === "uncertain", s6.r);
  const sales6 = await one<{ c: number; o: number }>(sql`select content_gmv::float8 c, observed_gmv::float8 o from samples where creator = ${c6}`);
  check("6c its sales are 'observed', not counted as sample-content sales", sales6.c === 0 && sales6.o === 50, JSON.stringify(sales6));
  await db.insert(contentDecisions).values({ username: c6, commitmentId: k6.id, contentId: "600001", decision: "verified", synthetic: true });
  await refreshCommitments();
  const k6b = (await comm(c6))[0];
  check("6d once staff verify it, it counts – with timing 'unknown' (the posting date is still unknown)", k6b.state === "fulfilled" && k6b.timing === "unknown" && k6b.completedOn === null, JSON.stringify(k6b));

  // calendar-date matching: no one-day allowance
  await imp("all_orders", SHOP, [
    smp({ id: nid(), pid: P1, masked: "z*********dgea", created: d(-9), delivered: d(-5) }),
    smp({ id: nid(), pid: P1, masked: "z*********dgeb", created: d(-9), delivered: d(-5) }),
  ]);
  await imp("video_list", VID, [vid("610001", "zz_test_edgea", mdyDate(d(-6)), P1), vid("610002", "zz_test_edgeb", mdyDate(d(-5)), P1)], d(-76));
  await refresh();
  const ea = await one<{ r: string }>(sql`select coalesce(result_override, result) r from samples where creator = 'zz_test_edgea'`);
  const eb = await one<{ r: string }>(sql`select coalesce(result_override, result) r from samples where creator = 'zz_test_edgeb'`);
  check("6e a video dated the day BEFORE delivery is not post-delivery content", ea.r !== "posted_video", ea.r);
  check("6f a video dated the delivery day counts (cannot be proven earlier)", eb.r === "posted_video", eb.r);

  // ───── 7. Non-sample creator content appears once in Progress ─────
  await addEvent({ username: c1, kind: "contacted", userId: null, synthetic: true, at: daysAgo(10) });
  const before7 = (await getProgress(28)).content;
  await db.insert(contentDecisions).values({ username: c1, contentId: "100001", decision: "verified", synthetic: true });
  await imp("video_list", VID, [vid("100001", c1, mdyDate(d(0)), P1), vid("100002", c1, mdyDate(d(0)), P2)]);
  await refresh();
  const after7 = (await getProgress(28)).content;
  check("7a content from a creator with no sample is counted", before7.fromCreatorsWithoutSamples >= 1 && before7.postedAfterContact >= 1, JSON.stringify(before7));
  check("7b the same piece verified and re-imported is still counted once", after7.total === before7.total, JSON.stringify({ before7, after7 }));

  // ───── 8. Coverage: incomplete / gapped periods never produce a misleading comparison ─────
  const full = coveredDays([{ start: "2026-01-01", end: "2026-03-31" }], "2026-01-01", "2026-03-31");
  const ok8 = comparable(28, "2026-03-31", full);
  check("8a fully covered → equal 28-day periods", !!ok8.current && !!ok8.previous && ok8.current.days === 28 && ok8.previous.days === 28 && !ok8.shortened);
  const ends = comparable(28, "2026-03-31", coveredDays([{ start: "2026-01-01", end: "2026-03-20" }], "2026-01-01", "2026-03-31"));
  check("8b data ending early → both periods shortened equally, effective dates reported", !!ends.current && ends.current.end === "2026-03-20" && ends.shortened && ends.previous?.days === ends.current.days, JSON.stringify(ends));
  const gap = comparable(28, "2026-03-31", coveredDays([{ start: "2026-01-01", end: "2026-02-28" }, { start: "2026-03-10", end: "2026-03-31" }], "2026-01-01", "2026-03-31"));
  check("8c a gap inside either period → comparison withheld (never read as zero sales)", gap.current === null && /missing/.test(gap.withheld ?? ""), JSON.stringify(gap));
  const tiny = comparable(28, "2026-03-31", coveredDays([{ start: "2026-01-01", end: "2026-03-02" }], "2026-01-01", "2026-03-31"));
  check("8d too little current data → withheld", tiny.current === null && !!tiny.withheld);
  // database: order files recorded 80 days back through today – then punch a hole
  let pg = await getProgress(28);
  check("8e with recorded coverage the comparison is made", !!pg.sales.comparison.current, String(pg.sales.comparison.withheld));
  await db.execute(sql`update uploads set period_end = ${d(-10)}::date where kind = 'affiliate_orders'`);
  pg = await getProgress(28);
  check("8f Progress shortens both periods when current data ends early, and says which dates", !!pg.sales.comparison.current && pg.sales.comparison.current.end <= d(-10) && pg.sales.comparison.shortened, JSON.stringify(pg.sales.comparison));
  await db.execute(sql`update uploads set period_end = ${T}::date, period_start = ${d(-80)}::date where kind = 'affiliate_orders'`);
  await db.execute(sql`delete from uploads where kind = 'all_orders'`);
  await db.execute(sql`insert into uploads (kind, filename, period_start, period_end, row_count) values ('all_orders','SYNTHETIC-a',${d(-80)}::date,${d(-40)}::date,1),('all_orders','SYNTHETIC-b',${d(-30)}::date,${T}::date,1)`);
  pg = await getProgress(28);
  check("8g a missing stretch of shop orders withholds the comparison and the managed-sales figures", pg.sales.comparison.current === null && pg.sales.managedNow === null && pg.sales.newlySelling === null, JSON.stringify(pg.sales.comparison));
  await db.execute(sql`delete from uploads where kind = 'all_orders'`);
  await db.execute(sql`insert into uploads (kind, filename, period_start, period_end, row_count) values ('all_orders','SYNTHETIC-c',${d(-80)}::date,${T}::date,1)`);

  // ───── 9. Repeated samples never multiply sales – in any breakdown ─────
  const c9 = "zz_test_conf";
  await imp("all_orders", SHOP, [
    smp({ id: nid(), pid: P2, masked: "z*********_conf", created: d(-30), delivered: d(-28) }),
    smp({ id: nid(), pid: P2, masked: "z*********_conf", created: d(-20), delivered: d(-18) }),
  ]);
  await imp("video_list", VID, [vid("900001", c9, mdyDate(d(-10)), P2)], d(-75));
  await imp("affiliate_orders", AFF, [aff({ id: nid(), pid: P2, creator: c9, amt: 100, created: d(-9), contentId: "900001" })]);
  await refresh();
  const per = await one<{ g: number; o: number }>(sql`select coalesce(sum(content_gmv),0)::float8 g, coalesce(sum(content_orders),0)::int o from samples where creator = ${c9}`);
  const score = (await getSampleScorecard()).rows.find((r) => r.username === c9)!;
  const tot = await getSampleTotals();
  const prods = await getSampleProducts();
  const lines = (await getSampleLines([c9])).get(c9)!;
  const attributed = await one<{ n: number; g: number }>(sql`select count(*)::int n, coalesce(sum(pay),0)::float8 g from sample_sales where creator = ${c9}`);
  check("9a two samples then RM100 of qualifying sales → the combined total is RM100 (sample_sales)", attributed.n === 1 && attributed.g === 100, JSON.stringify(attributed));
  check("9b per-sample sums, creator scorecard and sample totals agree (RM100)", per.g === 100 && score.contentGmv === 100 && lines.reduce((a, l) => a + l.contentGmv, 0) === 100, JSON.stringify({ per, sc: score.contentGmv }));
  check("9c the product breakdown agrees (RM100 for this product, not 200)", prods.filter((p) => p.sku === "SKU-" + P2).reduce((a, p) => a + p.contentGmv, 0) >= 100 && prods.reduce((a, p) => a + p.contentGmv, 0) === tot.gmv, JSON.stringify({ tot: tot.gmv, prods: prods.map((p) => [p.sku, p.contentGmv]) }));
  check("9d totals reconcile with the attribution table", Math.abs(tot.gmv - (await one<{ g: number }>(sql`select coalesce(sum(pay) filter (where basis = 'content'),0)::float8 g from sample_sales`)).g) < 0.01);
  // unknown product identity must not credit unrelated sales
  const c9b = "zz_test_unk";
  await db.execute(sql`insert into samples (source, order_id, sku_id, seller_sku, product_name, quantity, buyer_masked, creator, order_status, delivered_at, approved_at)
    values ('orders', ${nid()}, 'SKU-UNKNOWN', 'SKU-UNKNOWN', 'No such product', 1, 'z*********_unk', ${c9b}, 'Completed', ${new Date(Date.now() - 10 * 86400_000).toISOString()}::timestamp, ${new Date(Date.now() - 12 * 86400_000).toISOString()}::timestamp)`);
  await imp("affiliate_orders", AFF, [aff({ id: nid(), pid: P1, creator: c9b, amt: 70, created: d(-2), contentId: "910001" })]);
  await refresh();
  const unk = await one<{ g: number; o: number }>(sql`select content_gmv::float8 g, observed_gmv::float8 o from samples where creator = ${c9b}`);
  check("9e a sample whose product cannot be identified is credited with nothing", unk.g === 0 && unk.o === 0, JSON.stringify(unk));

  // ───── 10. Conflicting imports preserve valid facts and surface uncertainty ─────
  const c10 = "zz_test_hist";
  const L = aff({ id: nid(), pid: P1, creator: c10, amt: 200, created: d(-20), contentId: "920001", paid: d(-19) });
  await imp("affiliate_orders", AFF, [L]);
  const lineOf = () => one<{ s: string; p: number; r: boolean }>(sql`select status s, payment_amount::float8 p, fully_refunded r from order_lines where order_id = ${String(L[0])}`);
  const newer = aff({ id: String(L[0]), pid: P1, creator: c10, amt: 150, created: d(-20), contentId: "920001", paid: d(-18) });
  const r10a = await imp("affiliate_orders", AFF, [newer]);
  check("10a a line with a newer lifecycle timestamp replaces the stored one", (r10a.updated ?? 0) === 1 && (await lineOf()).p === 150, JSON.stringify(r10a));
  const stale = aff({ id: String(L[0]), pid: P1, creator: c10, amt: 999, created: d(-20), contentId: "920001", paid: d(-19) });
  const r10b = await imp("affiliate_orders", AFF, [stale]);
  check("10b provably older information is skipped", (r10b.skippedOlder ?? 0) === 1 && (await lineOf()).p === 150, JSON.stringify(r10b));
  const tie = aff({ id: String(L[0]), pid: P1, creator: c10, amt: 777, created: d(-20), contentId: "920001", paid: d(-18) });
  const r10c = await imp("affiliate_orders", AFF, [tie]);
  const conf = await one<{ n: number }>(sql`select count(*)::int n from import_conflicts where status = 'pending'`);
  check("10c same timestamps, different values: stored fact kept, conflict recorded and reported", (r10c.conflicts ?? 0) === 1 && (await lineOf()).p === 150 && conf.n === 1 && (r10c.warnings ?? []).some((w) => /cannot be proven newer/.test(w)), JSON.stringify(r10c));
  const refunded = aff({ id: String(L[0]), pid: P1, creator: c10, amt: 150, created: d(-20), contentId: "920001", paid: d(-18), refunded: true });
  await imp("affiliate_orders", AFF, [refunded]);
  check("10d a new refund (no timestamp of its own) is accepted as an adverse change", (await lineOf()).r === true);
  await imp("affiliate_orders", AFF, [newer]);
  check("10e the reverse (refund disappearing) is NOT silently accepted", (await lineOf()).r === true && (await one<{ n: number }>(sql`select count(*)::int n from import_conflicts where status = 'pending' and reason like '%no longer shows%'`)).n === 1);
  const ids = ((await db.execute(sql`select id from import_conflicts where status = 'pending' order by id`)) as unknown as { id: number }[]).map((x) => x.id);
  await resolveConflicts(ids, "accept", null);
  check("10f the deliberate correction path applies the file's version and records the decision", (await lineOf()).r === false && (await one<{ n: number }>(sql`select count(*)::int n from import_conflicts where status = 'accepted' and resolved_at is not null`)).n === 1);
  check("10g pure rule: an older stamp is never treated as a conflict", classify({ asof: new Date("2026-01-02"), v: { a: 1 } }, { asof: new Date("2026-01-01"), v: { a: 2 } }, affiliateDirection).kind === "older");

  // ───── 11. Re-importing and refreshing preserve staff history ─────
  const snap = async () => ({
    ev: (await one<{ n: number }>(sql`select count(*)::int n from staff_events`)).n,
    cm: (await one<{ n: number }>(sql`select count(*)::int n from commitments`)).n,
    dc: (await one<{ n: number }>(sql`select count(*)::int n from content_decisions`)).n,
    ch: (await one<{ n: number }>(sql`select count(*)::int n from commitment_changes`)).n,
  });
  const s11 = await snap();
  await imp("affiliate_orders", AFF, names.map((n, i) => aff({ id: nid(), pid: P1, creator: n, amt: 5, created: d(-1), contentId: "94" + i })));
  await imp("video_list", VID, [vid("940001", c1, mdyDate(d(0)), P1)], d(-74));
  await refresh();
  await generateActions();
  check("11 events, commitments, links and decisions survive re-imports, content/commitment refreshes and recommendation refreshes", JSON.stringify(s11) === JSON.stringify(await snap()), JSON.stringify({ s11, now: await snap() }));
  check("11b staff verification still counts after everything was rebuilt", (await comm(c5))[0].state === "fulfilled" && (await comm(c6))[0].state === "fulfilled");

  // ───── 12. Undo and permissions ─────
  const c12 = "zz_test_other";
  const p12 = await promise(c12, d(4), { productId: P1 });
  await refreshSamples();
  check("12a undo of a promise removes the commitment from the live state (history kept)", (await revertEvent(p12.eventId, null), await refreshCommitments(), (await comm(c12)).length === 0) && (await one<{ n: number }>(sql`select count(*)::int n from staff_events where id = ${p12.eventId} and reverted_at is not null`)).n === 1);
  const b1 = "batch-test";
  for (const u of [c12, c1]) await db.execute(sql`insert into staff_events (username, kind, batch_id, synthetic) values (${u}, 'contacted', ${b1}, true)`);
  const undone = await revertBatch(b1, null);
  check("12b a bulk batch is undone as a whole", undone === 2);
  // Permissions (viewer/manager/owner, redirects, hidden buttons) need a real session and are exercised in the browser walkthrough, not here.
  void allocate; void loadEvents; void getWorkflowStates;

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
