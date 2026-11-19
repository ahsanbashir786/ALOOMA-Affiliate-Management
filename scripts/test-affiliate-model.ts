import assert from "node:assert/strict";
import { affiliateCounts, hasNextStep } from "@/lib/affiliate/model";

const line = (action: string, status = "Steady", gmv28 = 0) => ({ action, status, gmv28, prev28: 0, gmv: gmv28, videos28: 0, sampled: true, noSample: false, sampleSkus: [], pid: "p", name: "P", reason: "", doneOn: null });
const row = (u: string, lines: ReturnType<typeof line>[], o: Record<string, unknown> = {}) => ({ username: u, paused: false, lines, allLines: lines, gmvAll: 0, extra: { requestsOpen: 0, lastSaleOn: null, gmv28: 0 }, ...o }) as never;
const all = [
  row("a", [line("Push", "Winner", 500), line("Revive", "Quiet")]),  // 2 lines, 1 creator
  row("b", [line("Keep")]),                                           // nothing to do
  row("c", [line("Approach", "New")]),                                // new creator
  row("d", [line("Chase", "Silent")], { paused: true }),              // paused: no next step
];
assert.equal(hasNextStep(all[0]), true);
assert.equal(hasNextStep(all[1]), false);
assert.equal(hasNextStep(all[3]), false, "paused creators have no next step");
const open = affiliateCounts(all, "2026-11-17", "2026-11-17", false);
assert.equal(open.creators, 4);
assert.equal(open.todoLines, 4, "lines: Push, Revive, Approach, Chase");
assert.equal(open.withNextStep, 2, "creators with a next step: a and c");
assert.equal(open.todo + open.held + open.waiting, open.withNextStep, "todo + held + waiting always equals creators with a next step");
const guarded = affiliateCounts(all, "2026-11-17", "2026-11-17", true);
assert.equal(guarded.held, 1, "new creator held while samples sit idle");
assert.equal(guarded.todo + guarded.held + guarded.waiting, guarded.withNextStep);
assert.equal(Object.values(open.byStage).reduce((n, x) => n + x, 0), 4, "every creator is in exactly one stage");
console.log("affiliate model: all passed");
