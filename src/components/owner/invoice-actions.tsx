"use client";

import { useState, useTransition } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  CurrencyGbpIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { deleteDraftInvoice, recordPayment, resendInvoice, sendInvoice } from "@/app/(app)/app/actions";
import { formatPence, formatPenceBare, parsePence } from "@/lib/money";
import { todayInLondon } from "@/lib/dates";
import type { PaymentMethod } from "@/types/database";

export function SendInvoiceButton({
  invoiceId,
  clientId,
  clientEmail,
  totalLabel,
}: {
  invoiceId: string;
  clientId: string | null;
  clientEmail: string | null;
  totalLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function send() {
    setError(null);

    const formData = new FormData();
    formData.set("invoice_id", invoiceId);

    startTransition(async () => {
      const result = await sendInvoice(formData);

      if (!result.ok) {
        setError(result.formError ?? "Could not send that invoice.");
        setConfirming(false);
        return;
      }

      setSent(true);
      setConfirming(false);
      setWarning(result.warning ?? null);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p
          role="status"
          className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
        >
          <CheckIcon size={18} weight="bold" aria-hidden="true" />
          Invoice sent.
        </p>

        {warning ? (
          <p className="flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution-soft px-4 py-3 text-[0.9375rem] font-medium text-caution-ink">
            <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <>
          {/* Spelled out because it is genuinely one-way: the trigger in
              20260810091000_functions.sql refuses edits to a sent invoice. */}
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            {clientEmail ? (
              <>
                This emails the invoice to <strong className="text-ink">{clientEmail}</strong>.
                Not the right address?{" "}
                {clientId ? (
                  <Link
                    href={`/app/clients/${clientId}`}
                    className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    Change it on their customer page
                  </Link>
                ) : (
                  "Change it on their customer page"
                )}{" "}
                first.
              </>
            ) : (
              <>
                This customer has no email address, so nothing will be emailed — print it or
                ring them.{" "}
                {clientId ? (
                  <Link
                    href={`/app/clients/${clientId}`}
                    className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    Add one on their customer page
                  </Link>
                ) : (
                  "Add one on their customer page"
                )}{" "}
                and come back to send it properly.
              </>
            )}{" "}
            Once sent, the lines cannot be edited. A mistake would need a credit note.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              loading={isPending}
              onClick={send}
              icon={<PaperPlaneTiltIcon size={19} weight="fill" />}
            >
              Yes, send it
            </Button>
            <Button variant="quiet" size="lg" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="lg"
          fullWidth
          onClick={() => setConfirming(true)}
          icon={<PaperPlaneTiltIcon size={19} weight="fill" />}
        >
          Send {totalLabel} invoice
        </Button>
      )}

      <FormError message={error} />
    </div>
  );
}

/**
 * Deleting a draft.
 *
 * Only ever offered for a draft — once sent, an invoice is a record that has
 * to stay for six years (spec FR-58), so this button does not exist on that
 * screen at all rather than existing and failing.
 */
export function DeleteDraftInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);

    const formData = new FormData();
    formData.set("invoice_id", invoiceId);

    startTransition(async () => {
      const result = await deleteDraftInvoice(formData);

      if (!result.ok) {
        setError(result.formError ?? "Could not delete that draft.");
        setConfirming(false);
        return;
      }

      router.push("/app/invoices");
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
          This deletes the draft. It has never been sent, so nobody has seen it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            loading={isPending}
            onClick={remove}
            icon={<TrashIcon size={18} weight="bold" />}
          >
            Yes, delete it
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            Not yet
          </Button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-ink-subtle hover:text-critical"
    >
      <TrashIcon size={16} weight="bold" aria-hidden="true" />
      Delete this draft
    </button>
  );
}

/**
 * Resending a sent invoice — the fix for "that went to the wrong email".
 * Always uses the client's current email, so the button is disabled-in-spirit
 * (an error, not silently a no-op) until that is corrected on their page.
 */
export function ResendInvoiceButton({
  invoiceId,
  clientId,
  clientEmail,
}: {
  invoiceId: string;
  clientId: string | null;
  clientEmail: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  function resend() {
    setError(null);

    const formData = new FormData();
    formData.set("invoice_id", invoiceId);

    startTransition(async () => {
      const result = await resendInvoice(formData);

      if (!result.ok) {
        setError(result.formError ?? "Could not resend that invoice.");
        setConfirming(false);
        return;
      }

      setResent(true);
      setConfirming(false);
    });
  }

  if (resent) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
      >
        <CheckIcon size={18} weight="bold" aria-hidden="true" />
        Resent to {clientEmail}.
      </p>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
          Sends the same invoice again to{" "}
          <strong className="text-ink">{clientEmail}</strong>. Wrong address?{" "}
          {clientId ? (
            <Link
              href={`/app/clients/${clientId}`}
              className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              Fix it on their customer page
            </Link>
          ) : (
            "Fix it on their customer page"
          )}{" "}
          first, then come back.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={isPending}
            onClick={resend}
            icon={<ArrowsClockwiseIcon size={18} weight="bold" />}
          >
            Yes, resend it
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            Not yet
          </Button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  if (!clientEmail) {
    return (
      <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
        No email on record, so there is nothing to resend.{" "}
        {clientId ? (
          <Link
            href={`/app/clients/${clientId}`}
            className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            Add one on their customer page
          </Link>
        ) : (
          "Add one on their customer page"
        )}
        .
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-accent hover:text-accent-hover"
    >
      <ArrowsClockwiseIcon size={16} weight="bold" aria-hidden="true" />
      Sent to the wrong address? Resend
    </button>
  );
}

const methodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Something else",
};

/**
 * Recording a payment.
 *
 * The amount is pre-filled with what is outstanding, because full settlement is
 * the common case and typing a figure you already know is friction. A part
 * payment is simply a smaller number — the invoice status, the paid total and
 * the job all follow from the database trigger (spec FR-54, AC-9).
 */
export function RecordPaymentForm({
  invoiceId,
  outstandingPence,
}: {
  invoiceId: string;
  outstandingPence: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [amount, setAmount] = useState(() => formatPenceBare(Math.max(outstandingPence, 0)));
  const [saved, setSaved] = useState(false);

  const parsed = parsePence(amount);
  const overpaying = parsed !== null && parsed > outstandingPence;

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    const pence = parsePence(String(formData.get("amount_input") ?? ""));

    if (pence === null || pence <= 0) {
      setErrors({ amount_pence: "Enter how much was paid, for example 250.00" });
      return;
    }

    formData.set("amount_pence", String(pence));

    startTransition(async () => {
      const result = await recordPayment(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Money in</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {outstandingPence > 0
          ? `${formatPence(outstandingPence)} still to come.`
          : "This invoice is settled. Anything recorded here will show as an overpayment."}
      </p>

      <form action={handleSubmit} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="invoice_id" value={invoiceId} />

        <TextField
          name="amount_input"
          label="How much"
          prefix="£"
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={errors.amount_pence}
          hint={overpaying ? "That is more than is outstanding." : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="method" label="How" defaultValue="bank_transfer" required>
            {(Object.keys(methodLabels) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {methodLabels[method]}
              </option>
            ))}
          </SelectField>

          <TextField
            name="paid_on"
            label="When"
            type="date"
            required
            defaultValue={todayInLondon()}
            error={errors.paid_on}
          />
        </div>

        <TextField
          name="reference"
          label="Their reference"
          hint="Whatever showed on your statement, so you can find it again."
          autoComplete="off"
          error={errors.reference}
        />

        <TextAreaField name="note" label="Note" rows={2} error={errors.note} />

        <FormError message={formError} />

        {saved ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            Payment recorded.
          </p>
        ) : null}

        <Button
          type="submit"
          fullWidth
          loading={isPending}
          icon={<CurrencyGbpIcon size={19} weight="bold" />}
        >
          Record the payment
        </Button>
      </form>
    </Card>
  );
}
