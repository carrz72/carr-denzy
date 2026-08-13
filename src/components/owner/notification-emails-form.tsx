"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextAreaField } from "@/components/ui/field";
import {
  sendTestNotification,
  updateNotificationEmails,
} from "@/app/(app)/app/settings/notifications/actions";

/**
 * Who gets the email when an enquiry comes in.
 *
 * One address per line rather than a repeating add/remove list. The owner will
 * set this once and rarely touch it, and a textarea they can paste into is
 * kinder than a row builder for something used twice a year.
 */
export function NotificationEmailsForm({
  emails,
  fallbackEmail,
}: {
  emails: string[];
  /** The environment-variable address used when the list is empty. */
  fallbackEmail: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);
    setSaved(null);

    startTransition(async () => {
      const result = await updateNotificationEmails(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSaved(result.savedCount ?? 0);
    });
  }

  function handleTest() {
    setTestResult(null);
    startTest(async () => {
      const result = await sendTestNotification();
      setTestResult(result.formError ?? "Sent.");
    });
  }

  return (
    <Card>
      <h2 className="font-display text-subheading text-ink">Who gets told</h2>

      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
        Every new job request from the website is emailed to these addresses. Add a
        partner, an office address, or a second engineer — one per line.
      </p>

      <form action={handleSubmit} className="mt-5 flex flex-col gap-4">
        <TextAreaField
          name="emails"
          label="Email addresses"
          hint="One per line. Leave empty to use the original address set up when the site was built."
          placeholder={"you@example.com\noffice@example.com"}
          rows={4}
          defaultValue={emails.join("\n")}
          error={errors.emails}
        />

        {emails.length === 0 && fallbackEmail ? (
          <p className="text-sm leading-relaxed text-ink-subtle">
            Currently going to <strong className="text-ink">{fallbackEmail}</strong>, the
            address set when the site was built.
          </p>
        ) : null}

        <FormError message={formError} />

        {saved !== null ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            {saved === 0
              ? "Cleared — going back to the original address."
              : `Saved. ${saved} address${saved === 1 ? "" : "es"} will be told.`}
          </p>
        ) : null}

        <Button type="submit" loading={isPending} className="self-start">
          Save
        </Button>
      </form>

      {/*
        Every link in this chain fails quietly — a missing API key, an
        unverified sending domain, a revoked permission. Without this button the
        first time you learn notifications are broken is when you lose a job.
      */}
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-medium text-ink">Check it actually works</h3>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
          Sends a test email and a test notification right now. Nothing is added to your
          enquiries.
        </p>

        <Button
          variant="secondary"
          className="mt-4"
          loading={isTesting}
          loadingLabel="Sending…"
          onClick={handleTest}
          icon={<PaperPlaneTiltIcon size={18} weight="fill" />}
        >
          Send me a test
        </Button>

        {testResult ? (
          <p
            role="status"
            className="mt-3 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-[0.9375rem] leading-relaxed text-ink"
          >
            {testResult}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
