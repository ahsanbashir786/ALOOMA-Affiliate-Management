import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** Operational defaults for the daily workflow. They are choices of this team, not TikTok rules. */
export type WorkflowSettings = {
  /** Contacted with no other outcome: follow up after this many calendar days. */
  followUpDays: number;
  /** Promised date: follow up this many days after it if fulfilment is still unverified. */
  promiseFollowUpDays: number;
  /** "Needs help": default days until the next action. */
  helpDays: number;
  /** After this many unanswered contact attempts, suggest pausing (never an automatic label). */
  maxUnanswered: number;
  /** How many creators the default Today's Work list shows. */
  todayLimit: number;
  /** How many development / reactivation opportunities may join the default list. */
  developmentLimit: number;
  /** A sample that shipped but isn't delivered after this many days needs attention. */
  stuckTransitDays: number;
  /** A creator who sold before but has no sale in this many days is "inactive". */
  inactiveDays: number;
  /** An overdue promise older than this many days makes the relationship "stalled" and needs an owner look. */
  stalledOverdueDays: number;
};

export const DEFAULT_WORKFLOW: WorkflowSettings = {
  followUpDays: 3,
  promiseFollowUpDays: 1,
  helpDays: 2,
  maxUnanswered: 3,
  todayLimit: 15,
  developmentLimit: 5,
  stuckTransitDays: 10,
  inactiveDays: 28,
  stalledOverdueDays: 14,
};

export const getWorkflowSettings = cache(async (): Promise<WorkflowSettings> => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "workflow"));
  return { ...DEFAULT_WORKFLOW, ...((row?.value as Partial<WorkflowSettings>) ?? {}) };
});
