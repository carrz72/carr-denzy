"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  ChoiceGroup,
  FormError,
  HoneypotField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_TYPES,
  MAX_PHOTOS,
  formatBytes,
  preparePhoto,
  storageKey,
  type PreparedPhoto,
} from "@/lib/photos";
import { submitEnquiry } from "@/app/request/actions";
import {services} from "@/lib/site";
import type { BusinessContact } from "@/lib/business";
import { cn } from "@/lib/cn";

/**
 * The enquiry form.
 *
 * Three steps, not one long page. A single form with fourteen fields is where
 * a hesitant, non-technical visitor gives up; three short screens with a
 * visible position indicator feel finishable. Each step asks one kind of
 * question, and the user can go back without losing anything they typed.
 *
 * Nothing is required except a name, a way to reply, and a description — every
 * other field can be left blank, because the alternative is losing an
 * enquiry over a postcode someone could not remember.
 */

type Step = 0 | 1 | 2;

const stepTitles = ["What has happened?", "Where and when", "How to reach you"];

export function RequestForm({
  initialServiceSlug,
  initialProblem,
  contact,
  signedInAs = null,
  isSignedIn = Boolean(signedInAs),
}: {
  initialServiceSlug?: string;
  initialProblem?: string;
  /** From Settings, so the owner can change the number without a redeploy. */
  contact: BusinessContact;
  /**
   * Set when the visitor already has an account. Their details are prefilled
   * and the enquiry is attached to it server-side — the id is never taken from
   * this form.
   */
  signedInAs?: { fullName: string; email: string | null; phone: string | null } | null;
  /**
   * True for any signed-in customer, even one with no linked record yet — that
   * must not send them back to the marketing site after they submit.
   */
  isSignedIn?: boolean;
}) {
  const [step, setStep] = useState<Step>(0);
  const [isPending, startTransition] = useTransition();

  const [serviceSlug, setServiceSlug] = useState(initialServiceSlug ?? "");
  const [urgency, setUrgency] = useState("soon");
  const [description, setDescription] = useState(
    initialProblem ? `${initialProblem}. ` : "",
  );

  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * Clears the form for a second request without a page load.
   *
   * A landlord reporting three faults at two addresses should not have to
   * navigate back and start again. Their contact details are prefilled from
   * the account each time, so only the problem needs retyping — the photos and
   * the previous description are deliberately cleared, since carrying those
   * over to a different fault is worse than losing them.
   */
  function startAnother() {
    for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);

    setReference(null);
    setDescription("");
    setServiceSlug(initialServiceSlug ?? "");
    setUrgency("soon");
    setPhotos([]);
    setPhotoError(null);
    setErrors({});
    setFormError(null);
    formRef.current?.reset();
    goToStep(0);
  }

  /** Moves focus to the new step's heading so a screen reader announces it. */
  function goToStep(next: Step) {
    setStep(next);
    setFormError(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // --- Step 1 validation, client side only -------------------------------
  // The server re-runs all of this. This exists so the user hears about a
  // problem immediately rather than after a round trip.
  function validateStepOne(): boolean {
    const next: Record<string, string> = {};

    if (description.trim().length < 10) {
      next.description = "Please describe the problem in a sentence or two";
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      document.getElementById("field-description")?.focus();
      return false;
    }

    return true;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;

    if (room <= 0) {
      setPhotoError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const incoming = Array.from(fileList).slice(0, room);
    const accepted: PreparedPhoto[] = [];
    const problems: string[] = [];

    for (const file of incoming) {
      const result = await preparePhoto(file);
      if (result.ok) {
        accepted.push(result.photo);
      } else {
        problems.push(result.error);
      }
    }

    // One bad photo never discards the good ones.
    if (accepted.length > 0) setPhotos((current) => [...current, ...accepted]);
    if (problems.length > 0) setPhotoError(problems[0] ?? null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const photo = current[index];
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((_, i) => i !== index);
    });
    setPhotoError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);

    // Photos go straight to storage from the browser rather than through the
    // server action — a 6-photo payload would blow past the action body limit.
    let uploadedPaths: string[] = [];

    if (photos.length > 0) {
      setUploading(true);

      try {
        const supabase = createClient();

        const results = await Promise.all(
          photos.map(async (photo) => {
            const key = storageKey("enquiry", photo.file.name);
            const { error } = await supabase.storage
              .from("enquiry-photos")
              .upload(key, photo.file, { contentType: photo.file.type, upsert: false });

            return error ? null : key;
          }),
        );

        uploadedPaths = results.filter((value): value is string => value !== null);

        if (uploadedPaths.length < photos.length) {
          // Partial failure is worth saying out loud, but it must not block
          // the enquiry — the description is the part that matters.
          setPhotoError(
            "Some photos did not upload. Your request will still be sent without them.",
          );
        }
      } catch {
        setPhotoError(
          "The photos did not upload. Your request will still be sent without them.",
        );
      } finally {
        setUploading(false);
      }
    }

    formData.delete("photo_paths");
    for (const path of uploadedPaths) formData.append("photo_paths", path);

    startTransition(async () => {
      const result = await submitEnquiry(formData);

      if (result.ok && result.reference) {
        for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
        setPhotos([]);
        setReference(result.reference);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (result.errors) {
        setErrors(result.errors);

        // Send the user back to the step that actually holds the problem,
        // rather than showing an error about a field they cannot see.
        const stepOneFields = ["description", "urgency", "service_slug"];
        const stepThreeFields = ["full_name", "email", "phone"];
        const keys = Object.keys(result.errors);

        if (keys.some((key) => stepOneFields.includes(key))) {
          goToStep(0);
        } else if (keys.some((key) => stepThreeFields.includes(key))) {
          goToStep(2);
        }
      }

      if (result.formError) setFormError(result.formError);
    });
  }

  // -----------------------------------------------------------------------
  // Success
  // -----------------------------------------------------------------------
  if (reference) {
    return (
      <div className="animate-rise rounded-2xl border border-positive/25 bg-positive-soft p-7 sm:p-10">
        <span className="flex size-14 items-center justify-center rounded-xl bg-positive text-white">
          <CheckCircleIcon size={30} weight="fill" aria-hidden="true" />
        </span>

        <h2 className="mt-6 font-display text-title text-ink">We have your request.</h2>

        <p className="container-prose mt-4 text-lg leading-relaxed text-ink">
          Your reference is{" "}
          <strong className="font-mono tabular-nums text-accent-ink">{reference}</strong>.
          Quote it if you ring us. We have sent a copy to your email if you gave us one.
        </p>

        {/*
          Sunday is closed, so the "within the hour" promise cannot hold. It is
          computed at render, on the client, from the reader's own clock — this
          screen only ever appears immediately after a submission, so "today"
          is unambiguous and there is no cached-page staleness to worry about.
        */}
        <p className="container-prose mt-4 leading-relaxed text-ink-muted">
          {new Date().getDay() === 0
            ? urgency === "emergency"
              ? "We are closed on Sundays, so we will pick this up first thing Monday. If it cannot wait until then, please ring rather than wait on this — and if you can smell gas, call 0800 111 999 straight away."
              : "We are closed on Sundays. We will come back to you on Monday morning."
            : urgency === "emergency"
              ? "You marked this as an emergency, so we will come back to you as a priority. If you have not heard within the hour, please ring — the phone gets answered faster than the inbox."
              : "We usually reply the same working day, and always within one working day."}
        </p>

        {/*
          A signed-in customer is very often a landlord with three more things
          wrong at two other addresses. Sending them to the marketing home page
          means finding their way back in, which reads as being logged out.
          They get "another one" and "back to your account" instead; everyone
          else gets the phone number, which is what a worried stranger wants.
        */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {isSignedIn ? (
            <>
              <button
                type="button"
                onClick={startAnother}
                className={buttonClasses({ size: "lg" })}
              >
                <PlusIcon size={19} weight="bold" aria-hidden="true" />
                Report something else
              </button>

              <Link
                href="/portal"
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                Back to your account
              </Link>
            </>
          ) : (
            <>
              <a href={contact.phoneHref} className={buttonClasses({ size: "lg" })}>
                <PhoneIcon size={19} weight="fill" aria-hidden="true" />
                <span className="tabular">{contact.phone}</span>
              </a>

              <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Back to the website
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Form
  // -----------------------------------------------------------------------
  const busy = isPending || uploading;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <HoneypotField />

      {/* Hidden carriers for state held in React rather than in the DOM. */}
      <input type="hidden" name="service_slug" value={serviceSlug} />
      <input
        type="hidden"
        name="service_label"
        value={services.find((item) => item.slug === serviceSlug)?.name ?? ""}
      />

      {/* --- Progress ---------------------------------------------------- */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {stepTitles.map((title, index) => (
          <li key={title} className="flex flex-1 flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "h-1 rounded-full transition-colors duration-300",
                index <= step ? "bg-accent" : "bg-line",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                index === step ? "text-accent" : "text-ink-subtle",
              )}
            >
              <span className="sr-only">
                {index < step ? "Completed: " : index === step ? "Current step: " : ""}
              </span>
              {title}
            </span>
          </li>
        ))}
      </ol>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-heading text-ink outline-none"
      >
        {stepTitles[step]}
      </h2>

      <div className="mt-6 flex flex-col gap-6">
        {/* ============ Step 1 ============ */}
        {step === 0 ? (
          <div className="animate-fade flex flex-col gap-6">
            <TextAreaField
              name="description"
              label="Tell us what is going on"
              hint="In your own words. What you can see, when it started, anything you have already tried."
              placeholder="The radiator in the front room stays cold at the top even though the others are fine. It started about a week ago."
              required
              rows={6}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              error={errors.description}
            />

            <div>
              <label htmlFor="field-service" className="font-medium text-ink">
                What sort of work is it?
              </label>
              <p id="field-service-hint" className="mt-1.5 text-sm text-ink-muted">
                A rough guess is fine — we will work it out properly from your description.
              </p>

              <select
                id="field-service"
                aria-describedby="field-service-hint"
                value={serviceSlug}
                onChange={(event) => setServiceSlug(event.target.value)}
                className={cn(
                  "mt-2 w-full rounded-md border border-line bg-surface-raised px-3.5 py-3",
                  "shadow-subtle transition-[border-color] duration-200",
                  "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
                )}
              >
                <option value="">I am not sure</option>
                {services.map((service) => (
                  <option key={service.slug} value={service.slug}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <ChoiceGroup
              legend="How urgent is it?"
              name="urgency"
              value={urgency}
              onChange={setUrgency}
              options={[
                {
                  value: "emergency",
                  label: "Emergency",
                  description: "Water coming in, no heating in winter, or a safety worry",
                  icon: <WarningIcon size={19} weight="fill" />,
                },
                {
                  value: "soon",
                  label: "Soon",
                  description: "Within the next few days",
                  icon: <ClockIcon size={19} />,
                },
                {
                  value: "flexible",
                  label: "Whenever suits",
                  description: "No particular rush",
                  icon: <ClockIcon size={19} />,
                },
              ]}
            />

            {/* Emergency guidance appears the moment it is relevant, rather
                than as a permanent warning nobody reads (spec FR-10). */}
            {urgency === "emergency" ? (
              <div className="animate-fade flex items-start gap-3.5 rounded-lg border border-caution/30 bg-caution-soft p-5">
                <PhoneIcon
                  size={22}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-caution"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-caution-ink">Please ring us as well</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">
                    For a genuine emergency the phone is much faster than this form.
                    Call{" "}
                    <a
                      href={contact.phoneHref}
                      className="font-semibold tabular underline underline-offset-4"
                    >
                      {contact.phone}
                    </a>
                    . If you can smell gas, ring 0800 111 999 first.
                  </p>
                </div>
              </div>
            ) : null}

            {/* --- Photos --- */}
            <div>
              <p className="font-medium text-ink">Photos</p>
              <p className="mt-1.5 text-sm text-ink-muted">
                Optional, but they help a lot — often enough for us to price the job
                without a visit. Up to {MAX_PHOTOS}.
              </p>

              <input
                ref={fileInputRef}
                id="field-photos"
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                multiple
                capture="environment"
                onChange={(event) => void handleFiles(event.target.files)}
                className="sr-only"
              />

              <label
                htmlFor="field-photos"
                className={cn(
                  "mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2",
                  "rounded-lg border-2 border-dashed border-line-strong bg-surface-raised p-6 text-center",
                  "transition-[border-color,background-color] duration-200",
                  "[transition-timing-function:var(--ease-standard)]",
                  "hover:border-accent hover:bg-accent-soft",
                  photos.length >= MAX_PHOTOS && "pointer-events-none opacity-50",
                )}
              >
                <CameraIcon size={26} className="text-accent" aria-hidden="true" />
                <span className="font-medium text-ink">
                  {photos.length === 0
                    ? "Take a photo or choose from your phone"
                    : `Add another (${photos.length} of ${MAX_PHOTOS})`}
                </span>
                <span className="text-sm text-ink-subtle">
                  JPG, PNG, WebP or HEIC. We shrink them for you.
                </span>
              </label>

              {photoError ? (
                <p role="alert" className="mt-2.5 text-sm font-medium text-critical">
                  {photoError}
                </p>
              ) : null}

              {photos.length > 0 ? (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((photo, index) => (
                    <li
                      key={photo.previewUrl}
                      className="group relative overflow-hidden rounded-lg border border-line bg-surface-sunken"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt={`Attached photo: ${photo.originalName}`}
                        className="aspect-4/3 w-full object-cover"
                      />

                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className={cn(
                          "absolute right-2 top-2 flex size-11 items-center justify-center rounded-md",
                          "bg-surface-inverse/80 text-white backdrop-blur-sm",
                          "transition-colors duration-200 hover:bg-critical",
                        )}
                      >
                        <span className="sr-only">Remove {photo.originalName}</span>
                        <TrashIcon size={18} aria-hidden="true" />
                      </button>

                      <p className="truncate px-2.5 py-2 text-xs text-ink-subtle">
                        {formatBytes(photo.bytes)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ============ Step 2 ============ */}
        {step === 1 ? (
          <div className="animate-fade flex flex-col gap-6">
            <p className="text-ink-muted">
              All of this is optional. It just saves us a phone call to ask.
            </p>

            <TextField
              name="address_line1"
              label="Address"
              placeholder="14 Rye Lane"
              autoComplete="address-line1"
              error={errors.address_line1}
            />

            <TextField
              name="address_line2"
              label="Address line 2"
              placeholder="Flat 2"
              autoComplete="address-line2"
              error={errors.address_line2}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <TextField
                name="city"
                label="Town or city"
                placeholder="Nottingham"
                autoComplete="address-level2"
                error={errors.city}
              />

              <TextField
                name="postcode"
                label="Postcode"
                placeholder="NG1 5AA"
                autoComplete="postal-code"
                autoCapitalize="characters"
                error={errors.postcode}
              />
            </div>

            <TextAreaField
              name="preferred_dates"
              label="When are you usually in?"
              hint="For example: any weekday morning, or Tuesdays and Thursdays after 2pm."
              placeholder="Weekday mornings are best. I work from home on Wednesdays."
              rows={3}
              error={errors.preferred_dates}
            />
          </div>
        ) : null}

        {/* ============ Step 3 ============ */}
        {step === 2 ? (
          <div className="animate-fade flex flex-col gap-6">
            {signedInAs ? (
              <p className="rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-accent-ink">
                Filled in from your account. This request will be added to it, so you can
                follow it without a reference number.
              </p>
            ) : null}

            <TextField
              name="full_name"
              label="Your name"
              required
              autoComplete="name"
              placeholder="Marcus Adeyemi"
              defaultValue={signedInAs?.fullName ?? ""}
              error={errors.full_name}
            />

            <TextField
              name="phone"
              label="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07700 900412"
              hint="The fastest way for us to reach you."
              defaultValue={signedInAs?.phone ?? ""}
              error={errors.phone}
            />

            <TextField
              name="email"
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="marcus@example.com"
              hint="We send your reference and, later, your quote here."
              defaultValue={signedInAs?.email ?? ""}
              error={errors.email}
            />

            <p className="text-sm leading-relaxed text-ink-muted">
              One of the two is enough — we just need some way to reply. We will only use
              your details to answer this request. See our{" "}
              <Link href="/privacy" className="underline underline-offset-4 hover:text-accent">
                privacy policy
              </Link>
              .
            </p>
          </div>
        ) : null}

        <FormError message={formError} />
      </div>

      {/* --- Navigation -------------------------------------------------- */}
      <div className="mt-9 flex flex-col gap-3 border-t border-line pt-7 sm:flex-row-reverse sm:justify-start">
        {step < 2 ? (
          <Button
            size="lg"
            onClick={() => {
              if (step === 0 && !validateStepOne()) return;
              goToStep((step + 1) as Step);
            }}
            icon={<ArrowRightIcon size={19} weight="bold" />}
            iconPosition="end"
          >
            Continue
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            loading={busy}
            loadingLabel={uploading ? "Uploading your photos…" : "Sending your request…"}
          >
            Send my request
          </Button>
        )}

        {step > 0 ? (
          <Button
            variant="quiet"
            size="lg"
            onClick={() => goToStep((step - 1) as Step)}
            icon={<ArrowLeftIcon size={19} weight="bold" />}
            disabled={busy}
          >
            Back
          </Button>
        ) : null}

        {step === 1 ? (
          <Button variant="link" size="lg" onClick={() => goToStep(2)} disabled={busy}>
            Skip this
          </Button>
        ) : null}
      </div>
    </form>
  );
}
