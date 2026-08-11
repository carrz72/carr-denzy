"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, ThumbsDownIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextAreaField } from "@/components/ui/field";
import { acceptQuote, declineQuote } from "@/app/(portal)/portal/actions";

/**
 * Accepting or declining a quote — the one consequential thing a customer does
 * in this app.
 *
 * Accept is a two-step confirm and decline is not. That asymmetry is deliberate:
 * accepting commits somebody to spending money, and an accidental tap on a
 * phone should not do that. Declining is reversible with a phone call and
 * putting an obstacle in front of "no" reads as pressure.
 */
export function QuoteResponse({
  quoteId,
  totalLabel,
}: {
  quoteId: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "confirming" | "declining">("idle");
  const [error, setError] = useState<string | null>(null);

  function respond(accepted: boolean, formData?: FormData) {
    setError(null);

    const payload = formData ?? new FormData();
    payload.set("quote_id", quoteId);

    startTransition(async () => {
      const result = accepted ? await acceptQuote(payload) : await declineQuote(payload);

      if (!result.ok) {
        setError(result.formError ?? "We could not record that. Please ring us.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Happy with this?</h2>

      {mode === "idle" ? (
        <>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
            Accepting lets us book the work in. Nothing is charged now — you pay on the
            invoice once the job is done.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              size="lg"
              fullWidth
              onClick={() => setMode("confirming")}
              icon={<CheckCircleIcon size={20} weight="fill" />}
            >
              Accept this quote
            </Button>

            <Button
              variant="quiet"
              size="lg"
              fullWidth
              onClick={() => setMode("declining")}
              icon={<ThumbsDownIcon size={18} />}
            >
              No thanks
            </Button>
          </div>
        </>
      ) : null}

      {mode === "confirming" ? (
        <>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
            You are accepting {totalLabel} for the work described above. We will be in
            touch to agree a date.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              size="lg"
              fullWidth
              loading={isPending}
              onClick={() => respond(true)}
              icon={<CheckCircleIcon size={20} weight="fill" />}
            >
              Yes, go ahead
            </Button>

            <Button variant="quiet" size="lg" fullWidth onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </>
      ) : null}

      {mode === "declining" ? (
        <form action={(formData) => respond(false, formData)} className="mt-4 flex flex-col gap-4">
          <TextAreaField
            name="reason"
            label="Anything we should know?"
            hint="Not required. If it is the price or the timing, say so and we will see what we can do."
            rows={3}
          />

          <div className="flex flex-col gap-2.5">
            <Button type="submit" variant="secondary" size="lg" fullWidth loading={isPending}>
              Decline the quote
            </Button>

            <Button variant="quiet" size="lg" fullWidth onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}
