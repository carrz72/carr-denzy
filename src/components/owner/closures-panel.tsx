"use client";

import { useState, useTransition } from "react";
import { PlusIcon, SunHorizonIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { CheckField, FormError, TextField } from "@/components/ui/field";
import { addClosure, removeClosure } from "@/app/(app)/app/diary/actions";
import { formatDate, todayInLondon } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Closure } from "@/types/database";

/**
 * Booking time off.
 *
 * Lives on the diary rather than in settings because it is a scheduling
 * decision, made at the same moment as looking at the week. Settings is for
 * things changed twice a year; this gets used before every holiday.
 *
 * The wording is blunt about consequences — this is the only control in the app
 * that changes what strangers see on the public site.
 */
export function ClosuresPanel({ closures }: { closures: Closure[] }) {
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const today = todayInLondon();

  function handleAdd(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await addClosure(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setAdding(false);
    });
  }

  function handleRemove(id: string) {
    const formData = new FormData();
    formData.set("id", id);

    startTransition(async () => {
      const result = await removeClosure(formData);
      if (!result.ok) setFormError(result.formError ?? "Could not remove that.");
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-label uppercase text-ink-subtle">
            <SunHorizonIcon size={17} weight="fill" className="text-caution" aria-hidden="true" />
            Time off
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Days you are not working. These show on the website so nobody sits waiting for
            a reply that is not coming.
          </p>
        </div>

        {!adding ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            icon={<PlusIcon size={16} weight="bold" />}
          >
            Book time off
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form action={handleAdd} className="mt-5 flex flex-col gap-4 border-t border-line pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="starts_on"
              label="First day away"
              type="date"
              required
              min={today}
              defaultValue={today}
              error={errors.starts_on}
            />

            <TextField
              name="ends_on"
              label="Last day away"
              type="date"
              required
              min={today}
              defaultValue={today}
              hint="You are back the day after."
              error={errors.ends_on}
            />
          </div>

          <TextField
            name="reason"
            label="What to tell customers"
            hint="Shown on the website. Leave it blank and it just says you are away."
            placeholder="Family holiday"
            error={errors.reason}
          />

          <CheckField
            name="emergencies_only"
            label="Still taking genuine emergencies"
            hint="The website tells them to ring rather than send a request. Turn this off and it says you are not available at all."
            defaultChecked
          />

          <FormError message={formError} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={isPending}>
              Save
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {closures.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2 border-t border-line pt-5">
          {closures.map((closure) => {
            const over = closure.ends_on < today;
            const on = closure.starts_on <= today && closure.ends_on >= today;

            return (
              <li
                key={closure.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-md border p-3.5",
                  on ? "border-caution/30 bg-caution-soft" : "border-line bg-surface",
                  over && "opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {closure.starts_on === closure.ends_on
                      ? formatDate(closure.starts_on)
                      : `${formatDate(closure.starts_on)} — ${formatDate(closure.ends_on)}`}
                  </span>

                  <span className="mt-0.5 block text-sm text-ink-subtle">
                    {closure.reason ?? "No reason given"}
                    {on ? " · on now" : over ? " · finished" : ""}
                    {closure.emergencies_only ? "" : " · not taking emergencies"}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => handleRemove(closure.id)}
                  disabled={isPending}
                  title="Remove this time off"
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-md text-ink-subtle",
                    "transition-colors duration-200 hover:bg-critical-soft hover:text-critical",
                    "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
                  )}
                >
                  <TrashIcon size={17} aria-hidden="true" />
                  <span className="sr-only">Remove this time off</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!adding && closures.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-ink-muted">
          Nothing booked. The website is telling customers you reply the same working day.
        </p>
      ) : null}
    </Card>
  );
}
