// One-word status and one-word action for a creator, from plain numbers. Pure (no database) and explained on screen.
//   STATUS  = how the creator is doing        ACTION = what the manager should do next

export type CreatorStatus = "Paused" | "Silent" | "Winner" | "Slipping" | "Rising" | "Steady" | "Quiet" | "Waiting" | "Posted" | "New";
export type CreatorAction = "Resume" | "Chase" | "Push" | "Reward" | "Revive" | "Coach" | "Keep" | "Wait" | "Approach";

export const STATUS_HELP: Record<CreatorStatus, string> = {
  Paused: "Set aside by staff.",
  Silent: "A sample is past its posting deadline with nothing posted and no recent sales.",
  Winner: "Among the top sellers of the last 28 days.",
  Slipping: "Sales fell by 30% or more compared with the 28 days before.",
  Rising: "Sales grew by 30% or more compared with the 28 days before.",
  Steady: "Selling at a similar level.",
  Quiet: "Sold before, nothing in the last 28 days.",
  Waiting: "A sample is on the way or still inside its posting window.",
  Posted: "Posted content for a sample but no sales yet.",
  New: "No sales and no samples recorded yet.",
};
export const ACTION_HELP: Record<CreatorAction, string> = {
  Resume: "Paused – decide when to come back.",
  Chase: "Remind them to post the sample content.",
  Push: "Selling well but posting little – ask for more videos.",
  Reward: "Selling and posting well – offer another sample.",
  Revive: "Ask for a fresh video or reach out again.",
  Coach: "Content is up but not converting – share a hook, voucher or brief.",
  Keep: "Nothing needed now.",
  Wait: "Inside the posting window – give them time.",
  Approach: "Make first contact.",
};

export type StatusInput = {
  paused: boolean;
  /** Valid sales (RM) in the latest 28 days of data, the 28 days before, and all time. */
  gmv28: number;
  prev28: number;
  gmvAll: number;
  /** Videos posted in the latest 28 days. */
  videos28: number;
  /** Sales at or above this in 28 days count as a winner (a high percentile of the sellers). */
  winnerGmv: number;
  samples: { sent: number; waiting: number; notPosted: number; posted: number };
};

/** Fewer than this many videos in 28 days counts as "posting little". */
export const LITTLE_POSTING = 2;

export function creatorStatus(i: StatusInput): { status: CreatorStatus; action: CreatorAction } {
  if (i.paused) return { status: "Paused", action: "Resume" };
  if (i.samples.notPosted > 0 && i.gmv28 <= 0) return { status: "Silent", action: "Chase" };
  if (i.gmv28 > 0 && i.gmv28 >= i.winnerGmv) return { status: "Winner", action: i.videos28 < LITTLE_POSTING ? "Push" : "Reward" };
  if (i.prev28 > 0 && i.gmv28 < i.prev28 * 0.7) return { status: "Slipping", action: i.videos28 === 0 ? "Revive" : "Coach" };
  if (i.gmv28 > 0 && i.gmv28 > i.prev28 * 1.3) return { status: "Rising", action: i.videos28 < LITTLE_POSTING ? "Push" : "Keep" };
  if (i.gmv28 > 0) return { status: "Steady", action: "Keep" };
  if (i.gmvAll > 0) return { status: "Quiet", action: "Revive" };
  if (i.samples.waiting > 0) return { status: "Waiting", action: "Wait" };
  if (i.samples.posted > 0) return { status: "Posted", action: "Coach" };
  return { status: "New", action: "Approach" };
}

/** The sales level that makes a creator a "winner": the given percentile of the 28-day sales of everyone who sold. */
export function winnerThreshold(gmv28s: number[], percentile = 0.9): number {
  const xs = gmv28s.filter((x) => x > 0).sort((a, b) => a - b);
  if (!xs.length) return Infinity;
  return xs[Math.min(xs.length - 1, Math.floor(xs.length * percentile))];
}
