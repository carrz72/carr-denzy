"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { updateJobDetails } from "@/app/(app)/app/actions";
import { urgencyLabels } from "@/components/ui/badge";
import type { UrgencyLevel } from "@/types/database";

interface AddressOption {
  id: string;
  label: string | null;
  address_line1: string;
  postcode: string;
}

/** Correcting a job's details after it was taken down, often mid-phone-call. */
export function JobEditForm({
  job,
  services,
  addresses,
}: {
  job: {
    id: string;
    title: string;
    description: string | null;
    urgency: UrgencyLevel;
    service_id: string | null;
    property_id: string | null;
  };
  services: { id: string; name: string }[];
  addresses: AddressOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await updateJobDetails(formData);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }
      router.push(`/app/jobs/${job.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="job_id" value={job.id} />

      <TextField
        name="title"
        label="Title"
        required
        autoComplete="off"
        defaultValue={job.title}
        error={errors.title}
      />

      <TextAreaField
        name="description"
        label="What it involves"
        rows={5}
        defaultValue={job.description ?? ""}
        error={errors.description}
      />

      <SelectField
        name="property_id"
        label="Address"
        hint="A new address is added from the customer's page."
        defaultValue={job.property_id ?? ""}
        error={errors.property_id}
      >
        <option value="">No address</option>
        {addresses.map((address) => (
          <option key={address.id} value={address.id}>
            {[address.label, address.address_line1, address.postcode].filter(Boolean).join(" · ")}
          </option>
        ))}
      </SelectField>

      <SelectField
        name="service_id"
        label="Type of work"
        defaultValue={job.service_id ?? ""}
        error={errors.service_id}
      >
        <option value="">Not set</option>
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        name="urgency"
        label="How urgent"
        defaultValue={job.urgency}
        error={errors.urgency}
      >
        {(Object.keys(urgencyLabels) as UrgencyLevel[]).map((level) => (
          <option key={level} value={level}>
            {urgencyLabels[level]}
          </option>
        ))}
      </SelectField>

      <FormError message={formError} />

      <Button type="submit" loading={isPending} icon={<FloppyDiskIcon size={18} />} className="self-start">
        Save the job
      </Button>
    </form>
  );
}
