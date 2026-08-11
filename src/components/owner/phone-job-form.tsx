"use client";

import { useState, useTransition } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import {
  CheckField,
  ChoiceGroup,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { createPhoneJob } from "@/app/(app)/app/actions";
import { todayInLondon } from "@/lib/dates";
import type { Client, Service } from "@/types/database";

/**
 * Taking a job down while the customer is still on the phone.
 *
 * Ordered the way the call goes, not the way the database is shaped: who is
 * this, where are you, what has happened, when shall we come. Everything past
 * the name and a contact number is optional, because a call often ends with
 * "I'll text you the postcode" and refusing to save over that would push the
 * owner straight back to the paper book.
 *
 * The address and booking sections stay collapsed until they are wanted, so the
 * default screen is short enough to fill in under a minute.
 */
export function PhoneJobForm({
  clients,
  services,
}: {
  clients: Pick<Client, "id" | "full_name" | "phone">[];
  services: Pick<Service, "id" | "name">[];
}) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [existingId, setExistingId] = useState("");
  const [withAddress, setWithAddress] = useState(false);
  const [bookItIn, setBookItIn] = useState(false);

  const isNewCustomer = existingId === "";

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);

    // Clear the half of the form that is not in play, so a stale value from a
    // section the owner collapsed cannot reach the server.
    if (!isNewCustomer) {
      formData.set("full_name", "");
      formData.set("phone", "");
      formData.set("email", "");
    }

    if (!bookItIn) {
      formData.set("date", "");
      formData.set("time", "");
    }

    startTransition(async () => {
      const result = await createPhoneJob(formData);

      // On success the action redirects, so reaching here means it failed.
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      {/* --- Who is calling ---------------------------------------------- */}
      <Card>
        <h2 className="text-label uppercase text-ink-subtle">Who is it</h2>

        <div className="mt-5 flex flex-col gap-5">
          {clients.length > 0 ? (
            <SelectField
              name="client_id"
              label="Customer"
              hint="Somebody you have worked for before, or leave it on 'Someone new'."
              value={existingId}
              onChange={(event) => setExistingId(event.target.value)}
            >
              <option value="">Someone new</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                  {client.phone ? ` — ${client.phone}` : ""}
                </option>
              ))}
            </SelectField>
          ) : (
            <input type="hidden" name="client_id" value="" />
          )}

          {isNewCustomer ? (
            <>
              <TextField
                name="full_name"
                label="Their name"
                required
                autoComplete="off"
                placeholder="Margaret Hollins"
                error={errors.full_name}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  name="phone"
                  label="Phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="07700 900412"
                  error={errors.phone}
                />

                <TextField
                  name="email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  hint="For sending the quote and invoice."
                  error={errors.email}
                />
              </div>
            </>
          ) : null}
        </div>
      </Card>

      {/* --- What has happened ------------------------------------------- */}
      <Card>
        <h2 className="text-label uppercase text-ink-subtle">What has happened</h2>

        <div className="mt-5 flex flex-col gap-5">
          <TextField
            name="title"
            label="In a few words"
            required
            autoComplete="off"
            placeholder="No hot water upstairs"
            hint="This is what you will see in the diary."
            error={errors.title}
          />

          <TextAreaField
            name="description"
            label="What they told you"
            rows={4}
            placeholder="Combi in the airing cupboard, pressure gauge reading zero. Started Sunday. Has a baby in the house."
            error={errors.description}
          />

          {services.length > 0 ? (
            <SelectField name="service_id" label="Type of work" defaultValue="">
              <option value="">Not sure yet</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <ChoiceGroup
            legend="How soon"
            name="urgency"
            defaultValue="soon"
            columns={3}
            options={[
              { value: "emergency", label: "Emergency", description: "Today if you can" },
              { value: "soon", label: "Soon", description: "Within a few days" },
              { value: "flexible", label: "Flexible", description: "Whenever suits" },
            ]}
          />
        </div>
      </Card>

      {/* --- Address ------------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-label uppercase text-ink-subtle">Where</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Skip it if they are texting it over. You can add it to the job later.
            </p>
          </div>

          {!withAddress ? (
            <Button variant="secondary" size="sm" onClick={() => setWithAddress(true)}>
              Add an address
            </Button>
          ) : null}
        </div>

        {withAddress ? (
          <div className="mt-5 flex flex-col gap-5 border-t border-line pt-5">
            <TextField
              name="address_line1"
              label="Address"
              autoComplete="off"
              placeholder="14 Cyprus Avenue"
              error={errors.address_line1}
            />

            <TextField
              name="address_line2"
              label="Address line 2"
              autoComplete="off"
              error={errors.address_line2}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="city"
                label="Town or city"
                autoComplete="off"
                placeholder="Nottingham"
                error={errors.city}
              />

              <TextField
                name="postcode"
                label="Postcode"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="NG5 4FF"
                hint="Needed to save the address."
                error={errors.postcode}
              />
            </div>

            <TextAreaField
              name="access_notes"
              label="Getting in"
              rows={2}
              hint="Where to park, which door, dog in the garden — anything you will want at 8am."
              placeholder="Side gate, code 1066. Park on the road, driveway is too narrow."
              error={errors.access_notes}
            />
          </div>
        ) : null}
      </Card>

      {/* --- Book it in --------------------------------------------------- */}
      <Card>
        <CheckField
          name="book_it_in"
          label="Give it a date now"
          hint="Booking it while they are on the phone is the whole point. You can always change it."
          checked={bookItIn}
          onChange={(event) => setBookItIn(event.target.checked)}
        />

        {bookItIn ? (
          <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-3">
            <TextField
              name="date"
              label="Date"
              type="date"
              min={todayInLondon()}
              defaultValue={todayInLondon()}
              error={errors.date}
            />

            <TextField
              name="time"
              label="Arriving"
              type="time"
              step={900}
              defaultValue="09:00"
              error={errors.time}
            />

            <TextField
              name="duration_minutes"
              label="How long"
              type="number"
              inputMode="numeric"
              min={15}
              step={15}
              hint="Minutes"
              defaultValue="60"
              error={errors.duration_minutes}
            />
          </div>
        ) : (
          <input type="hidden" name="duration_minutes" value="60" />
        )}
      </Card>

      <FormError message={formError} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-ink-muted">
          {bookItIn
            ? "Saves the job and puts it straight in the diary."
            : "Saves the job. It will show as needing a date until you give it one."}
        </p>

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          icon={<CheckIcon size={19} weight="bold" />}
        >
          Save the job
        </Button>
      </div>
    </form>
  );
}
