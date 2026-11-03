// Relationship status: where a collaboration stands overall. It is DERIVED and deliberately separate from
//   • sample status (shipped / delivered / posted), • task status (follow-up due / done), • commitment fulfilment (1/2, fulfilled).
// A creator can be "collaborating" with a sample posted, a promise half done and a follow-up due, all at once – these are different questions.

export type Relationship = "prospect" | "approached" | "collaborating" | "active" | "stalled" | "inactive" | "paused";

export const RELATIONSHIP: Record<Relationship, { label: string; tone: "neutral" | "brand" | "good" | "warn" | "critical"; hint: string }> = {
  prospect: { label: "New", tone: "neutral", hint: "No contact recorded and no sales seen yet." },
  approached: { label: "Approached", tone: "brand", hint: "Contacted; no promise, sample or content yet." },
  collaborating: { label: "Working together", tone: "good", hint: "A promise or sample is in progress." },
  active: { label: "Selling", tone: "good", hint: "Sales seen recently." },
  stalled: { label: "Stalled", tone: "critical", hint: "Several contacts without a promise or new content, or a promise is long overdue." },
  inactive: { label: "Inactive", tone: "warn", hint: "Sold before, nothing recently." },
  paused: { label: "Paused", tone: "neutral", hint: "Set aside by staff." },
};

export type RelationshipInput = {
  paused: boolean;
  /** Recorded contacts (legacy contacts count as history). */
  contacts: number;
  /** Contact attempts since the last promise / resume and after the latest verified content. */
  attempts: number;
  maxUnanswered: number;
  /** Promises not yet fulfilled. */
  outstanding: number;
  /** Days the most overdue outstanding promise is late (null when none is overdue). */
  overdueDays: number | null;
  stalledOverdueDays: number;
  sampleOpen: boolean;
  /** Last day with a valid sale (YYYY-MM-DD), and whether there was ever one. */
  lastSaleOn: string | null;
  today: string;
  inactiveDays: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** Order of the rules matters: pause wins, then trouble, then work in progress, then sales, then history. */
export function relationshipOf(i: RelationshipInput): Relationship {
  if (i.paused) return "paused";
  if ((i.attempts >= i.maxUnanswered && i.outstanding === 0) || (i.overdueDays != null && i.overdueDays >= i.stalledOverdueDays)) return "stalled";
  if (i.outstanding > 0 || i.sampleOpen) return "collaborating";
  if (i.lastSaleOn) {
    return daysBetween(i.lastSaleOn, i.today) <= i.inactiveDays ? "active" : "inactive";
  }
  return i.contacts > 0 ? "approached" : "prospect";
}
