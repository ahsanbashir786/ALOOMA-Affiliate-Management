// Pure fulfilment engine (no database): decides how far each commitment is, from structured deliverables and content records.
// Rules, in short:
//  • A commitment is for ONE creator and may name a content type, a product and a quantity (all optional).
//  • A piece of content completes (part of) a commitment only if it is the right type, lists the agreed product, and has a KNOWN
//    posting date on/after the day the promise was recorded. Anything less reliable is a "possible match" → review, never automatic.
//  • A commitment with no agreed product cannot be matched reliably: matching content is flagged for review, staff confirm it.
//  • Each content piece counts once, and is used by at most one commitment unless staff deliberately record a shared use.
//  • Staff verification counts, but a verification date is never used as a posting date.

export type ContentPiece = {
  contentId: string;
  kind: "video" | "live";
  productIds: string[];
  /** YYYY-MM-DD in Malaysia time, only when a report states when it was posted. Null = unknown. */
  postedOn: string | null;
  /** First day we saw it (never a posting date). */
  firstObservedOn: string | null;
};

export type CommitmentInput = {
  id: number;
  recordedOn: string; // YYYY-MM-DD KL
  recordedSeq: number; // tie-break: creation order
  originalOn: string;
  dueOn: string; // current deadline
  contentType: "video" | "live" | null;
  quantity: number | null;
  /** Products the promise is about: the agreed product, or the products of its linked samples (legacy). Empty = none agreed. */
  productIds: string[];
};

export type DecisionInput = {
  id: number;
  /** When the decision was recorded (ISO). Together with `id` it orders decisions: the latest non-undone one wins. */
  at: string;
  contentId: string;
  decision: "verified" | "rejected";
  commitmentId: number | null;
  /** Sample-level decision: applies to commitments linked to that sample. */
  sampleLinked: boolean;
  shared: boolean;
  /** YYYY-MM-DD of the decision – only for display, never for timeliness. */
  decidedOn: string;
  /** Commitment ids this decision can apply to (resolved by the caller for sample-level decisions). */
  appliesTo: number[];
};

export type CommitmentResult = {
  id: number;
  state: "open" | "partial" | "review" | "fulfilled";
  needed: number;
  done: number;
  originalOn: string;
  dueOn: string;
  completedOn: string | null;
  timing: "on_time" | "late" | "unknown" | null;
  contentIds: string[];
  candidateIds: string[];
};

/**
 * The decision in force for one commitment and one content piece: the LATEST non-undone decision (by time, then id) among those
 * recorded for that commitment or, for sample-level decisions, for a sample it is linked to. Earlier decisions stay in the history
 * but no longer apply; undoing the latest one makes the previous one apply again (callers pass only non-undone decisions).
 */
export function effectiveDecision(c: { id: number }, contentId: string, decisions: DecisionInput[]): DecisionInput | null {
  let best: DecisionInput | null = null;
  for (const d of decisions) {
    if (d.contentId !== contentId) continue;
    if (!(d.commitmentId === c.id || (d.commitmentId == null && d.appliesTo.includes(c.id)))) continue;
    if (!best || d.at > best.at || (d.at === best.at && d.id > best.id)) best = d;
  }
  return best;
}

