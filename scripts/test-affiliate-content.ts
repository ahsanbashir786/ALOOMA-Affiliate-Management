import assert from "node:assert/strict";
import { ageBucket, ageMix, classifyVideo } from "@/lib/affiliate/content";

assert.equal(classifyVideo({ total: 500, s14: 400, p14: 200, daysSinceLastSale: 0 }), "heating");
assert.equal(classifyVideo({ total: 120, s14: 120, p14: 0, daysSinceLastSale: 0 }), "heating", "a new video that starts selling");
assert.equal(classifyVideo({ total: 90, s14: 90, p14: 0, daysSinceLastSale: 1 }), "steady", "under RM 100 is not a peak");
assert.equal(classifyVideo({ total: 900, s14: 100, p14: 600, daysSinceLastSale: 1 }), "fading");
assert.equal(classifyVideo({ total: 900, s14: 300, p14: 400, daysSinceLastSale: 1 }), "steady");
assert.equal(classifyVideo({ total: 800, s14: 0, p14: 0, daysSinceLastSale: 40 }), "stopped");
assert.equal(classifyVideo({ total: 800, s14: 0, p14: 0, daysSinceLastSale: 200 }), "small", "dead for months is not news");
assert.equal(classifyVideo({ total: 200, s14: 0, p14: 0, daysSinceLastSale: 40 }), "small", "never sold much");
assert.equal(classifyVideo({ total: 0, s14: 0, p14: 0, daysSinceLastSale: null }), "small");
assert.equal(ageBucket(0), "d14"); assert.equal(ageBucket(14), "d14"); assert.equal(ageBucket(15), "d30"); assert.equal(ageBucket(91), "old");
const mix = ageMix([{ ageDays: 5, s28: 100 }, { ageDays: 200, s28: 300 }, { ageDays: null, s28: 999 }, { ageDays: 40, s28: 0 }]);
assert.equal(mix.find((m) => m.key === "old")!.share, 0.75); assert.equal(mix.find((m) => m.key === "d14")!.share, 0.25);
assert.equal(Math.round(mix.reduce((n, m) => n + m.share, 0) * 100), 100);
console.log("affiliate content: all passed");
