// The one model behind every affiliate screen. Pure (no database).
//
//   STAGE      where the creator is in the journey (one per creator)        -> stages.ts
//   NEXT STEP  what to do with the creator now (one per creator, the best)   -> actions.ts (buildQueue)
//   TIER       how big the creator is (Gold, Silver, Bronze, Starter)        -> creators/score.ts
//   STATUS     the evidence behind the next step (Winner, Silent...); shown as the reason, not as a second label
//
// Every screen that shows a number of creators gets it from here, so a number and the list behind it always agree.
import type { DirRow } from "@/lib/creators/workflow/directory";
import { NEEDS_ACTION } from "@/lib/creators/status";
import { STAGES, stageOf, type StageKey } from "./stages";
import { baselineOf, buildQueue, splitQueue } from "./actions";

/** A creator has a next step when they are not paused and at least one product line needs work (Resume only counts when paused). */
export function hasNextStep(r: DirRow): boolean {
  return !r.paused && r.allLines.some((l) => NEEDS_ACTION.includes(l.action) && l.action !== "Resume");
}

export type AffiliateCounts = {
  creators: number;
  /** Creator + product lines that need an action (a creator can have several). */
  todoLines: number;
  /** Creators with a next step = todo + held + waiting. */
  withNextStep: number;
  /** Next step is open and ready to work. */
  todo: number;
  /** New creators held back while too many samples sit idle. */
  held: number;
  /** Contacted lately, waiting to see the result. */
  waiting: number;
  byStage: Record<StageKey, number>;
};

/** Every headline count of creators, computed once from the shared rows. */
export function affiliateCounts(all: DirRow[], ref: string, today: string, guardHigh: boolean): AffiliateCounts {
  const q = splitQueue(buildQueue(all, ref, baselineOf(all)), today, guardHigh);
  const byStage = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<StageKey, number>;
  let todoLines = 0;
  for (const r of all) {
    byStage[stageOf(r)]++;
    for (const l of r.allLines) if (NEEDS_ACTION.includes(l.action)) todoLines++;
  }
  return { creators: all.length, todoLines, withNextStep: q.todo.length + q.held.length + q.waiting.length, todo: q.todo.length, held: q.held.length, waiting: q.waiting.length, byStage };
}
