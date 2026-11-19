import assert from "node:assert/strict";
import { headline, healthChecks, resolveWindow } from "@/lib/affiliate/dashboard-logic";

// "Last 7 days" ending today, but data only reaches yesterday: still 7 days
const w = resolveWindow({ start: "2026-11-13", end: "2026-11-19" }, "2026-11-18");
assert.equal(w.days, 7); assert.equal(w.end, "2026-11-18"); assert.equal(w.start, "2026-11-12"); assert.equal(w.moved, true);
assert.equal(w.prevEnd, "2026-11-11"); assert.equal(w.prevStart, "2026-11-05", "the days before have the same length");
const same = resolveWindow({ start: "2026-11-01", end: "2026-11-07" }, "2026-11-18");
assert.equal(same.start, "2026-11-01"); assert.equal(same.end, "2026-11-07"); assert.equal(same.moved, false); assert.equal(same.days, 7);
const def = resolveWindow(undefined, "2026-11-18");
assert.equal(def.days, 28); assert.equal(def.end, "2026-11-18"); assert.equal(def.start, "2026-10-22"); assert.equal(def.prevEnd, "2026-10-21");
assert.equal(resolveWindow({ start: "2026-11-18", end: "2026-11-18" }, "2026-11-18").days, 1);

// your numbers: sales flat, more creators, far fewer new videos, most sales from old videos
const now = { sales: 168408, creators: 599, videos: 479, oldShare: 0.73 }, before = { sales: 168638, creators: 549, videos: 714, oldShare: 0.7 };
const c = healthChecks(now, before);
assert.deepEqual(c.map((x) => x.status), ["good", "good", "problem", "problem"]);
assert.match(c[0].answer, /about the same as last period/); assert.match(c[1].answer, /599 creators made a sale, up 9% on 549/);
assert.match(c[2].answer, /479 new videos and LIVE sessions, down 33% on 714/); assert.equal(c[2].button?.href, "/affiliate/actions?lever=content");
assert.match(c[3].answer, /73% of video and LIVE sales come from videos older than 30 days/); assert.equal(c[3].button?.href, "/affiliate/content?tab=fading");
assert.equal(c[0].button, undefined, "a good answer needs no button");
assert.equal(headline(c), "Sales are holding, but new posting has dropped and sales depend on old videos.");
// thresholds
assert.equal(healthChecks({ ...now, sales: 150000 }, before)[0].status, "watch"); assert.equal(healthChecks({ ...now, sales: 120000 }, before)[0].status, "problem");
assert.equal(healthChecks({ ...now, videos: 600 }, before)[2].status, "watch"); assert.equal(healthChecks({ ...now, videos: 700 }, before)[2].status, "good");
assert.equal(healthChecks({ ...now, oldShare: 0.5 }, before)[3].status, "watch"); assert.equal(healthChecks({ ...now, oldShare: 0.2 }, before)[3].status, "good");
assert.equal(healthChecks({ ...now, creators: 480 }, before)[1].status, "problem");
// healthy and nothing to compare with
const ok = healthChecks({ sales: 200000, creators: 700, videos: 800, oldShare: 0.2 }, before);
assert.equal(headline(ok), "Affiliate sales are healthy."); assert.ok(ok.every((x) => x.status === "good" && !x.button));
const none = healthChecks({ sales: 0, creators: 0, videos: 0, oldShare: null }, { sales: 0, creators: 0, videos: 0, oldShare: null });
assert.ok(none.every((x) => x.status === "good")); assert.match(none[3].answer, /No video or LIVE sales/);
assert.equal(headline(healthChecks({ ...now, sales: 120000 }, before)), "Sales are falling, but new posting has dropped and sales depend on old videos.");
console.log("affiliate dashboard: all passed");
