import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  EnvelopeSimpleIcon,
  FileTextIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { PortalInvite } from "@/components/owner/portal-invite";
import { Card, DetailRow } from "@/components/ui/surface";
import { InvoiceStatusBadge, JobStatusBadge, QuoteStatusBadge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Customer", robots: { index: false } };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireStaff();
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, company_name, email, phone, notes, created_at, profile_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!client) notFound();

  const [{ data: properties }, { data: jobs }, { data: quotes }, { data: invoices }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, label, address_line1, address_line2, city, postcode, access_notes")
        .eq("client_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("jobs")
        .select("id, reference, title, status, scheduled_start, created_at")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("id, reference, status, total_pence, created_at")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, reference, status, total_pence, paid_pence, due_date, issue_date")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false }),
    ]);

  const outstanding = (invoices ?? [])
    .filter((invoice) => ["sent", "part_paid", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + (invoice.total_pence - invoice.paid_pence), 0);

  const lifetime = (invoices ?? [])
    .filter((invoice) => invoice.status !== "void")
    .reduce((sum, invoice) => sum + invoice.paid_pence, 0);

  return (
    <>
      <PageHeader
        title={client.full_name}
        description={client.company_name ?? undefined}
        back={{ href: "/app/clients", label: "All customers" }}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Jobs</h2>

            {(jobs ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                No jobs for this customer yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(jobs ?? []).map((job) => (
                  <li key={job.id}>
                    <Link href={`/app/jobs/${job.id}`} className={rowClasses}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{job.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-subtle">
                          <span className="font-mono tabular-nums">{job.reference}</span> ·{" "}
                          {formatRelative(job.created_at)}
                        </span>
                      </span>
                      <JobStatusBadge status={job.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Quotes</h2>

            {(quotes ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                Nothing quoted yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(quotes ?? []).map((quote) => (
                  <li key={quote.id}>
                    <Link href={`/app/quotes/${quote.id}`} className={rowClasses}>
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
            <h2 className="text-label uppercase text-ink-subtle">Invoices</h2>

            {(invoices ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                Nothing invoiced yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(invoices ?? []).map((invoice) => (
                  <li key={invoice.id}>
                    <Link href={`/app/invoices/${invoice.id}`} className={rowClasses}>
                      <ReceiptIcon size={19} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs tabular-nums text-ink-subtle">
                          {invoice.reference} · {formatDate(invoice.issue_date)}
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

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Get in touch</h2>

            <div className="mt-4 flex flex-col gap-2">
              {client.phone ? (
                <a href={`tel:${client.phone.replace(/\s/g, "")}`} className={contactClasses}>
                  <PhoneIcon size={19} weight="fill" className="text-accent" aria-hidden="true" />
                  <span className="font-medium tabular text-ink">{client.phone}</span>
                </a>
              ) : null}

              {client.email ? (
                <a href={`mailto:${client.email}`} className={contactClasses}>
                  <EnvelopeSimpleIcon size={19} className="text-accent" aria-hidden="true" />
                  <span className="min-w-0 truncate font-medium text-ink">{client.email}</span>
                </a>
              ) : null}
            </div>

            <dl className="mt-5 divide-y divide-line border-t border-line">
              <DetailRow label="Customer since">{formatDate(client.created_at)}</DetailRow>
              <DetailRow label="Owed right now">
                <span className={outstanding > 0 ? "tabular text-critical" : "tabular"}>
                  {formatPence(outstanding)}
                </span>
              </DetailRow>
              <DetailRow label="Paid you over time">
                <span className="tabular">{formatPence(lifetime)}</span>
              </DetailRow>
            </dl>
          </Card>

          <PortalInvite
            clientId={client.id}
            clientName={client.full_name}
            email={client.email}
            hasAccount={Boolean(client.profile_id)}
          />

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Addresses</h2>

            {(properties ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                No address on file. One is added automatically when an enquiry with an
                address becomes a job.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(properties ?? []).map((property) => {
                  const full = [
                    property.address_line1,
                    property.address_line2,
                    property.city,
                    property.postcode,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <li key={property.id}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(contactClasses, "items-start py-3.5")}
                      >
                        <MapPinIcon
                          size={19}
                          weight="fill"
                          className="mt-0.5 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          {property.label ? (
                            <span className="block text-xs text-ink-subtle">{property.label}</span>
                          ) : null}
                          <span className="block text-[0.9375rem] font-medium text-ink">
                            {full}
                          </span>
                          {property.access_notes ? (
                            <span className="mt-1 block text-sm text-ink-muted">
                              {property.access_notes}
                            </span>
                          ) : null}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {client.notes ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Your notes</h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink">{client.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

const rowClasses = cn(
  "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
  "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
);

const contactClasses = cn(
  "flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4",
  "transition-colors duration-200 hover:border-accent hover:bg-accent-soft",
);
