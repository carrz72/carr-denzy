"use client";

import { useState, useTransition } from "react";
import { TrashIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError } from "@/components/ui/field";
import { deleteJob } from "@/app/(app)/app/actions";

/**
 * Deleting a job, as opposed to cancelling it.
 *
 * The two are easy to confuse and mean opposite things, so this says which is
 * which rather than offering a bare Delete button next to a bare Cancel. A job
 * that fell through is history and should be cancelled; a duplicate or a typo
 * is not history and should go.
 *
 * Deliberately at the bottom of the page, deliberately quiet, and behind a
 * confirm — it is the only control on a job that removes it from view, and
 * nobody arrives at this screen intending to press it.
 */
export function DeleteJob({
  jobId,
  jobTitle,
  blockedReason,
}: {
  jobId: string;
  jobTitle: string;
  /**
   * Set when the customer has already been sent a quote or an invoice exists.
   * The button is replaced by an explanation rather than failing on click.
   */
  blockedReason: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);

    const formData = new FormData();
    formData.set("job_id", jobId);

    startTransition(async () => {
      // On success the action redirects to the jobs list, so reaching here at
      // all means it refused.
      const result = await deleteJob(formData);
      if (!result.ok) setError(result.formError ?? "Could not delete that job.");
    });
  }

  return (
    <Card className="border-dashed">
      <h2 className="text-label uppercase text-ink-subtle">Delete this job</h2>

      {blockedReason ? (
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
          {blockedReason} Use <span className="font-medium text-ink">Something else</span> at
          the top to cancel it — the job stays on the record, marked cancelled.
        </p>
      ) : (
        <>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
            For a duplicate, a typo, or a job taken down against the wrong customer.
            Nothing has been sent on this one, so it can go.
          </p>

          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            If the work was real and simply is not going ahead,{" "}
            <span className="font-medium text-ink">cancel</span> it instead so it stays in
            the history.
          </p>

          {confirming ? (
            <div className="mt-5 rounded-lg border border-critical/30 bg-critical-soft p-4">
              <p className="flex items-start gap-2.5 font-medium text-critical">
                <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                Delete &ldquo;{jobTitle}&rdquo;?
              </p>

              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                It comes off your jobs and your diary. Any draft quote on it goes too.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="destructive" loading={isPending} onClick={remove}>
                  Yes, delete it
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)} disabled={isPending}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="mt-5"
              onClick={() => setConfirming(true)}
              icon={<TrashIcon size={18} />}
            >
              Delete this job
            </Button>
          )}
        </>
      )}

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}
