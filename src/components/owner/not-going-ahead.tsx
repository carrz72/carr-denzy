"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwiseIcon, HandPalmIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextAreaField } from "@/components/ui/field";
import { closeJobNotGoingAhead, reopenJob } from "@/app/(app)/app/actions";
import { NOT_GOING_AHEAD_REASONS, type NotGoingAheadReason } from "@/lib/job-outcomes";
import { cn } from "@/lib/cn";
import type { JobStatus } from "@/types/database";

/**
 * Closing a job the customer is not going ahead with, or reopening one.
 *
 * Most jobs that do not happen never get a formal no: the customer says so on
 * WhatsApp, or stops replying. This takes the reason in one tap so the open
 * list stays honest, without emailing anyone.
 */
export function NotGoingAhead({
  jobId,
  status,
  closedReason,
}: {
  jobId: string;
  status: JobStatus;
  closedReason: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<NotGoingAheadReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "declined") {
    function reopen() {
      setError(null);
      const formData = new FormData();
      formData.set("job_id", jobId);
      startTransition(async () => {
        const result = await reopenJob(formData);
        if (!result.ok) {
          setError(result.formError ?? "Could not reopen the job.");
          return;
        }
        router.refresh();
      });
    }

    return (
      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Not going ahead</h2>
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink">
          {closedReason ?? "Closed without a reason."}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          If they come back, reopen it as a new request and quote it again.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          loading={isPending}
          onClick={reopen}
          icon={<ArrowCounterClockwiseIcon size={18} />}
        >
          Reopen the job
        </Button>
        <div className="mt-3">
          <FormError message={error} />
        </div>
      </Card>
    );
  }

  if (status !== "new" && status !== "quoted") return null;

  function close() {
    if (!reason) {
      setError("Pick a reason first.");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("job_id", jobId);
    formData.set("reason", reason);
    formData.set("note", note);
    startTransition(async () => {
      const result = await closeJobNotGoingAhead(formData);
      if (!result.ok) {
        setError(result.errors?.reason ?? result.formError ?? "Could not close the job.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 self-start px-1 text-sm font-medium text-ink-subtle hover:text-ink"
      >
        <HandPalmIcon size={17} aria-hidden="true" />
        Customer not going ahead?
      </button>
    );
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Not going ahead</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Moves the job to your finished list and closes any open quote. The customer is not
        emailed.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink">Why?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NOT_GOING_AHEAD_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={reason === option}
              onClick={() => setReason(option)}
              className={cn(
                "min-h-11 rounded-md border px-3.5 text-[0.9375rem] font-medium",
                "transition-[border-color,background-color,color] duration-200",
                reason === option
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink hover:border-line-strong",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <TextAreaField
          id={`not-going-ahead-note-${jobId}`}
          name="note"
          label="Anything to remember"
          hint="Optional. Only you see this."
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="destructive" loading={isPending} onClick={close}>
          Close the job
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Keep it open
        </Button>
      </div>
      <div className="mt-3">
        <FormError message={error} />
      </div>
    </Card>
  );
}

/** One-tap close from the "Gone quiet" list on Today, reason "Went quiet". */
export function GoneQuietCloseButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    const formData = new FormData();
    formData.set("job_id", jobId);
    formData.set("reason", "Went quiet");
    startTransition(async () => {
      const result = await closeJobNotGoingAhead(formData);
      if (!result.ok) {
        setError(result.formError ?? "Could not close it.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" loading={isPending} onClick={close}>
        Close as went quiet
      </Button>
      {error ? <span className="text-xs text-critical">{error}</span> : null}
    </div>
  );
}
