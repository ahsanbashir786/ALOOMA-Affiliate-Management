// Pure workflow logic (no database): turns the staff event log into a creator's current state.
// Because state is replayed from the log, undoing an event (marking it reverted) restores the earlier state exactly.
import { addDaysISO, dayKL } from "@/lib/time";

export type EventKind = "contacted" | "promised" | "rescheduled" | "needs_help" | "paused" | "resumed" | "note";
export type FollowupKind = "follow_up" | "promise" | "help" | "resume";

/**
 * How a scheduled follow-up ended. Only "completed" earns credit.
 *  completed   – a recorded contact, or a promise date given by the creator (a response)
 *  rescheduled – staff moved the date (needs help, or the promised deadline was moved)
 *  paused      – the creator was paused; the work was set aside, not done
 *  cancelled   – the creator was resumed / the schedule was replaced without any response
 *  (resolved automatically is decided later from content, in Progress – replay knows nothing about content)
 */
export type FollowupOutcome = "completed" | "rescheduled" | "paused" | "cancelled";

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
  /** When it ended (any outcome). */
  completedAt: Date | null;
  outcome: FollowupOutcome | null;
  /** True only for outcome "completed" done on or before the due day (Malaysia time). */
  onTime: boolean | null;
  /** For promise follow-ups: the "promised" event it belongs to. */
  promiseKey: number | null;
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
  /** Current deadlines of the promises recorded (by their "promised" event id), reflecting reschedules. */
  promises: { key: number; dueOn: string }[];
  /** The earliest current promise deadline. */
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
  promises: [],
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
  const promises = new Map<number, string>();
  const refreshPromiseOn = () => {
    st.promises = [...promises].map(([key, dueOn]) => ({ key, dueOn }));
    st.promiseOn = st.promises.length ? st.promises.map((p) => p.dueOn).sort()[0] : null;
  };

  const close = (e: StaffEvent, outcome: FollowupOutcome) => {
    if (!open) return;
    open.completedAt = e.at;
    open.outcome = outcome;
    open.onTime = outcome === "completed" ? dayKL(e.at) <= open.dueOn : null;
    st.followups.push(open);
    open = null;
  };
  const schedule = (e: StaffEvent, dueOn: string | null, kind: FollowupKind | null, promiseKey: number | null = null) => {
    st.nextOn = dueOn;
    st.nextKind = dueOn ? kind : null;
    if (dueOn && kind) open = { username, dueOn, setAt: e.at, kind, completedAt: null, outcome: null, onTime: null, promiseKey };
  };

  const sorted = events.filter((e) => !e.revertedAt).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
  for (const e of sorted) {
    const day = dayKL(e.at);
    switch (e.kind) {
      case "contacted": {
        const legacy = e.details?.legacy === true;
        // A contact from the old Action centre is a real record of a sent message, but it never creates reminders or credit.
        if (legacy) {
          st.lastContactedAt = e.at;
          st.lastContactedBy = e.userId;
          st.contactTimes.push(e.at);
          break;
        }
        close(e, "completed");
        st.lastContactedAt = e.at;
        st.lastContactedBy = e.userId;
        st.contactTimes.push(e.at);
        st.help = null;
        // with a promise still to come, the next look is the day after the (current) promised date
        const ahead = st.promises.filter((p) => p.dueOn >= day).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
        if (ahead) schedule(e, addDaysISO(ahead.dueOn, cfg.promiseFollowUpDays), "promise", ahead.key);
        else schedule(e, addDaysISO(day, cfg.followUpDays), "follow_up");
        break;
      }
      case "promised": {
        const promisedOn = str(e.details?.promisedOn);
        if (!promisedOn) break;
        close(e, "completed"); // the creator answered with a date
        promises.set(e.id, promisedOn);
        refreshPromiseOn();
        st.contactTimes = [];
        st.help = null;
        schedule(e, addDaysISO(promisedOn, cfg.promiseFollowUpDays), "promise", e.id);
        break;
      }
      case "rescheduled": {
        const key = typeof e.details?.promiseEventId === "number" ? e.details.promiseEventId : null;
        const toOn = str(e.details?.toOn);
        if (key == null || !toOn || !promises.has(key)) break;
        close(e, "rescheduled"); // moving a deadline is not a completed follow-up
        promises.set(key, toOn);
        refreshPromiseOn();
        schedule(e, addDaysISO(toOn, cfg.promiseFollowUpDays), "promise", key); // only the new deadline drives reminders
        break;
      }
      case "needs_help": {
        close(e, "rescheduled");
        const nextOn = str(e.details?.nextOn) ?? addDaysISO(day, 2);
        st.help = { reason: str(e.details?.reason) ?? "Needs help", nextOn, at: e.at, by: e.userId };
        schedule(e, nextOn, "help");
        break;
      }
      case "paused": {
        close(e, "paused"); // setting work aside is not completing it
        st.status = "paused";
        st.pausedReason = str(e.details?.reason);
        st.pausedAt = e.at;
        st.resumeOn = str(e.details?.resumeOn);
        schedule(e, st.resumeOn, "resume");
        break;
      }
      case "resumed": {
        close(e, "cancelled");
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
