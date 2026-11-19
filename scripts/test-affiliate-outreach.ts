import assert from "node:assert/strict";
import { giveMoreSamples, historyOf, readCreatorProfile, readMarketCreators, requestStage } from "@/lib/affiliate/outreach";

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
assert.deepEqual({ ...m.creators[0] }, { id: "oid1", username: "abc", nickname: "ABC", followers: 12000, gmv: 3400.5, units: 80, category: null, avgVideoViews: null, avgLiveViewers: null, region: null, avatar: null, level: null, categoryIds: [], pps: null, officialRecommend: null, risingStar: null, fastGrowing: null, blocked: null, hasCollaborated: null, invited90d: null });
const docEx = readMarketCreators({ creators: [{ username: "abc", nickname: "cde", avatar: { url: "https://p16.example/x.webp" }, selection_region: "MY", category_ids: ["60001"], avg_ec_live_uv: 1331, avg_ec_video_view_count: 112, follower_count: 23241, gmv: { currency: "MYR", amount: "1232.90" } }] }).creators[0];
assert.equal(docEx.username, "abc"); assert.equal(docEx.avgVideoViews, 112); assert.equal(docEx.avgLiveViewers, 1331); assert.equal(docEx.region, "MY"); assert.equal(docEx.gmv, 1232.9); assert.equal(docEx.followers, 23241); assert.equal(docEx.category, "category 60001"); assert.equal(docEx.avatar, "https://p16.example/x.webp");
assert.equal(readMarketCreators({ creators: [{ avatar: { url: "javascript:alert(1)" } }] }).creators[0].avatar, null, "only https pictures");
assert.equal(m.next, "t2");
const nested = readMarketCreators({ marketplace_creators: [{ basic_creator_information: {}, creator_profile: { username: "zz", user_id: "u9", follower_count: 5 }, sales_and_gmv: { gmv: 10 } }] });
assert.equal(nested.creators[0].username, "zz"); assert.equal(nested.creators[0].gmv, 10);
assert.deepEqual(readMarketCreators({}).creators, []);
const withProfile = readMarketCreators({ creators: [{ creator_open_id: "OID9", username: "pro", nickname: "Pro", category_ids: ["600001"], follower_count: 5000, creator_profile: { creator_level: 6, pps_score: "4.3", is_official_recommend: true, is_rising_star: false, has_invited_90d: false, is_creator_blocked: false } }] }).creators[0];
assert.equal(withProfile.level, 6); assert.deepEqual(withProfile.categoryIds, ["600001"]); assert.equal(withProfile.pps, 4.3); assert.equal(withProfile.officialRecommend, true); assert.equal(withProfile.invited90d, false); assert.equal(withProfile.id, "OID9");
const emptyProfile = readMarketCreators({ creators: [{ creator_open_id: "O", username: "x", creator_profile: {} }] }).creators[0];
assert.equal(emptyProfile.level, null, "an empty profile (TikTok does not support it for this account) gives no level, not zero");
const perf = readCreatorProfile({ creator: { username: "dioab", follower_count: 2323, category_ids: ["60001"], pps: "4.5", rating: "3.2", post_rate: "100", creator_profile: { creator_level: 2, sample_score: 75, is_official_recommend: false, creator_fulfillment_score_90d: "4.1" } } });
assert.equal(perf.level, 2); assert.equal(perf.rating, 3.2); assert.equal(perf.sampleScore, 75); assert.equal(perf.fulfilmentScore, 4.1); assert.equal(perf.hasProfile, true); assert.equal(perf.postRate, 100);
assert.equal(readCreatorProfile({ creator: { username: "a", creator_profile: {} } }).hasProfile, false);
console.log("affiliate outreach: all passed");
