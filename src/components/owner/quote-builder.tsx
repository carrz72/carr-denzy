"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextAreaField, TextField } from "@/components/ui/field";
import { LineItemEditor } from "@/components/owner/line-items";
import { createQuote } from "@/app/(app)/app/actions";
import { formatPence } from "@/lib/money";
import { addDaysToToday, todayInLondon } from "@/lib/dates";
import type { PriceItem, Settings } from "@/types/database";

/**
 * The quote builder.
 *
 * A quote is a sales document, so the wording matters as much as the maths.
 * The intro note is offered first and pre-filled with nothing — a blank box the
 * owner may ignore — because a forced template produces quotes that all read
 * the same, and the terms field carries the sentence that actually protects
 * them.
 */
export function QuoteBuilder({
  jobId,
  jobTitle,
  clientName,
  priceItems,
  settings,
  defaultTerms,
}: {
  jobId: string;
  jobTitle: string;
  clientName: string;
  priceItems: PriceItem[];
  settings: Settings;
  defaultTerms: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [totalPence, setTotalPence] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await createQuote(formData);

      if (!result.ok || !result.id) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      router.push(`/app/quotes/${result.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="job_id" value={jobId} />

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">What you are quoting for</h2>

        <p className="mt-3 font-display text-subheading text-ink">{jobTitle}</p>
        <p className="text-[0.9375rem] text-ink-muted">For {clientName}</p>

        <div className="mt-5 flex flex-col gap-5">
          <TextAreaField
            name="intro_note"
            label="A note to the customer"
            hint="Appears above the prices. A sentence explaining what you propose to do usually wins the job."
            placeholder="Thanks for having me out on Tuesday. Here is what I would do to sort the leak for good, rather than patch it."
            rows={4}
            error={errors.intro_note}
          />

          <TextField
            name="valid_until"
            label="Open until"
            type="date"
            min={todayInLondon()}
            defaultValue={addDaysToToday(settings.quote_valid_days)}
            hint={`Your usual is ${settings.quote_valid_days} days. After this the quote expires on its own.`}
            error={errors.valid_until}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">The price</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          The customer sees each line. Splitting labour from materials makes a big number
          look like a considered one.
        </p>

        <div className="mt-5">
          <LineItemEditor
            priceItems={priceItems}
            vatRegistered={settings.vat_registered}
            cisEnabled={settings.cis_enabled}
            cisDeductionRateBp={settings.cis_deduction_rate_bp}
            defaultVatRateBp={settings.default_vat_rate_bp}
            error={errors.items}
            onChange={({ lines, totalPence: total }) => {
              setLineCount(lines.length);
              setTotalPence(total);
            }}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Terms</h2>

        <div className="mt-5">
          <TextAreaField
            name="terms"
            label="The small print"
            hint="Printed at the foot of the quote. Change it here for this job only."
            rows={5}
            defaultValue={defaultTerms}
            error={errors.terms}
          />
        </div>
      </Card>

      <FormError message={formError} />

      {/* Saved as a draft, deliberately. Nothing reaches the customer until the
          owner has read the finished document back (spec FR-41). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-ink-muted">
          Saves as a draft. You will see it as the customer will before it goes.
        </p>

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          disabled={lineCount === 0}
          icon={<FileTextIcon size={19} />}
        >
          {lineCount === 0 ? "Add a line first" : `Save quote for ${formatPence(totalPence)}`}
        </Button>
      </div>
    </form>
  );
}
