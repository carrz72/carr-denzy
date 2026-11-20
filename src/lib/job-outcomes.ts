/**
 * Why a job did not go ahead. Kept short and in the owner's words: these show
 * on the job and in the finished list, never to the customer.
 */
export const NOT_GOING_AHEAD_REASONS = [
  "Said no",
  "Went quiet",
  "Went elsewhere",
  "Too expensive",
  "Other",
] as const;

export type NotGoingAheadReason = (typeof NOT_GOING_AHEAD_REASONS)[number];

/** Set by the daily sweep when a quote runs out unanswered. */
export const NO_REPLY_REASON = "No reply to the quote";

/** Days a new request can sit untouched before it shows under "Gone quiet". */
export const GONE_QUIET_DAYS = 30;
