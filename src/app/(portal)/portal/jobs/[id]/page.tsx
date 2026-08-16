import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";
import {
  CameraIcon,
  FileTextIcon,
  MapPinIcon,
  ReceiptIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { JobTimeline } from "@/components/job-timeline";
import { MessageThread } from "@/components/message-thread";
import { InvoiceStatusBadge, JobStatusBadge, QuoteStatusBadge } from "@/components/ui/badge";
import { Card, DetailRow } from "@/components/ui/surface";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { markMessagesRead } from "@/lib/unread";
import { getSessionUser } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { signedPhotoUrls } from "@/lib/storage";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Your job", robots: { index: false } };

export default async function PortalJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getSessionUser();
  const supabase = await createClient();

  // Opening the thread is what makes it read, so the badge on the navigation
  // can reach zero. In `after()`, never during render: this is a write, and a
  // page that writes while rendering is what broke the enquiry screen.
  if (user) after(() => markMessagesRead(id, user.id));

  const { data: job } = await supabase
    .from("jobs")
    .select(
      `id, reference, title, description, status, urgency, scheduled_start,
       duration_minutes, completed_at, created_at,
       property:properties(address_line1, address_line2, city, postcode, access_notes),
       service:services(name)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  // RLS returned nothing — either the job does not exist, or it is somebody
  // else's. A 404 rather than a 403 for both, so job ids cannot be probed
  // (spec E-6, AC-3).
  if (!job) notFound();

  const [{ data: events }, { data: quotes }, { data: invoices }, { data: photos }, { data: messages }] =
    await Promise.all([
      supabase
        .from("job_events")
        .select("to_status, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("quotes")
        .select("id, reference, status, total_pence, valid_until, sent_at")
        .eq("job_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, reference, status, total_pence, paid_pence, due_date")
        .eq("job_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("job_photos")
        .select("id, storage_path, caption, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("id, body, sender_id, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const photoUrls = await signedPhotoUrls("job-photos", (photos ?? []).map((p) => p.storage_path));

  const openQuote = (quotes ?? []).find((quote) => quote.status === "sent");

  return (
    <>
      <PageHeader
        title={job.title}
        back={{ href: "/portal", label: "All your jobs" }}
        action={<JobStatusBadge status={job.status} />}
      />

      {/* The single most important thing on the page when there is one: a
          quote waiting on the customer. It goes above everything else. */}
      {openQuote ? (
        <div className="mb-8 rounded-lg border border-accent-line bg-accent-soft p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-subheading text-accent-ink">
                We have sent you a quote for {formatPence(openQuote.total_pence)}
              </p>
              <p className="mt-1 text-[0.9375rem] text-ink">
                Have a look at what it covers, then accept or decline it.
              </p>
            </div>

            <Link
              href={`/portal/quotes/${openQuote.id}`}
              className={buttonClasses({ size: "lg" })}
            >
              View the quote
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Progress</h2>
            <div className="mt-5">
              <JobTimeline status={job.status} events={events ?? []} />
            </div>
          </Card>

          {photoUrls.length > 0 ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Photos</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Taken as we go, so you have a record of what was behind the wall.
              </p>

              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(photos ?? []).map((photo, index) => {
                  const url = photoUrls[index];
                  if (!url) return null;

                  return (
                    <li key={photo.id}>
                      <figure>
                        <div className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
                          <Image
                            src={url}
                            alt={photo.caption ?? `Photograph taken on ${formatDateTime(photo.created_at)}`}
                            width={400}
                            height={300}
                            unoptimized
                            className="aspect-4/3 w-full object-cover"
                          />
                        </div>
                        {photo.caption ? (
                          <figcaption className="mt-1.5 text-xs leading-snug text-ink-muted">
                            {photo.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Messages</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Anything you want to tell us about this job. We see it alongside the job.
            </p>

            <div className="mt-5">
              <MessageThread
                jobId={job.id}
                currentUserId={user?.id ?? ""}
                messages={messages ?? []}
                emptyLabel="No messages yet. If something changes at your end, tell us here."
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Details</h2>

            <dl className="mt-3 divide-y divide-line">
              <DetailRow label="Reference">
                <span className="font-mono tabular-nums">{job.reference}</span>
              </DetailRow>

              {job.service ? <DetailRow label="Type of work">{job.service.name}</DetailRow> : null}

              {job.scheduled_start ? (
                <DetailRow label="Booked for">
                  {formatDateTime(job.scheduled_start)}
                  {job.duration_minutes ? (
                    <span className="block text-sm font-normal text-ink-muted">
                      Allow about {formatDuration(job.duration_minutes)}
                    </span>
                  ) : null}
                </DetailRow>
              ) : null}

              {job.completed_at ? (
                <DetailRow label="Finished">{formatDateTime(job.completed_at)}</DetailRow>
              ) : null}

              {job.property ? (
                <DetailRow label="Address">
                  <span className="block font-normal">
                    {job.property.address_line1}
                    {job.property.address_line2 ? (
                      <>
                        <br />
                        {job.property.address_line2}
                      </>
                    ) : null}
                    <br />
                    {job.property.city ? `${job.property.city}, ` : ""}
                    {job.property.postcode}
                  </span>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      [job.property.address_line1, job.property.city, job.property.postcode]
                        .filter(Boolean)
                        .join(", "),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline hover:underline-offset-4"
                  >
                    <MapPinIcon size={15} weight="fill" aria-hidden="true" />
                    Open in maps
                  </a>
                </DetailRow>
              ) : null}
            </dl>

            {job.description ? (
              <div className="mt-5 border-t border-line pt-5">
                <p className="text-sm text-ink-muted">What you told us</p>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink">
                  {job.description}
                </p>
              </div>
            ) : null}
          </Card>

          {(quotes ?? []).length > 0 ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Quotes</h2>

              <ul className="mt-4 flex flex-col gap-2">
                {(quotes ?? []).map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={`/portal/quotes/${quote.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <FileTextIcon
                        size={20}
                        className="shrink-0 text-accent"
                        aria-hidden="true"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs tabular-nums text-ink-subtle">
                          {quote.reference}
                        </span>
                        <span className="mt-0.5 block font-medium tabular text-ink">
                          {formatPence(quote.total_pence)}
                        </span>
                      </span>

                      <QuoteStatusBadge status={quote.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {(invoices ?? []).length > 0 ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Invoices</h2>

              <ul className="mt-4 flex flex-col gap-2">
                {(invoices ?? []).map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <ReceiptIcon size={20} className="shrink-0 text-accent" aria-hidden="true" />

                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs tabular-nums text-ink-subtle">
                          {invoice.reference}
                        </span>
                        <span className="mt-0.5 block font-medium tabular text-ink">
                          {formatPence(invoice.total_pence)}
                          {invoice.paid_pence > 0 && invoice.paid_pence < invoice.total_pence ? (
                            <span className="ml-1.5 text-sm font-normal text-ink-muted">
                              ({formatPence(invoice.total_pence - invoice.paid_pence)} left)
                            </span>
                          ) : null}
                        </span>
                      </span>

                      <InvoiceStatusBadge status={invoice.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {photoUrls.length === 0 ? (
            <Card tone="flat" className="text-center">
              <CameraIcon
                size={26}
                weight="duotone"
                className="mx-auto text-ink-subtle"
                aria-hidden="true"
              />
              <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                Photographs will appear here as we work.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
