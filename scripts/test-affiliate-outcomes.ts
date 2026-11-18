import assert from "node:assert/strict";
import { measureEvent, measureOutcomes, type Daily } from "@/lib/affiliate/outcomes";

const d = (rows: Record<string, Record<string, number>>): Daily => new Map(Object.entries(rows).map(([u, m]) => [u, new Map(Object.entries(m))]));
const ref = "2026-11-30";
// contacted on 2026-11-01: 14 days before (Oct 18–31) sold 100, 14 days after (Nov 1–14) sold 300
const daily = d({
  a: { "2026-10-20": 100, "2026-11-03": 300 },
  // nobody-contacted creators: 100 → 110 (+10%)
  c1: { "2026-10-25": 100, "2026-11-05": 110 },
  c2: { "2026-10-25": 0, "2026-11-05": 500 }, // no sales before: not a fair comparison, left out
});
const ev = { id: 1, username: "a", day: "2026-11-01", userId: "u1", action: "Push" };
const one = measureEvent(ev, daily, ref);
assert.equal(one.before, 100); assert.equal(one.after, 300); assert.ok(one.complete);

const o = measureOutcomes([ev], daily, ref);
assert.equal(o.worked.events, 1); assert.equal(o.worked.changePct, 200);
assert.equal(Math.round(o.control.changePct!), 10);
assert.equal(Math.round(o.lift!), 190, "200% for the contacted creator, 10% for the rest");
assert.equal(o.byAction.length, 1); assert.equal(o.byAction[0].action, "Push");

// too recent: the 14 days are not over, so it shows progress but does not count yet
const recent = { id: 2, username: "a", day: "2026-11-25", userId: "u1", action: "Chase" };
const r2 = measureOutcomes([recent], daily, ref);
assert.equal(r2.results.get(2)!.complete, false); assert.equal(r2.results.get(2)!.seen, 6);
assert.equal(r2.worked.events, 0); assert.equal(r2.lift, null);

// a creator with no sales before the contact is not counted (nothing to compare with)
const none = measureOutcomes([{ id: 3, username: "zz", day: "2026-11-01", userId: null, action: "Revive" }], daily, ref);
assert.equal(none.worked.events, 0);
// creators who were contacted are never part of the control group
const both = measureOutcomes([ev, { id: 4, username: "c1", day: "2026-11-01", userId: null, action: "Push" }], daily, ref);
assert.equal(both.control.before, 0 + 0, "c1 was contacted, so only c2-type creators remain, and c2 had no sales before");
console.log("affiliate outcomes: all passed");
