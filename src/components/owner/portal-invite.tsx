"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextField } from "@/components/ui/field";
import { inviteClientToPortal } from "@/app/(app)/app/actions";

/**
 * Giving a customer access to their own jobs.
 *
 * Needed because a customer taken over the phone has no way in on their own:
 * accounts are matched to customer records by email, so somebody who only gave
 * a mobile number is invisible to the sign-in flow no matter what they do.
 *
 * The email field is prefilled from the record and stays editable, because the
 * common case is that there is no email on file yet — this is the moment the
 * owner asks for one.
 */
export function PortalInvite({
  clientId,
  clientName,
  email,
  hasAccount,
}: {
  clientId: string;
  clientName: string;
  email: string | null;
  hasAccount: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await inviteClientToPortal(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSent(true);
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Seeing their jobs online</h2>

      {hasAccount ? (
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
          {clientName.split(" ")[0]} can already sign in and see their jobs, quotes and
          invoices. Sending another link is harmless if they cannot get in.
        </p>
      ) : (
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
          They have no way in yet. Send a link and everything already on their record —
          jobs, quotes, invoices — appears for them the moment they open it.
        </p>
      )}

      {sent ? (
        <p
          role="status"
          className="mt-5 flex items-start gap-2 text-[0.9375rem] font-medium text-positive"
        >
          <CheckIcon size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden="true" />
          Sent to {value}. The link works once and lasts an hour.
        </p>
      ) : (
        <form action={handleSubmit} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="client_id" value={clientId} />

          <TextField
            name="email"
            label="Send it to"
            type="email"
            inputMode="email"
            required
            hint={
              email
                ? "This is the address on their record. Changing it here updates the record too."
                : "There is no email on their record yet. This one will be saved to it."
            }
            value={value}
            onChange={(event) => setValue(event.target.value)}
            error={errors.email}
          />

          <FormError message={formError} />

          <Button
            type="submit"
            variant={hasAccount ? "secondary" : "primary"}
            loading={isPending}
            icon={<PaperPlaneTiltIcon size={18} weight="fill" />}
            className="self-start"
          >
            {hasAccount ? "Send another link" : "Send them a link"}
          </Button>
        </form>
      )}
    </Card>
  );
}
