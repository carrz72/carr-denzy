"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/surface";
import { FormError } from "@/components/ui/field";
import { assignJob } from "@/app/(app)/app/settings/team/actions";

/**
 * Who is doing this job. A team member who only sees "jobs given to them"
 * sees this job once it is set to them.
 */
export function AssignJob({
  jobId,
  assignedTo,
  team,
}: {
  jobId: string;
  assignedTo: string | null;
  team: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(assignedTo ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await assignJob(jobId, next || null);
      if (!result.ok) {
        setValue(previous);
        setError(result.formError ?? "Could not save that.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card>
      <label htmlFor="assign-job" className="text-label uppercase text-ink-subtle">
        Who&apos;s doing it
      </label>
      <select
        id="assign-job"
        value={value}
        disabled={isPending}
        onChange={(event) => change(event.target.value)}
        className="mt-3 block min-h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink"
      >
        <option value="">Nobody in particular</option>
        {team.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
        {isPending ? "Saving…" : saved ? "Saved." : "Team members on “only jobs given to them” see it once it is theirs."}
      </p>
      <FormError message={error} />
    </Card>
  );
}
