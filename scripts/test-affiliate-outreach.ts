import assert from "node:assert/strict";
import { giveMoreSamples, historyOf, readMarketCreators, requestStage } from "@/lib/affiliate/outreach";

const f = (o: Record<string, unknown>) => ({ status: "PENDING", hasOrder: false, approvable: true, delivered: false, shipped: false, hasPost: false, orderCancelled: false, ...o }) as never;
assert.equal(requestStage(f({})), "requested");
assert.equal(requestStage(f({ status: "APPROVED", approvable: false })), "approved");
assert.equal(requestStage(f({ hasOrder: true, status: "APPROVED", approvable: false })), "shipped");
assert.equal(requestStage(f({ hasOrder: true, delivered: true })), "delivered");
assert.equal(requestStage(f({ hasOrder: true, delivered: true, hasPost: true })), "posted");
assert.equal(requestStage(f({ status: "REJECTED" })), null); assert.equal(requestStage(f({ status: "EXPIRED" })), null);
assert.equal(requestStage(f({ hasOrder: true, orderCancelled: true })), null);
assert.equal(requestStage(f({ status: "UNFULFILL_CANCELLED", hasOrder: true, delivered: true })), "delivered", "TikTok's Overdue still means it was delivered");
assert.equal(requestStage(f({ approvable: false, status: "PENDING" })), null, "a request TikTok says cannot be approved is not offered");

const line = (o: Record<string, unknown>) => ({ pid: "quilt", sampled: true, status: "Steady", gmv28: 100, gmv: 500, ...o });
const row = (u: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}, gmvAll = 500, paused = false) => ({ username: u, lines: lines.map(line), allLines: lines.map(line), gmvAll, paused, extra: { gmv28: 100, score: 70, followers: 1000, ...extra } }) as never;
assert.match(historyOf(undefined).verdict, /New to you/);
assert.equal(historyOf(row("a", [{}])).tone, "good");
assert.equal(historyOf(row("a", [{ status: "Silent", gmv28: 0 }], { gmv28: 0 })).tone, "bad");
assert.equal(historyOf(row("a", [{ status: "Quiet", gmv28: 0 }], { gmv28: 0 }, 900)).tone, "warn");

const more = giveMoreSamples([
  row("good", [{}], { gmv28: 800 }), row("better", [{ pid: "mp_wp" }], { gmv28: 1500 }),
  row("outstanding", [{}, { pid: "pillows", status: "Silent", gmv28: 0 }], { gmv28: 900 }),
  row("notsampled", [{ sampled: false }], { gmv28: 700 }), row("paused", [{}], { gmv28: 600 }, 500, true), row("quiet", [{ status: "Quiet", gmv28: 0 }], { gmv28: 0 }),
]);
assert.deepEqual(more.map((m) => m.username), ["better", "good"], "best seller first; outstanding, unsampled, paused and quiet creators are left out");
assert.ok(more[0].neverSampled.length > 0 && !more[0].neverSampled.includes("Mattress Protector · Waterproof"), "lists the products never offered");

const m = readMarketCreators({ creators: [{ creator_user_open_id: "oid1", username: "abc", nickname: "ABC", follower_count: "12000", gmv: { amount: "3400.5" }, units_sold: 80 }], next_page_token: "t2" });
assert.deepEqual(m.creators[0], { id: "oid1", username: "abc", nickname: "ABC", followers: 12000, gmv: 3400.5, units: 80, category: null });
assert.equal(m.next, "t2");
const nested = readMarketCreators({ marketplace_creators: [{ basic_creator_information: {}, creator_profile: { username: "zz", user_id: "u9", follower_count: 5 }, sales_and_gmv: { gmv: 10 } }] });
assert.equal(nested.creators[0].username, "zz"); assert.equal(nested.creators[0].gmv, 10);
assert.deepEqual(readMarketCreators({}).creators, []);
console.log("affiliate outreach: all passed");
