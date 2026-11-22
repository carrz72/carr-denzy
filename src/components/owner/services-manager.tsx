"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  ImageIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { ServiceIcon } from "@/components/service-icon";
import { SERVICE_ICON_LABELS, SERVICE_ICON_NAMES } from "@/components/service-icon-names";
import { moveService, saveService } from "@/app/(app)/app/settings/services/actions";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto, storageKey } from "@/lib/photos";
import { portfolioImageUrl } from "@/lib/portfolio";
import type { Service } from "@/types/database";

/**
 * Settings → Services: what the website says the business does.
 *
 * Each service is a card; Edit opens its form in place. Saving updates every
 * page that mentions the service (home, services, the service's own page, the
 * footer, the quote form) and what Google reads about the business.
 */
export function ServicesManager({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveService(id, direction);
      if (!result.ok) setError(result.formError ?? "The order could not be changed.");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-subheading text-ink">Your services</h2>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
              What the website says you do. Each one has its own page and appears in the quote
              form. Changes show on the site straight away.
            </p>
          </div>
          {editing !== "new" ? (
            <Button variant="secondary" onClick={() => setEditing("new")} icon={<PlusIcon size={18} weight="bold" />}>
              Add a service
            </Button>
          ) : null}
        </div>
        {editing === "new" ? (
          <div className="mt-5 border-t border-line pt-5">
            <ServiceForm onDone={() => setEditing(null)} />
          </div>
        ) : null}
      </Card>

      <FormError message={error} />

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {services.map((service, index) => (
          <li key={service.id}>
            <Card>
              {editing === service.id ? (
                <ServiceForm service={service} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
                  >
                    <ServiceIcon name={service.icon ?? "Wrench"} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{service.name}</span>
                      {!service.is_active ? <Badge tone="caution">Hidden</Badge> : null}
                      {service.from_price ? <Badge>From {service.from_price}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-ink-muted">{service.blurb}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="quiet"
                      size="sm"
                      aria-label={`Move ${service.name} up`}
                      disabled={pending || index === 0}
                      onClick={() => move(service.id, "up")}
                      icon={<ArrowUpIcon size={16} weight="bold" />}
                    />
                    <Button
                      variant="quiet"
                      size="sm"
                      aria-label={`Move ${service.name} down`}
                      disabled={pending || index === services.length - 1}
                      onClick={() => move(service.id, "down")}
                      icon={<ArrowDownIcon size={16} weight="bold" />}
                    />
                    {service.is_active ? (
                      <a
                        href={`/services/${service.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View the ${service.name} page`}
                        className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
                      >
                        <ArrowSquareOutIcon size={16} weight="bold" />
                      </a>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(service.id)}
                      icon={<PencilSimpleIcon size={16} weight="bold" />}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState(service?.image_path ?? "");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const prefix = service ? `svc-${service.slug}` : "svc-new";

  async function upload(file: File | undefined) {
    if (!file) return;
    setErrors((current) => ({ ...current, image_path: "" }));
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      setErrors((current) => ({ ...current, image_path: prepared.error }));
      return;
    }
    setUploading(true);
    try {
      const key = storageKey("services", prepared.photo.file.name);
      const { error } = await createClient()
        .storage.from("portfolio")
        .upload(key, prepared.photo.file, { contentType: prepared.photo.file.type, upsert: false });
      if (error) {
        setErrors((current) => ({ ...current, image_path: "That photo did not upload. Try again." }));
        return;
      }
      setImagePath(key);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(prepared.photo.previewUrl);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveService(formData);
      if (result.ok) onDone();
      else {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <input type="hidden" name="image_path" value={imagePath} />

      <h3 className="font-display text-subheading text-ink">{service ? `Edit ${service.name}` : "New service"}</h3>

      <TextField id={`${prefix}-name`} name="name" label="Name" defaultValue={service?.name} error={errors.name} required />
      <TextField
        id={`${prefix}-blurb`}
        name="blurb"
        label="One-line summary"
        hint="Shown on cards and in the quote form."
        defaultValue={service?.blurb}
        error={errors.blurb}
        required
      />
      <TextAreaField
        id={`${prefix}-description`}
        name="description"
        label="About this service"
        hint="Two or three sentences at the top of the service's page."
        rows={3}
        defaultValue={service?.description ?? ""}
        error={errors.description}
        optionalLabel
      />
      <TextAreaField
        id={`${prefix}-examples`}
        name="examples"
        label="Example jobs"
        hint="One per line, so customers recognise their problem."
        rows={4}
        defaultValue={(service?.examples ?? []).join("\n")}
        error={errors.examples}
        optionalLabel
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${prefix}-from_price`}
          name="from_price"
          label="Guide price"
          hint='Shown as "from", for example £80.'
          defaultValue={service?.from_price ?? ""}
          error={errors.from_price}
          optionalLabel
        />
        <SelectField name="icon" label="Icon" defaultValue={service?.icon ?? "Wrench"} error={errors.icon}>
          {SERVICE_ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {SERVICE_ICON_LABELS[name]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        id={`${prefix}-meta_description`}
        name="meta_description"
        label="Google description"
        hint="The line under the link in Google results. About 140 characters, mentioning Nottingham. Leave blank to use the summary."
        rows={2}
        defaultValue={service?.meta_description ?? ""}
        error={errors.meta_description}
        optionalLabel
      />

      <div className="flex flex-col gap-2">
        <span className="font-medium text-ink">Photo</span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunken">
            {imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portfolioImageUrl(imagePath)} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon size={28} className="text-ink-subtle" aria-hidden="true" />
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            id={`${prefix}-photo`}
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? "Uploading…" : imagePath ? "Change photo" : "Add a photo"}
          </Button>
        </div>
        {errors.image_path ? <p className="text-sm text-critical">{errors.image_path}</p> : null}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-sunken p-4">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={service?.is_active ?? true}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
        />
        <span>
          <span className="font-medium text-ink">Show on the website</span>
          <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
            Untick to hide a service you no longer offer. Its page goes away until you tick it again.
          </span>
        </span>
      </label>

      <FormError message={formError} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={uploading}>
          {service ? "Save changes" : "Add service"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
