// Pure workflow logic (no database): turns the staff event log into a creator's current state.
// Because state is replayed from the log, undoing an event (marking it reverted) restores the earlier state exactly.
import { addDaysISO, dayKL } from "@/lib/time";

export type EventKind = "contacted" | "promised" | "needs_help" | "paused" | "resumed" | "note";
export type FollowupKind = "follow_up" | "promise" | "help" | "resume";

export type StaffEvent = {
  id: number;
  username: string;
  kind: EventKind;
  at: Date;
  userId: string | null;
  details: Record<string, unknown> | null;
  batchId: string | null;
  synthetic: boolean;
  revertedAt: Date | null;
};

/** A scheduled follow-up (derived from the events that set a next-action date). */
export type Followup = {
  username: string;
  dueOn: string;
  setAt: Date;
  kind: FollowupKind;
  /** The staff event that closed it (contacted, promised, needs help, paused, resumed). */
  completedAt: Date | null;
  onTime: boolean | null;
};

export type WorkflowState = {
  username: string;
  status: "active" | "paused";
  pausedReason: string | null;
  pausedAt: Date | null;
  resumeOn: string | null;
  lastContactedAt: Date | null;
  lastContactedBy: string | null;
  /** Contact attempts since the last promise or resume (the caller also drops those before the latest verified content). */
  contactTimes: Date[];
  promiseOn: string | null;
  nextOn: string | null;
  nextKind: FollowupKind | null;
  help: { reason: string; nextOn: string; at: Date; by: string | null } | null;
  followups: Followup[];
};

export type ReplayConfig = { followUpDays: number; promiseFollowUpDays: number };

export const emptyState = (username: string): WorkflowState => ({
  username,
  status: "active",
  pausedReason: null,
  pausedAt: null,
  resumeOn: null,
  lastContactedAt: null,
  lastContactedBy: null,
  contactTimes: [],
  promiseOn: null,
  nextOn: null,
  nextKind: null,
  help: null,
  followups: [],
});

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function replayEvents(username: string, events: StaffEvent[], cfg: ReplayConfig): WorkflowState {
  const st = emptyState(username);
  let open: Followup | null = null;

  const close = (e: StaffEvent) => {
    if (!open) return;
    open.completedAt = e.at;
    open.onTime = dayKL(e.at) <= open.dueOn;
    st.followups.push(open);
    open = null;
  };
  const schedule = (e: StaffEvent, dueOn: string | null, kind: FollowupKind | null) => {
    st.nextOn = dueOn;
    st.nextKind = dueOn ? kind : null;
    if (dueOn && kind) open = { username, dueOn, setAt: e.at, kind, completedAt: null, onTime: null };
  };

  const sorted = events.filter((e) => !e.revertedAt).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
  for (const e of sorted) {
    const day = dayKL(e.at);
    switch (e.kind) {
      case "contacted": {
        close(e);
        st.lastContactedAt = e.at;
        st.lastContactedBy = e.userId;
        st.contactTimes.push(e.at);
        st.help = null;
        // with a promise still to come, the next look is the day after the promised date
        const due =
          st.promiseOn && st.promiseOn >= day ? addDaysISO(st.promiseOn, cfg.promiseFollowUpDays) : addDaysISO(day, cfg.followUpDays);
        schedule(e, due, st.promiseOn && st.promiseOn >= day ? "promise" : "follow_up");
        break;
      }
      case "promised": {
        close(e);
        const promisedOn = str(e.details?.promisedOn);
        if (!promisedOn) break;
        st.promiseOn = promisedOn;
        st.contactTimes = [];
        st.help = null;
        schedule(e, addDaysISO(promisedOn, cfg.promiseFollowUpDays), "promise");
        break;
      }
      case "needs_help": {
        close(e);
        const nextOn = str(e.details?.nextOn) ?? addDaysISO(day, 2);
        st.help = { reason: str(e.details?.reason) ?? "Needs help", nextOn, at: e.at, by: e.userId };
        schedule(e, nextOn, "help");
        break;
      }
      case "paused": {
        close(e);
        st.status = "paused";
        st.pausedReason = str(e.details?.reason);
        st.pausedAt = e.at;
        st.resumeOn = str(e.details?.resumeOn);
        schedule(e, st.resumeOn, "resume");
        break;
      }
      case "resumed": {
        close(e);
        st.status = "active";
        st.pausedReason = null;
        st.pausedAt = null;
        st.resumeOn = null;
        st.contactTimes = [];
        schedule(e, null, null);
        break;
      }
      default:
        break; // notes change nothing
    }
  }
  if (open) st.followups.push(open);
  return st;
}

/** Unanswered attempts: contacts since the last promise/resume and after the latest verified content (if any). */
export const unansweredAttempts = (st: WorkflowState, latestContentAt?: Date | null) =>
  st.contactTimes.filter((t) => !latestContentAt || t > latestContentAt).length;
