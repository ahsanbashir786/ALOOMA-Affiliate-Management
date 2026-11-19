import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { loadCreatorRows } from "@/lib/creators/load";
import type { DirRow } from "@/lib/creators/workflow/directory";
import { todayKL } from "@/lib/time";
import { baselineOf, buildQueue, splitQueue } from "./actions";

export type SampleGuard = { notPosted: number; noSale: number; soldThenQuiet: number; creators: number; requestsWaiting: number; high: boolean };

/** Samples sent that are sitting idle: this share of all sent samples (delivered not posted + posted no sale) turns the warning on. */
const GUARD_HIGH = 25;

/** The sample guard counts product lines (creator + product), because one creator can hold several samples. */
export function sampleGuard(all: DirRow[]): SampleGuard {
  let notPosted = 0, noSale = 0, soldThenQuiet = 0, sampled = 0, requestsWaiting = 0;
  const holders = new Set<string>();
  for (const r of all) {
    requestsWaiting += r.extra?.requestsOpen ?? 0;
    for (const l of r.lines) {
      if (!l.sampled) continue;
      sampled++;
      if (l.status === "Silent") { notPosted++; holders.add(r.username); }
      else if (l.status === "Posted") { noSale++; holders.add(r.username); }
      else if (l.status === "Quiet") { soldThenQuiet++; holders.add(r.username); }
    }
  }
  const stuckShare = sampled ? ((notPosted + noSale) / sampled) * 100 : 0;
  return { notPosted, noSale, soldThenQuiet, creators: holders.size, requestsWaiting, high: stuckShare >= GUARD_HIGH };
}

export async function loadQueue() {
  const { all, ref } = await loadCreatorRows();
  if (!ref) return null;
  const baseline = baselineOf(all);
  const guard = sampleGuard(all);
  const queue = splitQueue(buildQueue(all, ref, baseline), todayKL(), guard.high);
  return { ref, guard, queue, baseline };
}


/** What Outreach last found (kept in settings), so the Command screen can show it without asking TikTok. */
const SUGGESTED_KEY = "outreach_suggested";
export type SuggestedHint = { eligible: number; notSure: number; own: number; at: number } | null;
export async function getSuggestedHint(): Promise<SuggestedHint> {
  const [r] = await db.select().from(settings).where(eq(settings.key, SUGGESTED_KEY));
  const v = r?.value as SuggestedHint | undefined;
  return v && typeof v.eligible === "number" ? v : null;
}
export async function saveSuggestedHint(h: NonNullable<SuggestedHint>) {
  await db.insert(settings).values({ key: SUGGESTED_KEY, value: h }).onConflictDoUpdate({ target: settings.key, set: { value: h, updatedAt: new Date() } });
}
