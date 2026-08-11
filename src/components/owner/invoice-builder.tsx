"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import {
  CheckField,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { LineItemEditor, type DraftLine } from "@/components/owner/line-items";
import { createInvoice } from "@/app/(app)/app/actions";
import { formatPence } from "@/lib/money";
import { addDaysToToday, todayInLondon } from "@/lib/dates";
import type { PriceItem, Settings } from "@/types/database";

/**
 * The invoice builder.
 *
 * When it opens from an accepted quote the lines arrive already filled in, and
 * are still editable — the job on the day is rarely the job on the quote, and
 * forcing the owner to retype eight lines because one changed is how figures
 * get keyed in wrong.
 */
export function InvoiceBuilder({
  jobId,
  clientId,
  clientName,
  jobTitle,
  quoteId,
  initialLines,
  priceItems,
  settings,
  clients,
}: {
  /** Absent for a standalone invoice with no job behind it. */
  jobId?: string;
  /** Absent when the customer is chosen on this screen instead. */
  clientId?: string;
  clientName?: string;
  jobTitle?: string;
  quoteId: string | null;
  initialLines: DraftLine[];
  priceItems: PriceItem[];
  settings: Settings;
  /** Supplied only for a standalone invoice: turns on the customer picker. */
  clients?: { id: string; full_name: string; phone: string | null }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [totalPence, setTotalPence] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  // Standalone mode: no job, so the customer has to be chosen or created here.
  const picksCustomer = Array.isArray(clients);
  const [chosenClientId, setChosenClientId] = useState(clientId ?? "");
  const isNewCustomer = picksCustomer && chosenClientId === "";

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    if (picksCustomer && !isNewCustomer) {
      // Clear the new-customer fields so a name typed and then abandoned
      // cannot create a duplicate record.
      formData.set("full_name", "");
      formData.set("phone", "");
      formData.set("email", "");
    }

    startTransition(async () => {
      const result = await createInvoice(formData);

      if (!result.ok || !result.id) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      router.push(`/app/invoices/${result.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="job_id" value={jobId ?? ""} />
      <input type="hidden" name="quote_id" value={quoteId ?? ""} />
      {!picksCustomer ? <input type="hidden" name="client_id" value={clientId ?? ""} /> : null}

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Who and what for</h2>

        {picksCustomer ? (
          <div className="mt-5 flex flex-col gap-5">
            <SelectField
              name="client_id"
              label="Customer"
              hint="Nobody on the list? Leave it on 'Someone new' and put their details in."
              value={chosenClientId}
              onChange={(event) => setChosenClientId(event.target.value)}
            >
              <option value="">Someone new</option>
              {clients!.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                  {client.phone ? ` — ${client.phone}` : ""}
                </option>
              ))}
            </SelectField>

            {isNewCustomer ? (
              <>
                <TextField
                  name="full_name"
                  label="Their name"
                  required
                  autoComplete="off"
                  error={errors.full_name}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField
                    name="phone"
                    label="Phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    error={errors.phone}
                  />

                  <TextField
                    name="email"
                    label="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    hint="Where the invoice gets sent."
                    error={errors.email}
                  />
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-3 font-display text-subheading text-ink">{jobTitle}</p>
            <p className="text-[0.9375rem] text-ink-muted">To {clientName}</p>
          </>
        )}

        {quoteId ? (
          <p className="mt-4 rounded-md border border-info/25 bg-info-soft px-4 py-3 text-[0.9375rem] text-info-ink">
            Lines carried across from the accepted quote. Change anything that changed on
            the day.
          </p>
        ) : null}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextField
            name="issue_date"
            label="Invoice date"
            type="date"
            required
            defaultValue={todayInLondon()}
            error={errors.issue_date}
          />

          <TextField
            name="due_date"
            label="Payment due by"
            type="date"
            defaultValue={addDaysToToday(settings.payment_terms_days)}
            hint={`Your usual terms are ${settings.payment_terms_days} days.`}
            error={errors.due_date}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">What they owe</h2>

        <div className="mt-5">
          <LineItemEditor
            initialLines={initialLines}
            priceItems={priceItems}
            vatRegistered={settings.vat_registered}
            cisEnabled={settings.cis_enabled}
            cisDeductionRateBp={settings.cis_deduction_rate_bp}
            defaultVatRateBp={settings.default_vat_rate_bp}
            reverseCharge={reverseCharge}
            error={errors.items}
            onChange={({ lines, totalPence: total }) => {
              setLineCount(lines.length);
              setTotalPence(total);
            }}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Anything else</h2>

        <div className="mt-5 flex flex-col gap-5">
          <TextAreaField
            name="notes"
            label="A note on the invoice"
            hint="Appears under the lines. Handy for what you left on site, or what still needs doing."
            rows={3}
            error={errors.notes}
          />

          {/* Only meaningful once VAT-registered, so it is not shown before
              then — an option that cannot apply is just another thing to
              misunderstand. */}
          {settings.vat_registered ? (
            <CheckField
              name="reverse_charge"
              label="Domestic reverse charge applies"
              hint="For CIS work billed to another VAT-registered contractor. They account for the VAT, not you."
              checked={reverseCharge}
              onChange={(event) => setReverseCharge(event.target.checked)}
            />
          ) : null}
        </div>
      </Card>

      <FormError message={formError} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-ink-muted">
          Saves as a draft. Once you send it the figures are fixed.
        </p>

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          disabled={lineCount === 0}
          icon={<ReceiptIcon size={19} />}
        >
          {lineCount === 0
            ? "Add a line first"
            : `Save invoice for ${formatPence(totalPence)}`}
        </Button>
      </div>
    </form>
  );
}
