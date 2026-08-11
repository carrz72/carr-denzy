"use client";

import { useState, useTransition } from "react";
import {
  CalendarPlusIcon,
  CheckIcon,
  NotePencilIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { CheckField, FormError, TextAreaField, TextField } from "@/components/ui/field";
import { addJobNote, scheduleJob, updateJobStatus } from "@/app/(app)/app/actions";
import { jobStatusLabels } from "@/components/ui/badge";
import { queueOutboxItem, isOnline } from "@/lib/outbox";
import { todayInLondon } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { JobStatus } from "@/types/database";

/**
 * The three things the owner does to a job while standing in someone's house:
 * move it along, book it in, and write down what they found.
 *
 * The status control offers only the moves that are legal from where the job
 * is now, so an impossible transition is never presented and then refused
 * (spec FR-31). The list mirrors `job_transition_allowed()` in SQL — the
 * database is still the authority, this just avoids offering a dead button.
 */
const nextSteps: Record<JobStatus, JobStatus[]> = {
  new: ["quoted", "scheduled", "cancelled"],
  quoted: ["accepted", "declined", "scheduled", "cancelled"],
  accepted: ["scheduled", "in_progress", "cancelled"],
  declined: ["quoted", "cancelled"],
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced", "in_progress", "cancelled"],
  invoiced: ["paid", "completed", "cancelled"],
  paid: ["invoiced"],
  cancelled: ["new"],
};

/** The move the owner most likely wants, given where the job is. */
const primaryStep: Partial<Record<JobStatus, { to: JobStatus; label: string }>> = {
  accepted: { to: "scheduled", label: "Book it in" },
  scheduled: { to: "in_progress", label: "Start work" },
  in_progress: { to: "completed", label: "Mark finished" },
  completed: { to: "invoiced", label: "Invoice it" },
};

export function JobStatusControl({
  jobId,
  status,
}: {
  jobId: string;
  status: JobStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const primary = primaryStep[status];
  const options = nextSteps[status] ?? [];

  function move(to: JobStatus) {
    setError(null);
    const formData = new FormData();
    formData.set("job_id", jobId);
    formData.set("status", to);

    startTransition(async () => {
      const result = await updateJobStatus(formData);
      if (!result.ok) setError(result.formError ?? "Could not change the status.");
      else setShowAll(false);
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Where is it up to?</h2>

      <p className="mt-3 font-display text-subheading text-ink">{jobStatusLabels[status]}</p>

      {primary ? (
        <Button
          size="lg"
          fullWidth
          className="mt-4"
          loading={isPending}
          onClick={() => move(primary.to)}
          icon={<CheckIcon size={19} weight="bold" />}
        >
          {primary.label}
        </Button>
      ) : null}

      {options.length > 0 ? (
        <div className="mt-3">
          {showAll ? (
            <ul className="flex flex-col gap-2">
              {options.map((option) => (
                <li key={option}>
                  <Button
                    variant={option === "cancelled" ? "quiet" : "secondary"}
                    fullWidth
                    disabled={isPending}
                    onClick={() => move(option)}
                  >
                    {jobStatusLabels[option]}
                  </Button>
                </li>
              ))}
              <li>
                <Button variant="quiet" fullWidth onClick={() => setShowAll(false)}>
                  Close
                </Button>
              </li>
            </ul>
          ) : (
            <Button variant="quiet" fullWidth onClick={() => setShowAll(true)}>
              Something else
            </Button>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}

export function ScheduleForm({
  jobId,
  scheduledStart,
  durationMinutes,
}: {
  jobId: string;
  scheduledStart: string | null;
  durationMinutes: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const existing = scheduledStart ? new Date(scheduledStart) : null;

  function handleSubmit(formData: FormData, force = false) {
    setErrors({});
    setError(null);
    setSaved(false);
    if (force) formData.set("confirm_overlap", "on");

    startTransition(async () => {
      const result = await scheduleJob(formData);

      if (result.warning) {
        setWarning(result.warning);
        return;
      }

      setWarning(null);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setError(result.formError ?? null);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">
        {existing ? "Booked in" : "Book it in"}
      </h2>

      <form
        action={(formData) => handleSubmit(formData)}
        className="mt-4 flex flex-col gap-4"
        id={`schedule-${jobId}`}
      >
        <input type="hidden" name="job_id" value={jobId} />

        <TextField
          name="date"
          label="Date"
          type="date"
          required
          min={todayInLondon()}
          defaultValue={existing ? existing.toISOString().slice(0, 10) : todayInLondon()}
          error={errors.date}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="time"
            label="Arriving"
            type="time"
            required
            step={900}
            defaultValue={
              existing
                ? `${String(existing.getHours()).padStart(2, "0")}:${String(existing.getMinutes()).padStart(2, "0")}`
                : "09:00"
            }
            error={errors.time}
          />

          <TextField
            name="duration_minutes"
            label="How long"
            type="number"
            inputMode="numeric"
            min={15}
            step={15}
            required
            hint="Minutes"
            defaultValue={String(durationMinutes ?? 60)}
            error={errors.duration_minutes}
          />
        </div>

        {/* An overlap warns and offers to proceed. It never blocks — two jobs
            at the same time is sometimes exactly right (spec E-10). */}
        {warning ? (
          <div className="flex items-start gap-3 rounded-lg border border-caution/30 bg-caution-soft p-4">
            <WarningIcon
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-caution"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-caution-ink">{warning}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={isPending}
                  onClick={() => {
                    const form = document.getElementById(
                      `schedule-${jobId}`,
                    ) as HTMLFormElement | null;
                    if (form) handleSubmit(new FormData(form), true);
                  }}
                >
                  Save anyway
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setWarning(null)}>
                  Change the time
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <FormError message={error} />

        {saved ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            Booked in
          </p>
        ) : null}

        {!warning ? (
          <Button
            type="submit"
            fullWidth
            loading={isPending}
            icon={<CalendarPlusIcon size={19} />}
          >
            {existing ? "Change the booking" : "Book it in"}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * Job notes, with an offline fallback.
 *
 * If the device has no signal the note is queued in IndexedDB and the owner is
 * told it is saved and will send — never that it failed (spec FR-64, AC-10).
 * The idempotency key means a replayed note is discarded by the unique index
 * rather than duplicated.
 */
export function JobNoteForm({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setQueued(false);
    setSaved(false);

    const clientKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    formData.set("client_key", clientKey);

    if (!isOnline()) {
      void queueOutboxItem({ kind: "job-note", payload: Object.fromEntries(formData.entries()) });
      setQueued(true);
      return;
    }

    startTransition(async () => {
      const result = await addJobNote(formData);

      if (!result.ok) {
        // A network failure is not a lost note. Queue it and say so plainly.
        void queueOutboxItem({
          kind: "job-note",
          payload: Object.fromEntries(formData.entries()),
        });
        setQueued(true);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="job_id" value={jobId} />

      <TextAreaField
        name="body"
        label="Add a note"
        hint="What you found, what you did, what it still needs."
        placeholder="Isolated the supply at the stopcock. Needs a 15mm compression elbow — none on the van, ordering for Thursday."
        rows={4}
        required
      />

      <CheckField
        name="visible_to_client"
        label="Let the customer see this note"
        hint="Off by default. Your own notes stay private."
      />

      {queued ? (
        <p
          role="status"
          className="rounded-lg border border-caution/30 bg-caution-soft px-4 py-3 text-[0.9375rem] font-medium text-caution-ink"
        >
          Saved on this device. It will send as soon as you have signal.
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
        >
          <CheckIcon size={17} weight="bold" aria-hidden="true" />
          Note saved
        </p>
      ) : null}

      <FormError message={error} />

      <Button
        type="submit"
        variant="secondary"
        className={cn("self-start")}
        loading={isPending}
        icon={<NotePencilIcon size={18} />}
      >
        Save note
      </Button>
    </form>
  );
}
