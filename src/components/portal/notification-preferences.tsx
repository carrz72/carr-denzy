"use client";

import { useState, useTransition } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { CheckField, FormError } from "@/components/ui/field";
import { updateNotificationPreferences } from "@/app/(portal)/portal/actions";

/**
 * What the customer wants to hear about.
 *
 * All three default ON. These are transactional — they concern work the
 * customer has asked for — so silence would be the surprising choice, not the
 * safe one. The toggles exist because somebody managing four properties may
 * genuinely not want an email every time a job is booked.
 *
 * Quotes and invoices are deliberately absent: those are the documents the
 * work depends on, and an unread invoice is a debt either way.
 */
export function NotificationPreferences({
  notifyBooking,
  notifyMessages,
  notifyCompletion,
}: {
  notifyBooking: boolean;
  notifyMessages: boolean;
  notifyCompletion: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateNotificationPreferences(formData);
      if (result.ok) setSaved(true);
      else setError(result.formError ?? "Could not save that. Try again.");
    });
  }

  return (
    <Card>
      <h2 className="font-display text-subheading text-ink">What we email you about</h2>

      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
        Quotes and invoices are always sent — you need those. Everything else is up to
        you.
      </p>

      <form action={handleSubmit} className="mt-5 flex flex-col gap-3">
        <CheckField
          name="notify_booking"
          label="When a date is booked"
          hint="Including if we have to move it."
          defaultChecked={notifyBooking}
        />

        <CheckField
          name="notify_messages"
          label="When we message you about a job"
          hint="Otherwise you would only see it by logging in."
          defaultChecked={notifyMessages}
        />

        <CheckField
          name="notify_completion"
          label="When the work is finished"
          defaultChecked={notifyCompletion}
        />

        <FormError message={error} />

        {saved ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            Saved
          </p>
        ) : null}

        <Button type="submit" loading={isPending} className="mt-1 self-start">
          Save
        </Button>
      </form>
    </Card>
  );
}
