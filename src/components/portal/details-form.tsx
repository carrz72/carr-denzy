"use client";

import { useState, useTransition } from "react";
import { CheckIcon, FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/ui/field";
import { updateMyDetails } from "@/app/(portal)/portal/actions";
import type { Client } from "@/types/database";

/**
 * The customer's own contact details.
 *
 * Addresses are not editable here on purpose. A property is attached to jobs,
 * invoices and photographs, and letting someone rewrite the address on a job
 * that has already been done would rewrite history. Changing an address is a
 * phone call, and that is the honest answer rather than a field that quietly
 * does the wrong thing.
 */
export function DetailsForm({ client }: { client: Client }) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateMyDetails(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <TextField
        name="full_name"
        label="Your name"
        required
        autoComplete="name"
        defaultValue={client.full_name}
        error={errors.full_name}
      />

      <TextField
        name="company_name"
        label="Company"
        hint="Only if the work is billed to a business."
        autoComplete="organization"
        defaultValue={client.company_name ?? ""}
        error={errors.company_name}
      />

      <TextField
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Where quotes and invoices are sent."
        defaultValue={client.email ?? ""}
        error={errors.email}
      />

      <TextField
        name="phone"
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="How we let you know we are on our way."
        defaultValue={client.phone ?? ""}
        error={errors.phone}
      />

      <FormError message={formError} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={isPending} icon={<FloppyDiskIcon size={18} />}>
          Save changes
        </Button>

        {saved ? (
          <p
            role="status"
            className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive"
          >
            <CheckIcon size={17} weight="bold" aria-hidden="true" />
            Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}
