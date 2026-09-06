"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextAreaField } from "@/components/ui/field";
import { deleteJobNote, updateJobNote } from "@/app/(app)/app/actions";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * One saved note, correctable.
 *
 * These get typed one-handed in a dark cupboard, so they contain typos, and
 * until now they were permanent — the policy allowing an edit had existed
 * since the first migration with nothing ever calling it.
 *
 * Two details the edit has to get right:
 *
 *   * **"Edited" is shown, not hidden.** A note the customer can see has
 *     already been read by them, and quietly rewriting something somebody read
 *     is a different act from fixing a typo before anyone saw it.
 *   * **Whether the customer can see it is not editable here.** Making a
 *     private note public is its own decision, and folding it into a typo fix
 *     is how a note meant for yourself ends up on a customer's screen.
 */
export function JobNote({
  note,
  jobId,
  canDelete,
}: {
  note: {
    id: string;
    body: string;
    visible_to_client: boolean;
    created_at: string;
    updated_at: string;
  };
  jobId: string;
  /** Deleting is owner-only, per the `owner deletes notes` policy. */
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [body, setBody] = useState(note.body);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // A second's slack: `updated_at` defaults to now() alongside created_at, and
  // the two can land microseconds apart on insert.
  const edited =
    new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 1000;

  function save(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await updateJobNote(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setEditing(false);
    });
  }

  function remove() {
    setFormError(null);

    const formData = new FormData();
    formData.set("note_id", note.id);
    formData.set("job_id", jobId);

    startTransition(async () => {
      const result = await deleteJobNote(formData);
      if (!result.ok) setFormError(result.formError ?? "Could not remove that note.");
    });
  }

  if (editing) {
    return (
      <li className="rounded-md bg-surface-sunken p-4">
        <form action={save} className="flex flex-col gap-3">
          <input type="hidden" name="note_id" value={note.id} />
          <input type="hidden" name="job_id" value={jobId} />

          {/*
            Grows to the whole note. A fixed four rows meant editing 564px of
            text through a 130px window — a sixth of the screen — which is how
            you lose your place halfway through a correction.
          */}
          <TextAreaField
            name="body"
            label="Note"
            hideLabel
            autoGrow
            rows={4}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
            error={errors.body}
          />

          {note.visible_to_client ? (
            <p className="text-sm text-caution-ink">
              The customer has already seen this one. Your change will show as edited.
            </p>
          ) : null}

          <FormError message={formError} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={isPending} icon={<CheckIcon size={16} weight="bold" />}>
              Save
            </Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={isPending}
              onClick={() => {
                setBody(note.body);
                setErrors({});
                setFormError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="group rounded-md bg-surface-sunken p-4">
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">
        {note.body}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
        <span>{formatDateTime(note.created_at)}</span>

        {edited ? <span>· edited {formatDateTime(note.updated_at)}</span> : null}

        {note.visible_to_client ? (
          <span className="font-medium text-accent">· customer can see this</span>
        ) : null}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isPending}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-md px-2 font-medium",
              "transition-colors duration-200 hover:bg-surface hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <PencilSimpleIcon size={14} aria-hidden="true" />
            Edit
          </button>

          {canDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className={cn(
                "flex min-h-9 items-center rounded-md px-2 font-medium",
                "transition-colors duration-200 hover:bg-critical-soft hover:text-critical",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <TrashIcon size={14} aria-hidden="true" />
              <span className="sr-only">Remove this note</span>
            </button>
          ) : null}
        </span>
      </div>

      {confirmingDelete ? (
        <div className="mt-3 rounded-md border border-critical/30 bg-critical-soft p-3">
          <p className="text-sm font-medium text-critical">Remove this note for good?</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" loading={isPending} onClick={remove}>
              Yes, remove it
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {formError ? (
        <div className="mt-3">
          <FormError message={formError} />
        </div>
      ) : null}
    </li>
  );
}
