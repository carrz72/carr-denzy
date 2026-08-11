"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PaperPlaneTiltIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { sendQuote } from "@/app/(app)/app/actions";

/**
 * Sending a quote is the moment it stops being editable and starts being an
 * offer, so it asks once. Not a modal — an inline confirm, because a dialog on
 * a phone covers the very figure the owner is trying to check.
 */
export function SendQuoteButton({
  quoteId,
  clientEmail,
  totalLabel,
}: {
  quoteId: string;
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
    formData.set("quote_id", quoteId);

    startTransition(async () => {
      const result = await sendQuote(formData);

      if (!result.ok) {
        setError(result.formError ?? "Could not send that quote.");
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
          Quote sent. The customer can accept or decline it in their account.
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
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            {clientEmail
              ? `This emails the quote to ${clientEmail}. Once it is sent the prices are fixed — to change them you would raise a new quote.`
              : "This customer has no email address, so nothing will be emailed. The quote will still be marked as sent and they can see it if they sign in."}
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
          Send {totalLabel} quote
        </Button>
      )}

      <FormError message={error} />
    </div>
  );
}