export function allocate(commitments: CommitmentInput[], pieces: ContentPiece[], decisions: DecisionInput[]): CommitmentResult[] {
  const byId = new Map<string, ContentPiece>();
  for (const p of pieces) if (!byId.has(p.contentId)) byId.set(p.contentId, p); // duplicate rows of one content id count once
  const ordered = [...commitments].sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.recordedSeq - b.recordedSeq || a.id - b.id);

  const rejected = (c: CommitmentInput, contentId: string) => effectiveDecision(c, contentId, decisions)?.decision === "rejected";
  const verifiedFor = (c: CommitmentInput) => {
    const ids = [...new Set(decisions.filter((d) => d.appliesTo.includes(c.id) || d.commitmentId === c.id).map((d) => d.contentId))];
    return ids.map((id) => effectiveDecision(c, id, decisions)).filter((d): d is DecisionInput => !!d && d.decision === "verified");
  };

  const claimed = new Map<string, number>(); // contentId → commitment that owns it
  const counted = new Map<number, Set<string>>();
  const sharedOk = new Map<number, Set<string>>(); // pieces a commitment may use although another owns them
  const take = (c: CommitmentInput, id: string, shared: boolean) => {
    const owner = claimed.get(id);
    if (owner !== undefined && owner !== c.id && !shared) return false;
    // a deliberately shared use counts for this commitment but does not take the piece away from anyone else
    if (owner === undefined && !shared) claimed.set(id, c.id);
    if (!counted.has(c.id)) counted.set(c.id, new Set());
    counted.get(c.id)!.add(id);
    if (shared && owner !== undefined && owner !== c.id) {
      if (!sharedOk.has(c.id)) sharedOk.set(c.id, new Set());
      sharedOk.get(c.id)!.add(id);
    }
    return true;
  };

  // Pass 1: pieces staff explicitly verified (earlier commitments win a piece unless the decision was recorded as shared).
  for (const c of ordered) for (const d of verifiedFor(c)) take(c, d.contentId, d.shared);

  // Pass 2: automatic matches.
  const autoMatch = (c: CommitmentInput, p: ContentPiece): "confirmed" | "uncertain" | null => {
    if (c.contentType && c.contentType !== p.kind) return null;
    if (rejected(c, p.contentId)) return null;
    const specified = c.productIds.length > 0;
    const productOk = specified && p.productIds.some((x) => c.productIds.includes(x));
    if (specified && p.productIds.length > 0 && !productOk) return null; // a different product: unrelated
    const dated = p.postedOn != null;
    if (dated) {
      if (p.postedOn! < c.recordedOn) return null; // posted before the promise
      return specified && productOk ? "confirmed" : "uncertain";
    }
    // unknown posting date: only plausible if it was first seen on/after the promise; never confirmed automatically
    if (p.firstObservedOn != null && p.firstObservedOn < c.recordedOn) return null;
    return "uncertain";
  };

  const candidates = new Map<number, Set<string>>();
  for (const c of ordered) {
    const pool = [...byId.values()]
      .map((p) => ({ p, m: autoMatch(c, p) }))
      .filter((x): x is { p: ContentPiece; m: "confirmed" | "uncertain" } => x.m != null)
      .sort((a, b) => (a.p.postedOn ?? "9999").localeCompare(b.p.postedOn ?? "9999") || a.p.contentId.localeCompare(b.p.contentId));
    for (const { p, m } of pool) {
      if (m === "confirmed") {
        if ((counted.get(c.id)?.size ?? 0) >= (c.quantity ?? 1) && !counted.get(c.id)?.has(p.contentId)) continue; // already enough
        take(c, p.contentId, false);
      } else if (!claimed.has(p.contentId) || claimed.get(p.contentId) === c.id) {
        if (!counted.get(c.id)?.has(p.contentId)) {
          if (!candidates.has(c.id)) candidates.set(c.id, new Set());
          candidates.get(c.id)!.add(p.contentId);
        }
      }
    }
  }

  return ordered.map((c) => {
    const needed = Math.max(1, c.quantity ?? 1);
    const ids = [...(counted.get(c.id) ?? [])];
    const done = ids.length;
    const cand = [...(candidates.get(c.id) ?? [])].filter((x) => !ids.includes(x));
    const state: CommitmentResult["state"] = done >= needed ? "fulfilled" : done > 0 ? "partial" : cand.length ? "review" : "open";
    let completedOn: string | null = null;
    let timing: CommitmentResult["timing"] = null;
    if (state === "fulfilled") {
      const dated = ids
        .map((id) => byId.get(id)?.postedOn ?? null)
        .sort((a, b) => (a ?? "9999").localeCompare(b ?? "9999"))
        .slice(0, needed);
      if (dated.some((d) => d == null)) timing = "unknown";
      else {
        completedOn = dated[dated.length - 1];
        timing = completedOn! <= c.dueOn ? "on_time" : "late";
      }
    }
    return { id: c.id, state, needed, done, originalOn: c.originalOn, dueOn: c.dueOn, completedOn, timing, contentIds: ids, candidateIds: cand };
  });
}
