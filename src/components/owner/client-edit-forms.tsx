"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, FloppyDiskIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, TextAreaField, TextField } from "@/components/ui/field";
import {
  addProperty,
  updateClientDetails,
  updateProperty,
  type ClientActionResult,
} from "@/app/(app)/app/clients/actions";
import type { Client, Property } from "@/types/database";

/** Shared submit handling: field errors, a form-level error, and a "Saved" tick. */
function useSave(action: (formData: FormData) => Promise<ClientActionResult>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(formData: FormData, onSaved?: () => void) {
    setErrors({});
    setFormError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await action(formData);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      setSaved(true);
      onSaved?.();
      router.refresh();
    });
  }

  return { isPending, errors, formError, saved, submit };
}

function SavedTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-[0.9375rem] font-medium text-positive">
      <CheckIcon size={17} weight="bold" aria-hidden="true" />
      Saved
    </p>
  );
}

export function ClientDetailsEditForm({
  client,
  privateNotes,
}: {
  client: Pick<Client, "id" | "full_name" | "company_name" | "email" | "phone" | "profile_id">;
  privateNotes: string | null;
}) {
  const { isPending, errors, formError, saved, submit } = useSave(updateClientDetails);

  return (
    <form action={(formData) => submit(formData)} className="flex flex-col gap-5">
      <input type="hidden" name="client_id" value={client.id} />

      <TextField
        name="full_name"
        label="Name"
        required
        autoComplete="off"
        defaultValue={client.full_name}
        error={errors.full_name}
      />

      <TextField
        name="company_name"
        label="Company"
        hint="Only if the work is billed to a business."
        autoComplete="off"
        defaultValue={client.company_name ?? ""}
        error={errors.company_name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={client.phone ?? ""}
          error={errors.phone}
        />

        <TextField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          hint={
            client.profile_id
              ? "Where quotes and invoices go. They already have a portal login, which keeps the address they signed up with."
              : "Where quotes and invoices go."
          }
          defaultValue={client.email ?? ""}
          error={errors.email}
        />
      </div>

      <TextAreaField
        name="notes"
        label="Your private notes"
        hint="Only you see these. The customer never does. Leave it empty to remove them."
        rows={4}
        defaultValue={privateNotes ?? ""}
        error={errors.notes}
      />

      <FormError message={formError} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={isPending} icon={<FloppyDiskIcon size={18} />}>
          Save details
        </Button>
        <SavedTick show={saved} />
      </div>
    </form>
  );
}

/**
 * One address. With `property` it corrects that address; without, it adds a
 * new one and clears itself afterwards, ready for another.
 */
export function PropertyEditForm({
  clientId,
  property,
}: {
  clientId: string;
  property?: Pick<
    Property,
    "id" | "label" | "address_line1" | "address_line2" | "city" | "postcode" | "access_notes"
  >;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isPending, errors, formError, saved, submit } = useSave(
    property ? updateProperty : addProperty,
  );
  const prefix = property?.id ?? "new";

  return (
    <form
      ref={formRef}
      action={(formData) => submit(formData, property ? undefined : () => formRef.current?.reset())}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="client_id" value={clientId} />
      {property ? <input type="hidden" name="property_id" value={property.id} /> : null}

      <TextField
        id={`${prefix}-label`}
        name="label"
        label="Label"
        hint="Optional, such as Home, Rental flat or Shop."
        autoComplete="off"
        defaultValue={property?.label ?? ""}
        error={errors.label}
      />

      <TextField
        id={`${prefix}-line1`}
        name="address_line1"
        label="Address line 1"
        required
        autoComplete="off"
        defaultValue={property?.address_line1 ?? ""}
        error={errors.address_line1}
      />

      <TextField
        id={`${prefix}-line2`}
        name="address_line2"
        label="Address line 2"
        autoComplete="off"
        defaultValue={property?.address_line2 ?? ""}
        error={errors.address_line2}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={`${prefix}-city`}
          name="city"
          label="Town or city"
          autoComplete="off"
          defaultValue={property?.city ?? ""}
          error={errors.city}
        />

        <TextField
          id={`${prefix}-postcode`}
          name="postcode"
          label="Postcode"
          required
          autoComplete="off"
          autoCapitalize="characters"
          defaultValue={property?.postcode ?? ""}
          error={errors.postcode}
        />
      </div>

      <TextAreaField
        id={`${prefix}-access`}
        name="access_notes"
        label="Access notes"
        hint="Key safe, parking, which door, the dog."
        rows={2}
        defaultValue={property?.access_notes ?? ""}
        error={errors.access_notes}
      />

      <FormError message={formError} />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          variant={property ? "primary" : "secondary"}
          loading={isPending}
          icon={property ? <FloppyDiskIcon size={18} /> : <PlusIcon size={18} />}
        >
          {property ? "Save address" : "Add this address"}
        </Button>
        <SavedTick show={saved} />
      </div>
    </form>
  );
}
