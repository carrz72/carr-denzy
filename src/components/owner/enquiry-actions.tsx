"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRightIcon, BriefcaseIcon, ProhibitIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextAreaField } from "@/components/ui/field";
import { convertEnquiry, declineEnquiry } from "@/app/(app)/app/actions";
import { cn } from "@/lib/cn";

/**
 * What the owner can do with an enquiry: turn it into a job, or decline it.
 *
 * Duplicate handling is the interesting bit. If the phone number or email
 * already belongs to a customer, we offer that record rather than silently
 * merging or silently duplicating — both of which cause the same trouble
 * later, just in different ways (spec E-16).
 */

export interface ClientMatch {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export function EnquiryActions({
  enquiryId,
  status,
  jobId,
  declineReason,
  possibleMatches,
}: {
  enquiryId: string;
  status: "new" | "read" | "converted" | "declined";
  jobId: string | null;
  declineReason: string | null;
  possibleMatches: ClientMatch[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showDecline, setShowDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>(
    possibleMatches[0]?.id ?? "",
  );

  if (status === "converted" && jobId) {
    return (
      <Card tone="flat">
        <h2 className="font-display text-subheading text-ink">Already a job</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
          You turned this enquiry into a job. Everything since then lives there.
        </p>
        <Link
          href={`/app/jobs/${jobId}`}
          className={cn(buttonClasses({ fullWidth: true }), "mt-4")}
        >
          Open the job
          <ArrowRightIcon size={17} weight="bold" aria-hidden="true" />
        </Link>
      </Card>
    );
  }

  if (status === "declined") {
    return (
      <Card tone="flat">
        <h2 className="font-display text-subheading text-ink">Declined</h2>
        {declineReason ? (
          <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-muted">
            {declineReason}
          </p>
        ) : (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            No reason was recorded.
          </p>
        )}
        <p className="mt-3 text-sm text-ink-subtle">
          Nothing was sent to the customer automatically — declining is just a note to
          yourself.
        </p>
      </Card>
    );
  }

  function handleConvert(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await convertEnquiry(formData);
      // On success this redirects, so reaching here means it failed.
      if (result && !result.ok) {
        setError(result.formError ?? "Could not turn this into a job.");
      }
    });
  }

  function handleDecline(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await declineEnquiry(formData);
      if (!result.ok) setError(result.formError ?? "Could not decline that.");
      else setShowDecline(false);
    });
  }

  return (
    <Card>
      <h2 className="font-display text-subheading text-ink">What next?</h2>

      <form action={handleConvert} className="mt-4">
        <input type="hidden" name="enquiry_id" value={enquiryId} />

        {possibleMatches.length > 0 ? (
          <div className="mb-4 rounded-lg border border-caution/30 bg-caution-soft p-4">
            <p className="font-medium text-caution-ink">
              {possibleMatches.length === 1
                ? "This looks like an existing customer"
                : "These look like existing customers"}
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink">
              Use their record so the job joins their history, or create a new one.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {possibleMatches.map((match) => (
                <label
                  key={match.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md bg-surface-raised p-3"
                >
                  <input
                    type="radio"
                    name="client_id"
                    value={match.id}
                    checked={selectedClient === match.id}
                    onChange={() => setSelectedClient(match.id)}
                    className="mt-0.5 size-4.5 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{match.full_name}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {[match.phone, match.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}

              <label className="flex cursor-pointer items-center gap-2.5 rounded-md bg-surface-raised p-3">
                <input
                  type="radio"
                  name="client_id"
                  value=""
                  checked={selectedClient === ""}
                  onChange={() => setSelectedClient("")}
                  className="size-4.5 accent-accent"
                />
                <span className="font-medium text-ink">No — create a new customer</span>
              </label>
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isPending && !showDecline}
          loadingLabel="Creating the job…"
          icon={<BriefcaseIcon size={19} weight="fill" />}
        >
          Turn this into a job
        </Button>

        <p className="mt-2.5 text-sm leading-relaxed text-ink-subtle">
          Creates the customer, the address and the job, and carries their photos across.
        </p>
      </form>

      <div className="mt-5 border-t border-line pt-5">
        {showDecline ? (
          <form action={handleDecline} className="flex flex-col gap-4">
            <input type="hidden" name="enquiry_id" value={enquiryId} />

            <TextAreaField
              name="reason"
              label="Why are you declining it?"
              hint="Just a note to yourself. Nothing is sent to the customer."
              placeholder="Outside our area — recommended they try someone in Croydon."
              rows={3}
            />

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="submit" variant="destructive" loading={isPending}>
                Decline it
              </Button>
              <Button variant="quiet" onClick={() => setShowDecline(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="quiet"
            fullWidth
            onClick={() => setShowDecline(true)}
            icon={<ProhibitIcon size={18} />}
          >
            Not for us
          </Button>
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}
