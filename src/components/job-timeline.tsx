import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDateTime } from "@/lib/dates";
import { jobStatusLabels } from "@/components/ui/badge";
import type { JobEvent, JobStatus } from "@/types/database";
import { cn } from "@/lib/cn";

/**
 * The job timeline a customer sees (spec FR-21).
 *
 * Two things it deliberately does NOT do: show a status code, and show every
 * internal transition. It renders the journey as a customer understands it —
 * request, quote, booked, done, invoiced, paid — with the stages already
 * passed ticked off and the rest greyed ahead.
 *
 * A cancelled or declined job breaks out of the happy path and says so
 * plainly, rather than showing a progress bar stuck at 40%.
 */

const happyPath: JobStatus[] = [
  "new",
  "quoted",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "paid",
];

/** Plain-English descriptions of what each stage means for the customer. */
const stageBlurbs: Partial<Record<JobStatus, string>> = {
  new: "We have your request and are looking at it.",
  quoted: "We have sent you a price. Have a look and let us know.",
  accepted: "You have accepted the quote. We will book a date with you.",
  scheduled: "You are in the diary. We will confirm the arrival window.",
  in_progress: "We are on site working on it.",
  completed: "The work is finished. Your invoice will follow.",
  invoiced: "Your invoice is ready. Bank details are on it.",
  paid: "Settled in full. Thank you.",
};

export function JobTimeline({
  status,
  events,
}: {
  status: JobStatus;
  events: Pick<JobEvent, "to_status" | "created_at">[];
}) {
  // A cancelled or declined job is not a stalled happy path — say what happened.
  if (status === "cancelled" || status === "declined") {
    const event = [...events].reverse().find((item) => item.to_status === status);

    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-5">
        <p className="font-medium text-ink">
          {status === "cancelled" ? "This job was cancelled" : "This quote was declined"}
        </p>
        {event ? (
          <p className="mt-1 text-sm text-ink-muted">{formatDateTime(event.created_at)}</p>
        ) : null}
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          If that was not what you meant to happen, give us a ring on 07934 633583 and we
          will pick it back up.
        </p>
      </div>
    );
  }

  const currentIndex = happyPath.indexOf(status);

  // The first time each stage was reached. A job can move backwards (completed
  // → in_progress when something needs redoing), so the earliest stamp is the
  // honest one.
  const reachedAt = new Map<JobStatus, string>();
  for (const event of events) {
    if (!reachedAt.has(event.to_status)) {
      reachedAt.set(event.to_status, event.created_at);
    }
  }

  return (
    <ol className="flex flex-col">
      {happyPath.map((stage, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;
        const stamp = reachedAt.get(stage);
        const isLast = index === happyPath.length - 1;

        return (
          <li key={stage} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  isDone && "border-positive bg-positive text-white",
                  isCurrent && "border-accent bg-accent-soft text-accent",
                  isFuture && "border-line bg-surface text-ink-subtle",
                )}
              >
                {isDone ? (
                  <CheckIcon size={15} weight="bold" />
                ) : (
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      isCurrent ? "bg-accent" : "bg-line-strong",
                    )}
                  />
                )}
              </span>

              {!isLast ? (
                <span
                  aria-hidden="true"
                  className={cn("w-0.5 flex-1", isDone ? "bg-positive" : "bg-line")}
                />
              ) : null}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-7")}>
              <p
                className={cn(
                  "font-medium",
                  isCurrent && "text-accent-ink",
                  isDone && "text-ink",
                  isFuture && "text-ink-subtle",
                )}
              >
                {jobStatusLabels[stage]}
                {isCurrent ? (
                  <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-accent">
                    Now
                  </span>
                ) : null}
              </p>

              {isCurrent && stageBlurbs[stage] ? (
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {stageBlurbs[stage]}
                </p>
              ) : null}

              {stamp && !isFuture ? (
                <p className="mt-1 text-sm text-ink-subtle">{formatDateTime(stamp)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
