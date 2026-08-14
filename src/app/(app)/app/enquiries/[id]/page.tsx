import Image from "next/image";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";
import {
  EnvelopeSimpleIcon,
  MapPinIcon,
  PhoneIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card, DetailRow } from "@/components/ui/surface";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { EnquiryActions } from "@/components/owner/enquiry-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { signedPhotoUrls } from "@/lib/storage";

export const metadata: Metadata = { title: "Enquiry", robots: { index: false } };

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Marking the enquiry read happens AFTER the response, never during render.
  //
  // `markEnquiryRead` is a server action, and it calls `revalidatePath`. Doing
  // that while the page is rendering is not allowed — React was already
  // rendering the tree that revalidation invalidates. Next did not throw
  // anything visible: it abandoned the segment, sent the loading skeleton, and
  // never sent the completion instruction that swaps the real content in. The
  // page sat on its skeleton for ever, with a 200 and a silent server log.
  //
  // `after()` exists for exactly this — work that must happen because of a
  // request but that the response must not wait on.
  //
  // The update is written out here rather than calling `markEnquiryRead`,
  // because that action builds its own Supabase client, and building one reads
  // cookies — which `after()` forbids. The client made above is fine to use
  // inside: it captured the cookie store when it was created, out here, and
  // only reads from that captured copy afterwards.
  //
  // `status = 'new'` in the filter is what makes this safe to run on every
  // view: re-reading an enquiry that is already read changes nothing.
  after(async () => {
    await supabase
      .from("enquiries")
      .update({ status: "read" })
      .eq("id", id)
      .eq("status", "new");

    revalidatePath("/app/enquiries");
    revalidatePath("/app", "layout");
  });

  // This page used to make five sequential database round trips, each waiting
  // on the one before it. Only two of the dependencies are real: the customer
  // match needs the enquiry's email and phone, and the signed URLs need the
  // photo paths. Everything else only ever needed the id from the URL.
  const [{ data: enquiry }, { data: photos }] = await Promise.all([
    supabase.from("enquiries").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("job_photos")
      .select("id, storage_path, created_at")
      .eq("enquiry_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!enquiry) notFound();

  const [photoUrls, { data: possibleMatches }] = await Promise.all([
    signedPhotoUrls(
      "enquiry-photos",
      (photos ?? []).map((photo) => photo.storage_path),
    ),
    // Offer to reuse an existing customer rather than creating a duplicate
    // (spec E-16). Matched on email or phone — the two things people give.
    supabase
      .from("clients")
      .select("id, full_name, email, phone")
      .is("deleted_at", null)
      .or(
        [
          enquiry.email ? `email.eq.${enquiry.email}` : null,
          enquiry.phone ? `phone.eq.${enquiry.phone}` : null,
        ]
          .filter(Boolean)
          .join(",") || "id.is.null",
      ),
  ]);

  const address = [enquiry.address_line1, enquiry.address_line2, enquiry.city, enquiry.postcode]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHeader
        title={enquiry.full_name}
        back={{ href: "/app/enquiries", label: "All enquiries" }}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={enquiry.urgency} />
            {enquiry.status === "converted" ? <Badge tone="positive">Made a job</Badge> : null}
            {enquiry.status === "declined" ? <Badge tone="neutral">Declined</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">What they said</h2>
            <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed text-ink">
              {enquiry.description}
            </p>

            {enquiry.preferred_dates ? (
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-sm text-ink-muted">When they are usually in</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink">
                  {enquiry.preferred_dates}
                </p>
              </div>
            ) : null}
          </Card>

          {photoUrls.some(Boolean) ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">
                Photos they sent ({photoUrls.filter(Boolean).length})
              </h2>

              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(photos ?? []).map((photo, index) => {
                  const url = photoUrls[index];
                  if (!url) return null;

                  return (
                    <li key={photo.id}>
                      {/* Opens full size in a new tab — on a phone the owner
                          needs to pinch into the detail of a corroded joint. */}
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-lg border border-line bg-surface-sunken transition-transform duration-200 hover:scale-[1.02]"
                      >
                        <Image
                          src={url}
                          alt={`Photo sent with enquiry ${enquiry.reference}`}
                          width={400}
                          height={300}
                          unoptimized
                          className="aspect-4/3 w-full object-cover"
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Get in touch</h2>

            <div className="mt-4 flex flex-col gap-2">
              {enquiry.phone ? (
                <a
                  href={`tel:${enquiry.phone.replace(/\s/g, "")}`}
                  className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                >
                  <PhoneIcon size={20} weight="fill" className="text-accent" aria-hidden="true" />
                  <span className="font-medium tabular text-ink">{enquiry.phone}</span>
                </a>
              ) : null}

              {enquiry.email ? (
                <a
                  href={`mailto:${enquiry.email}?subject=Your enquiry ${enquiry.reference}`}
                  className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                >
                  <EnvelopeSimpleIcon size={20} className="text-accent" aria-hidden="true" />
                  <span className="min-w-0 truncate font-medium text-ink">{enquiry.email}</span>
                </a>
              ) : null}

              {address ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                >
                  <MapPinIcon size={20} weight="fill" className="text-accent" aria-hidden="true" />
                  <span className="min-w-0 text-[0.9375rem] font-medium text-ink">{address}</span>
                </a>
              ) : null}
            </div>

            <dl className="mt-5 divide-y divide-line border-t border-line">
              <DetailRow label="Reference">
                <span className="font-mono tabular-nums">{enquiry.reference}</span>
              </DetailRow>
              <DetailRow label="Came in">{formatDateTime(enquiry.created_at)}</DetailRow>
              {enquiry.service_label ? (
                <DetailRow label="They think it is">{enquiry.service_label}</DetailRow>
              ) : null}
            </dl>
          </Card>

          <EnquiryActions
            enquiryId={enquiry.id}
            status={enquiry.status}
            jobId={enquiry.job_id}
            declineReason={enquiry.decline_reason}
            possibleMatches={possibleMatches ?? []}
          />
        </div>
      </div>
    </>
  );
}
