"use client";

import { useState, useTransition } from "react";
import { CheckCircleIcon, CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextAreaField } from "@/components/ui/field";
import { acceptQuoteViaLink, declineQuoteViaLink } from "@/app/quotes/view/[id]/actions";
import { formatPence } from "@/lib/money";
import type { BusinessContact } from "@/lib/business";

/**
 * Accept or decline, from the emailed link, with no account.
 *
 * Accepting a quote is the moment a job is won, so the accept path is one tap
 * and nothing else: no reason field, no confirmation dialog, no "are you
 * sure". Declining asks for a reason, because that answer is genuinely useful
 * to the business and the person declining is not in a hurry.
 *
 * The total is restated on the button itself. People forward these emails and
 * open them days later on a phone, halfway down the page, and "Accept" alone
 * does not say what is being agreed to.
 */
export function QuoteLinkResponse({
  quoteId,
  totalPence,
  validUntil,
  contact,
}: {
  quoteId: string;
  totalPence: number;
  validUntil: string | null;
  /** From Settings, so the owner can change the number without a redeploy. */
  contact: BusinessContact;
}) {
  const [isPending, startTransition] = useTransition();
  const [showDecline, setShowDecline] = useState(false);
  const [outcome, setOutcome] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    const formData = new FormData();
    formData.set("quote_id", quoteId);

    startTransition(async () => {
      const result = await acceptQuoteViaLink(formData);
      if (result.ok) setOutcome("accepted");
      else setError(result.formError ?? "That did not go through. Please try again.");
    });
  }

  function handleDecline(formData: FormData) {
    setError(null);
    formData.set("quote_id", quoteId);

    startTransition(async () => {
      const result = await declineQuoteViaLink(formData);
      if (result.ok) setOutcome("declined");
      else setError(result.formError ?? "That did not go through. Please try again.");
    });
  }

  if (outcome === "accepted") {
    return (
      <div className="rounded-xl border border-positive/25 bg-positive-soft p-6 sm:p-7">
        <span className="flex size-12 items-center justify-center rounded-xl bg-positive text-white">
          <CheckCircleIcon size={26} weight="fill" aria-hidden="true" />
        </span>

        <h2 className="mt-5 font-display text-heading text-ink">Thank you — that is accepted.</h2>

        <p className="container-prose mt-3 leading-relaxed text-ink">
          We will be in touch to agree a date. There is nothing else you need to do, and
          you do not need to reply to the email.
        </p>

        <p className="mt-4 text-[0.9375rem] text-ink-muted">
          Anything to add before we come out? Ring us on{" "}
          <a
            href={contact.phoneHref}
            className="font-medium tabular text-ink underline underline-offset-4"
          >
            {contact.phone}
          </a>
          .
        </p>
      </div>
    );
  }

  if (outcome === "declined") {
    return (
      <div className="rounded-xl border border-line bg-surface-sunken p-6 sm:p-7">
        <h2 className="font-display text-subheading text-ink">That is noted — thank you.</h2>

        <p className="container-prose mt-2.5 leading-relaxed text-ink-muted">
          We will not chase you about it. If you change your mind, or if it was the price
          rather than the work, ring us on{" "}
          <a
            href={contact.phoneHref}
            className="font-medium tabular text-ink underline underline-offset-4"
          >
            {contact.phone}
          </a>{" "}
          — we would rather talk than lose the job over a number.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent-line bg-accent-soft p-6 sm:p-7">
      <h2 className="font-display text-heading text-accent-ink">Happy with this?</h2>

      <p className="container-prose mt-2.5 leading-relaxed text-ink">
        {validUntil
          ? `Let us know either way and we will get you booked in. This price is held until ${validUntil}.`
          : "Let us know either way and we will get you booked in."}
      </p>

      {showDecline ? (
        <form action={handleDecline} className="mt-6 flex flex-col gap-4">
          <TextAreaField
            name="reason"
            label="Anything you want to tell us?"
            hint="Optional. It genuinely helps us price the next one better."
            placeholder="Going with someone cheaper this time — thanks anyway."
            rows={3}
          />

          <FormError message={error} />

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button type="submit" variant="secondary" loading={isPending}>
              Send it
            </Button>
            <Button variant="quiet" onClick={() => setShowDecline(false)} disabled={isPending}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3">
            {/*
              Stacked, not "Accept this quote — £1,240.00" on one line.
              Buttons carry `whitespace-nowrap`, so that version silently
              clipped its own price at 320px on any four-figure quote — the
              valuable ones — on the button that wins the work. Two lines fit
              any amount and read more clearly at a glance anyway.
            */}
            <Button
              size="lg"
              fullWidth
              loading={isPending}
              loadingLabel="Recording your answer…"
              onClick={handleAccept}
              icon={<CheckIcon size={20} weight="bold" />}
              className="py-3.5"
            >
              <span className="flex flex-col items-center leading-tight">
                <span>Accept this quote</span>
                <span className="mt-0.5 text-sm font-semibold opacity-90 tabular-nums">
                  {formatPence(totalPence)}
                </span>
              </span>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={isPending}
              onClick={() => setShowDecline(true)}
              icon={<XIcon size={18} weight="bold" />}
            >
              No thank you
            </Button>
          </div>

          {error ? (
            <div className="mt-4">
              <FormError message={error} />
            </div>
          ) : null}

          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Accepting is not a payment — nothing is taken now. It tells us to go ahead and
            book the work in.
          </p>
        </>
      )}
    </div>
  );
}
