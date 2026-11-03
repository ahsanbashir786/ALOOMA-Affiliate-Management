import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creators } from "@/db/schema";
import { normalisePhone } from "@/lib/ingest/import";
import { addEvent } from "./events";

/**
 * Adds a creator by hand so outreach can start without a sample or an export row. An existing creator is never overwritten
 * (their source stays "import"). "Contacted now" records the contact with the person's identity and the current time.
 */
export async function addCreator(input: { username: string; phone: string | null; contactedNow: boolean; userId: string | null; synthetic?: boolean }): Promise<{ existed: boolean } | { error: string }> {
  const phone = input.phone ? normalisePhone(input.phone) : null;
  if (input.phone && !phone) return { error: "Enter the number with country code, e.g. 60123456789." };
  const [existing] = await db.select({ u: creators.username }).from(creators).where(eq(creators.username, input.username));
  if (!existing) {
    await db.insert(creators).values({ username: input.username, phone, contactEdited: !!phone, source: "manual", addedBy: input.userId, addedAt: new Date() });
  }
  if (input.contactedNow) await addEvent({ username: input.username, kind: "contacted", userId: input.userId, synthetic: input.synthetic ?? false });
  return { existed: !!existing };
}
