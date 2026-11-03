// End-to-end acceptance checks for the affiliate workflow, on a SEPARATE test database.
// Usage:  DATABASE_URL=postgres://…/affiliate_test npx tsx --conditions=react-server scripts/test-workflow.ts
// Every record created here is synthetic: creators are named zz_test_*, staff events carry synthetic=true.
// The script refuses to run unless the database name ends in "_test", and it wipes that database first.
import { addDaysISO, todayKL } from "../src/lib/time";

const url = process.env.DATABASE_URL ?? "";
if (!/\/[^/]*_test(\?.*)?$/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point to a database whose name ends in _test (never production).");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`);
};

const T = todayKL();
const d = (n: number) => addDaysISO(T, n);
const dmy = (day: string, hm = "10:00:00") => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} ${hm}`;
const mdy = (day: string) => `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)} 10:00`;

const AFF_HEADER = ["Order ID", "SKU ID", "Product ID", "Product Name", "SKU name", "Seller SKU", "Price", "Payment Amount", "Quantity", "Fully returned or refunded", "Payment method", "Order Status", "Creator Username", "Content Type", "Content ID", "Time Created", "Payment time"];
const aff = (o: { id: string; pid: string; pname: string; creator: string; amt: number; created: string; status?: string; contentId: string; type?: string; sku?: string }) => [
  o.id, o.sku ?? "SKU" + o.pid, o.pid, o.pname, "variant", "SKU-" + o.pid, o.amt, o.amt, 1, "No", "Online", o.status ?? "Completed", o.creator, o.type ?? "Video", o.contentId, dmy(o.created), dmy(o.created),
];
const SHOP_HEADER = ["Order ID", "SKU ID", "Order Status", "Order Substatus", "Product Name", "Variation", "Seller SKU", "Quantity", "SKU Subtotal Before Discount", "Order Amount", "Created Time", "Delivered Time", "Shipped Time", "Payment Method", "Buyer Username", "Creator Handle"];
const sample = (o: { id: string; pid: string; pname: string; masked: string; created: string; delivered: string | null }) => [
  o.id, "SKU" + o.pid, "Completed", "", o.pname, "variant", "SKU-" + o.pid, 1, 0, 0, dmy(o.created), o.delivered ? dmy(o.delivered) : "", dmy(o.created), "", o.masked, "",
];
const VIDEO_HEADER = ["Video ID", "Creator name", "Post date", "Video link", "Video title", "Product ID", "Creator video-attributed GMV", "Video-attributed orders", "Video views"];

async function main() {
  const { sql: client, db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { importFile } = await import("../src/lib/ingest/import");
  const { refreshSamples } = await import("../src/lib/samples/service");
  const { generateActions } = await import("../src/lib/analytics/recommendations");
  const { addEvent, revertEvent, getWorkflowStates } = await import("../src/lib/workflow/events");
  const { createCommitment, getCommitments } = await import("../src/lib/workflow/commitments");
  const { getToday } = await import("../src/lib/workflow/today");
  const { getProgress } = await import("../src/lib/workflow/progress");
  const { getSampleScorecard } = await import("../src/lib/samples/analysis");
  const { contentDecisions } = await import("../src/db/schema");
  const one = async <R extends Record<string, unknown>>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as R[])[0];

  // fresh, empty, clearly-test database
  const tabs = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_\\_%'`)) as unknown as { tablename: string }[];
  await db.execute(sql.raw(`truncate ${tabs.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));

  const imp = (kind: string, header: string[], rows: (string | number)[][], extra: Record<string, unknown> = {}) =>
    importFile({ kind, filename: `SYNTHETIC-${kind}.xlsx`, header, rows: rows as never, periodStart: d(-40), periodEnd: T, ...extra } as never);

  // ───── Synthetic world ─────  (P1 = test bedsheet, P2 = test pillow)
  const P1 = "7000000000001", P2 = "7000000000002";
  const N1 = "ZZ TEST Bedsheet", N2 = "ZZ TEST Pillow";
  const mk = (id: number) => String(9100000000 + id);
  const orders1 = [
    aff({ id: mk(1), pid: P1, pname: N1, creator: "zz_test_veteran", amt: 100, created: d(-30), contentId: "800001" }),
    aff({ id: mk(2), pid: P1, pname: N1, creator: "zz_test_veteran", amt: 100, created: d(-5), contentId: "800001" }),
    // delta: repeated samples, 3 sales of the sampled product on its new video
    aff({ id: mk(3), pid: P1, pname: N1, creator: "zz_test_delta", amt: 100, created: d(-6), contentId: "810001" }),
    aff({ id: mk(4), pid: P1, pname: N1, creator: "zz_test_delta", amt: 100, created: d(-5), contentId: "810001" }),
    aff({ id: mk(5), pid: P1, pname: N1, creator: "zz_test_delta", amt: 100, created: d(-4), contentId: "810001" }),
  ];
  const bravoSale = aff({ id: mk(6), pid: P1, pname: N1, creator: "zz_test_bravo", amt: 80, created: d(-1), contentId: "820001" });
  const r1 = await imp("affiliate_orders", AFF_HEADER, orders1);
  check("1a first affiliate import adds all lines", r1.added === 5, JSON.stringify(r1));
  const sum = async () => one<{ n: number; g: number }>(sql`select count(*)::int n, coalesce(sum(payment_amount),0)::float8 g from order_lines`);
  const base = await sum();
  const r1b = await imp("affiliate_orders", AFF_HEADER, orders1);
  const again = await sum();
  check("1b same file twice: no duplicates, totals unchanged", again.n === base.n && again.g === base.g && r1b.added === 0, JSON.stringify({ base, again, r1b }));
  const overlap = [orders1[3], orders1[4], aff({ id: mk(7), pid: P2, pname: N2, creator: "zz_test_charlie", amt: 50, created: d(-1), contentId: "830001" })];
  const r1c = await imp("affiliate_orders", AFF_HEADER, overlap);
  const after = await sum();
  check("1c overlapping file: only the new line added", after.n === base.n + 1 && r1c.added === 1 && (r1c.updated ?? 0) + (r1c.skippedOlder ?? 0) + (r1c.unchanged ?? 0) === 2, JSON.stringify({ after, r1c }));

  // shop orders: free samples (RM 0, no payment method)
  const shop = [
    sample({ id: mk(101), pid: P1, pname: N1, masked: "z*********_alpha", created: d(-14), delivered: d(-12) }),
    sample({ id: mk(102), pid: P1, pname: N1, masked: "z*********_bravo", created: d(-11), delivered: d(-10) }),
    sample({ id: mk(103), pid: P1, pname: N1, masked: "z*********harlie", created: d(-11), delivered: d(-10) }),
    sample({ id: mk(104), pid: P1, pname: N1, masked: "z*********_delta", created: d(-22), delivered: d(-20) }),
    sample({ id: mk(105), pid: P1, pname: N1, masked: "z*********_delta", created: d(-10), delivered: d(-8) }),
    sample({ id: mk(106), pid: P1, pname: N1, masked: "z*********_echo", created: d(-9), delivered: d(-8) }),
  ];
  const rs = await imp("all_orders", SHOP_HEADER, shop);
  check("1d all-orders import adds the sample lines", rs.added === 6, JSON.stringify(rs));

  // videos: bravo posts the sampled product; charlie posts an UNRELATED product; delta posts the sampled product; echo posts a video with no product listed
  const vidsBravo = [
    ["820001", "zz_test_bravo", mdy(d(-1)), "https://www.tiktok.com/@zz_test_bravo/video/820001", "t", P1, 80, 1, 500],
  ];
  const vids = [
    ["830001", "zz_test_charlie", mdy(d(-1)), "https://www.tiktok.com/@zz_test_charlie/video/830001", "t", P2, 50, 1, 400],
    ["810001", "zz_test_delta", mdy(d(-7)), "https://www.tiktok.com/@zz_test_delta/video/810001", "t", P1, 300, 3, 900],
    ["840001", "zz_test_echo", mdy(d(-3)), "https://www.tiktok.com/@zz_test_echo/video/840001", "t", "", 0, 0, 100],
    ["800001", "zz_test_veteran", mdy(d(-31)), "https://www.tiktok.com/@zz_test_veteran/video/800001", "t", P1, 200, 2, 3000],
  ];
  await imp("video_list", VIDEO_HEADER, vids as never);
  const vidsAll = [...vidsBravo, ...vids];
  await db.execute(sql`insert into creators (username, phone) select distinct creator, '60100000000' from order_lines on conflict do nothing`);
  await db.execute(sql`insert into creators (username, phone) values ('zz_test_alpha','60100000001'),('zz_test_echo','60100000002'),('zz_test_bravo','60100000003') on conflict do nothing`);
  await refreshSamples();
  await generateActions();

  const res = async (c: string) => (await db.execute(sql`select coalesce(result_override, result) r, content_gmv::float8 g, content_orders o, post_by_source ps from samples where creator = ${c} order by id`)) as unknown as { r: string; g: number; o: number; ps: string | null }[];
  const alpha = await res("zz_test_alpha");
  check("setup: alpha delivered 12 days ago, nothing posted → not posted (default 7-day window passed)", alpha[0]?.r === "not_posted", JSON.stringify(alpha));

  // ───── (2) Contacted → follow-up scheduled; duplicate outreach suppressed ─────
  const focusBefore = await getToday("focus");
  check("2a alpha appears in Today's Work (sample chase) before any contact", focusBefore.rows.some((r) => r.username === "zz_test_alpha"), JSON.stringify(focusBefore.rows.map((r) => r.username)));
  const evt = await addEvent({ username: "zz_test_alpha", kind: "contacted", userId: null, synthetic: true });
  let st = (await getWorkflowStates(["zz_test_alpha"])).get("zz_test_alpha")!;
  check("2b Contacted schedules follow-up in 3 calendar days (KL)", st.nextOn === d(3) && st.nextKind === "follow_up", `${st.nextOn}`);
  const afterFocus = await getToday("focus");
  check("2c duplicate outreach suppressed after Contacted", !afterFocus.rows.some((r) => r.username === "zz_test_alpha"));
  const sched = await getToday("scheduled");
  check("2d creator is listed under Scheduled with the reason", sched.rows.some((r) => r.username === "zz_test_alpha" && /Follow-up on/.test(r.held ?? "")));
  await generateActions();
  check("2e refreshing recommendations keeps suppression", !(await getToday("focus")).rows.some((r) => r.username === "zz_test_alpha"));
  await revertEvent(evt, null);
  st = (await getWorkflowStates(["zz_test_alpha"])).get("zz_test_alpha")!;
  check("2f undo restores the earlier state (history kept)", st.nextOn === null && (await one<{ n: number }>(sql`select count(*)::int n from staff_events where id = ${evt} and reverted_at is not null`)).n === 1);

  // ───── (3) Promise survives imports and recommendation refreshes ─────
  const pEv = await addEvent({ username: "zz_test_bravo", kind: "promised", userId: null, details: { promisedOn: d(0) }, synthetic: true, at: new Date(Date.now() - 2 * 86400_000) });
  // bravo's own video was posted yesterday — the promise is recorded 2 days ago, so it is satisfied by content seen since
  const bIds = (await createCommitment({ username: "zz_test_bravo", eventId: pEv, promisedOn: d(0) })).sampleIds;
  check("3a promise is tied to the creator's open sample", bIds.length === 1, JSON.stringify(bIds));
  const cEv = await addEvent({ username: "zz_test_charlie", kind: "promised", userId: null, details: { promisedOn: d(-1) }, synthetic: true, at: new Date(Date.now() - 2 * 86400_000) });
  await createCommitment({ username: "zz_test_charlie", eventId: cEv, promisedOn: d(-1) });
  await refreshSamples();
  const agreedBefore = await res("zz_test_bravo");
  check("3b while the promise is outstanding, the agreed date replaces the default post-by date", agreedBefore[0]?.ps === "agreed", JSON.stringify(agreedBefore));
  const beforeC = (await getCommitments()).map((c) => `${c.username}:${c.promisedOn}`).sort();
  // later uploads: bravo's video and its sale now appear, plus a repeat of earlier files
  await imp("affiliate_orders", AFF_HEADER, [...orders1, bravoSale]);
  await imp("video_list", VIDEO_HEADER, vidsAll as never);
  await refreshSamples();
  await generateActions();
  const afterC = (await getCommitments()).map((c) => `${c.username}:${c.promisedOn}`).sort();
  check("3 promises survive re-imports and recommendation refresh", JSON.stringify(beforeC) === JSON.stringify(afterC) && beforeC.length === 2 && (await one<{ n: number }>(sql`select count(*)::int n from staff_events where kind = 'promised' and reverted_at is null`)).n === 2, JSON.stringify({ beforeC, afterC }));
  // ───── (4) Matching content updates the correct commitment; unrelated does not ─────
  const comms = await getCommitments();
  const cb = comms.find((c) => c.username === "zz_test_bravo")!;
  const cc = comms.find((c) => c.username === "zz_test_charlie")!;
  check("4a bravo's video of the sampled product fulfils bravo's promise", cb.state === "fulfilled" && cb.contentIds.includes("820001") && cb.contentSource === "system", JSON.stringify(cb));
  check("4b charlie's video of a different product does NOT fulfil charlie's promise", cc.state === "open" && cc.contentIds.length === 0, JSON.stringify(cc));
  const charlieRes = await res("zz_test_charlie");
  check("4c unrelated video does not mark charlie's sample as posted", charlieRes[0]?.r === "not_posted", JSON.stringify(charlieRes));
  const dueRows = (await getToday("due")).rows.map((r) => r.username);
  check("4d charlie's overdue promise is in Today's Work; bravo's fulfilled one is not", dueRows.includes("zz_test_charlie") && !dueRows.includes("zz_test_bravo"), JSON.stringify(dueRows));

  // uncertain vs confirmed: echo's video has no product listed
  const echo = await res("zz_test_echo");
  check("4e video without a product is 'needs review', not confirmed", echo[0]?.r === "uncertain", JSON.stringify(echo));
  const echoSample = await one<{ id: number }>(sql`select id from samples where creator = 'zz_test_echo' limit 1`);
  await db.insert(contentDecisions).values({ username: "zz_test_echo", sampleId: echoSample.id, contentId: "840001", decision: "verified", link: "https://www.tiktok.com/@zz_test_echo/video/840001", synthetic: true });
  await refreshSamples();
  check("4f staff-verified link counts as posted and survives a later full refresh", (await res("zz_test_echo"))[0]?.r === "posted_video");
  await imp("video_list", VIDEO_HEADER, vidsAll as never);
  await refreshSamples();
  check("4g staff decision survives re-import", (await res("zz_test_echo"))[0]?.r === "posted_video");

  // ───── (5) Repeated samples don't multiply sales ─────
  const delta = await res("zz_test_delta");
  const deltaScore = (await getSampleScorecard()).rows.find((r) => r.username === "zz_test_delta")!;
  check("5a delta has two sample lines", delta.length === 2);
  check("5b creator-level sales for the sampled product counted once (RM 300, 3 orders), not per sample", Math.round(deltaScore.contentGmv) === 300 && deltaScore.contentOrders === 3, JSON.stringify({ g: deltaScore.contentGmv, o: deltaScore.contentOrders }));

  // ───── (6) Older / invalid data leaves valid records and staff history intact ─────
  const eventsBefore = await one<{ n: number }>(sql`select count(*)::int n from staff_events`);
  const stale = [aff({ id: mk(1), pid: P1, pname: N1, creator: "zz_test_veteran", amt: 1, created: d(-30), status: "Canceled", contentId: "800001" })];
  const rOld = await imp("affiliate_orders", AFF_HEADER, stale);
  const row1 = await one<{ s: string; p: number }>(sql`select status s, payment_amount::float8 p from order_lines where order_id = ${mk(1)}`);
  check("6a a conflicting file cannot overwrite the stored line; it is flagged instead", row1.s === "Completed" && row1.p === 100 && ((rOld.skippedOlder ?? 0) + (rOld.conflicts ?? 0)) >= 1, JSON.stringify({ row1, rOld }));
  const before6 = await sum();
  let threw = false;
  try {
    await imp("affiliate_orders", AFF_HEADER, [["not-an-id", "x", "", "p", "", "", 1, 1, 1, "No", "Online", "Completed", "zz_test_x", "Video", "1", "bad date", ""]]);
  } catch {
    threw = true;
  }
  const after6 = await sum();
  const eventsAfter = await one<{ n: number }>(sql`select count(*)::int n from staff_events`);
  check("6b invalid file is rejected whole; data and staff history unchanged", threw && before6.n === after6.n && before6.g === after6.g && eventsBefore.n === eventsAfter.n);
  const mixed = [aff({ id: mk(8), pid: P1, pname: N1, creator: "zz_test_veteran", amt: 10, created: d(-1), contentId: "800001" }), ["bad", "", "", "", "", "", 1, 1, 1, "No", "Online", "Completed", "zz", "Video", "1", dmy(d(-1)), ""]];
  const rMixed = await imp("affiliate_orders", AFF_HEADER, mixed);
  check("6c a file with one bad row still loads the good row and reports the rejection", rMixed.added === 1 && Object.values(rMixed.rejected as Record<string, number>).reduce((a, b) => a + b, 0) === 1, JSON.stringify(rMixed));

  // ───── (7) Pause / resume ─────
  await addEvent({ username: "zz_test_charlie", kind: "paused", userId: null, details: { reason: "SYNTHETIC holiday", resumeOn: d(5) }, synthetic: true });
  const pausedToday = await getToday("paused");
  const focus7 = await getToday("focus");
  check("7a paused creator leaves the main list and appears under Paused with the reason", pausedToday.rows.some((r) => r.username === "zz_test_charlie" && /holiday/.test(r.held ?? "")) && !focus7.rows.some((r) => r.username === "zz_test_charlie"));
  await addEvent({ username: "zz_test_charlie", kind: "resumed", userId: null, synthetic: true });
  const st7 = (await getWorkflowStates(["zz_test_charlie"])).get("zz_test_charlie")!;
  check("7b resume reactivates the creator", st7.status === "active" && (await getToday("due")).rows.some((r) => r.username === "zz_test_charlie"));

  // unanswered attempts → pause suggestion only
  for (let i = 0; i < 3; i++) await addEvent({ username: "zz_test_alpha", kind: "contacted", userId: null, synthetic: true, at: new Date(Date.now() - (4 - i) * 86400_000 - 3600_000) });
  const alphaRow = [...(await getToday("due")).rows, ...(await getToday("scheduled")).rows].find((r) => r.username === "zz_test_alpha");
  check("7c three unanswered contacts → suggestion to pause (never automatic)", !!alphaRow?.suggestPause && alphaRow.status === "active", JSON.stringify(alphaRow && { a: alphaRow.attempts, s: alphaRow.suggestPause }));

  // ───── (8) Progress reconciles with dated records ─────
  const prog = await getProgress(28);
  const rawContacts = await one<{ n: number; u: number }>(sql`select count(*)::int n, count(distinct username)::int u from staff_events where kind = 'contacted' and reverted_at is null and (at at time zone 'Asia/Kuala_Lumpur')::date between ${prog.window.start}::date and ${prog.window.end}::date`);
  check("8a contacted actions and unique creators match the event log", prog.staff.contactActions === rawContacts.n && prog.staff.creatorsContacted === rawContacts.u, JSON.stringify({ prog: prog.staff, rawContacts }));
  check("8b follow-up buckets add up", prog.followUps.onTime + prog.followUps.late + prog.followUps.overdueOpen + prog.followUps.rescheduled + prog.followUps.pausedOrCancelled + prog.followUps.resolvedAutomatically + prog.followUps.notYetDue === prog.followUps.due);
  const rawPromises = await getCommitments();
  const inWin = rawPromises.filter((c) => c.dueOn >= prog.window.start && c.dueOn <= prog.window.end);
  check("8c promises due/fulfilled match the commitments", prog.promises.due === inWin.length && prog.promises.fulfilledOnTime + prog.promises.fulfilledLate + prog.promises.fulfilledTimingUnknown === inWin.filter((c) => c.state === "fulfilled").length);
  check("8d content pieces are counted once", prog.content.total <= (await one<{ n: number }>(sql`select count(*)::int n from content_items`)).n);
  check("8e sales comparison only when coverage allows", (prog.sales.comparison.current !== null) === (prog.sales.managedNow !== null));

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
