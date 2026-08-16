import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";
import {
  EnvelopeSimpleIcon,
  FileTextIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card, DetailRow } from "@/components/ui/surface";
import { InvoiceStatusBadge, JobStatusBadge, QuoteStatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { JobNoteForm, JobStatusControl, ScheduleForm } from "@/components/owner/job-controls";
import { MessageThread } from "@/components/message-thread";
import { createClient } from "@/lib/supabase/server";
import { markMessagesRead } from "@/lib/unread";
import { getSessionUser } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Job", robots: { index: false } };

export default async function OwnerJobPage({ params }: { params: Promise<{ id: string }> }) {
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
       duration_minutes, completed_at, private_notes, created_at,
       client:clients(id, full_name, email, phone, company_name),
       property:properties(address_line1, address_line2, city, postcode, access_notes),
       service:services(name)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: quotes }, { data: invoices }, { data: notes }, { data: messages }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, reference, status, total_pence, valid_until, sent_at")
        .eq("job_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, reference, status, total_pence, paid_pence, due_date")
        .eq("job_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("job_notes")
        .select("id, body, visible_to_client, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("id, body, sender_id, created_at")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const address = job.property
    ? [job.property.address_line1, job.property.city, job.property.postcode]
        .filter(Boolean)
        .join(", ")
    : null;

  const acceptedQuote = (quotes ?? []).find((quote) => quote.status === "accepted");

  return (
    <>
      <PageHeader
        title={job.title}
        back={{ href: "/app/jobs", label: "All jobs" }}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            {job.urgency === "emergency" ? <UrgencyBadge urgency={job.urgency} /> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">The job</h2>

            {job.description ? (
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink">
                {job.description}
              </p>
            ) : (
              <p className="mt-3 text-ink-muted">No description recorded.</p>
            )}

            <dl className="mt-5 divide-y divide-line border-t border-line">
              <DetailRow label="Reference">
                <span className="font-mono tabular-nums">{job.reference}</span>
              </DetailRow>
              {job.service ? <DetailRow label="Type">{job.service.name}</DetailRow> : null}
              {job.scheduled_start ? (
                <DetailRow label="Booked">
                  {formatDateTime(job.scheduled_start)}
                  {job.duration_minutes ? ` · ${formatDuration(job.duration_minutes)}` : ""}
                </DetailRow>
              ) : null}
              {job.completed_at ? (
                <DetailRow label="Finished">{formatDateTime(job.completed_at)}</DetailRow>
              ) : null}
              {job.property?.access_notes ? (
                <DetailRow label="Getting in">{job.property.access_notes}</DetailRow>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Your notes</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Private unless you tick the box. Works with no signal.
            </p>

            <div className="mt-5">
              <JobNoteForm jobId={job.id} />
            </div>

            {(notes ?? []).length > 0 ? (
              <ul className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
                {(notes ?? []).map((note) => (
                  <li key={note.id} className="rounded-md bg-surface-sunken p-4">
                    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">
                      {note.body}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-ink-subtle">
                      {formatDateTime(note.created_at)}
                      {note.visible_to_client ? (
                        <span className="font-medium text-accent">· customer can see this</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Messages with the customer</h2>
            <div className="mt-5">
              <MessageThread
                jobId={job.id}
                currentUserId={user?.id ?? ""}
                messages={messages ?? []}
                emptyLabel="No messages. Anything you write here, the customer sees in their account."
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <JobStatusControl
            jobId={job.id}
            status={job.status}
            clientName={job.client?.full_name ?? null}
          />

          {job.client ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Customer</h2>

              <Link
                href={`/app/clients/${job.client.id}`}
                className="mt-3 block font-display text-subheading text-ink hover:text-accent hover:underline hover:underline-offset-4"
              >
                {job.client.full_name}
              </Link>

              {job.client.company_name ? (
                <p className="text-sm text-ink-muted">{job.client.company_name}</p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                {job.client.phone ? (
                  <a
                    href={`tel:${job.client.phone.replace(/\s/g, "")}`}
                    className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                  >
                    <PhoneIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
                    <span className="font-medium tabular text-ink">{job.client.phone}</span>
                  </a>
                ) : null}

                {job.client.email ? (
                  <a
                    href={`mailto:${job.client.email}?subject=${encodeURIComponent(job.reference + " — " + job.title)}`}
                    className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                  >
                    <EnvelopeSimpleIcon size={19} className="text-accent" aria-hidden="true" />
                    <span className="min-w-0 truncate font-medium text-ink">{job.client.email}</span>
                  </a>
                ) : null}

                {address ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                  >
                    <MapPinIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
                    <span className="min-w-0 text-[0.9375rem] font-medium text-ink">{address}</span>
                  </a>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ScheduleForm
            jobId={job.id}
            scheduledStart={job.scheduled_start}
            durationMinutes={job.duration_minutes}
          />

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-label uppercase text-ink-subtle">Quotes</h2>
              <Link
                href={`/app/jobs/${job.id}/quote`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                New quote
              </Link>
            </div>

            {(quotes ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                No quote yet. Build one and it goes straight to the customer to accept or
                decline.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(quotes ?? []).map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={`/app/quotes/${quote.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <FileTextIcon size={19} className="shrink-0 text-accent" aria-hidden="true" />
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
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-label uppercase text-ink-subtle">Invoices</h2>
              <Link
                href={`/app/jobs/${job.id}/invoice${acceptedQuote ? `?from=${acceptedQuote.id}` : ""}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                New invoice
              </Link>
            </div>

            {(invoices ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                {acceptedQuote
                  ? "The customer accepted a quote. Creating an invoice will carry its lines across."
                  : "No invoice yet."}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(invoices ?? []).map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/app/invoices/${invoice.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <ReceiptIcon size={19} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs tabular-nums text-ink-subtle">
                          {invoice.reference}
                        </span>
                        <span className="mt-0.5 block font-medium tabular text-ink">
                          {formatPence(invoice.total_pence)}
                        </span>
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
