import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EyeIcon, PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card, DetailRow } from "@/components/ui/surface";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  BankDetails,
  BusinessBlock,
  DocumentLines,
  TotalsPanel,
} from "@/components/money-document";
import { PrintButton } from "@/components/print-button";
import { businessForInvoice } from "@/lib/invoice-snapshot";
import {
  DeleteDraftInvoiceButton,
  RemovePaymentButton,
  VoidInvoiceButton,
  RecordPaymentForm,
  ResendInvoiceButton,
  SendInvoiceButton,
} from "@/components/owner/invoice-actions";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { formatDate, formatDateTime, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import type { PaymentMethod } from "@/types/database";
import { InvoiceReminders, RemindMe } from "@/components/owner/reminders";
import { invoiceChaseSummary } from "@/lib/reminders";
import { todayInLondon } from "@/lib/dates";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

const methodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export default async function OwnerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, reference, status, issue_date, due_date, business_snapshot, client_snapshot,
         subtotal_pence, vat_pence, cis_deduction_pence, total_pence, paid_pence,
         reverse_charge, notes, sent_at, paid_at, created_at, job_id, quote_id, last_reminder_at,
         client:clients(id, full_name, email, phone, company_name, auto_reminders),
         job:jobs(id, reference, title)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!invoice || !settings) notFound();

  const [{ data: items }, { data: payments }, { data: chase }] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount_pence, method, paid_on, reference, note")
      .eq("invoice_id", id)
      .order("paid_on", { ascending: false }),
    supabase
      .from("chase_controls")
      .select("paused_until, stopped, note")
      .eq("entity", "invoice")
      .eq("entity_id", id)
      .maybeSingle(),
  ]);

  const today = todayInLondon();
  const canChase = ["sent", "part_paid", "overdue"].includes(invoice.status) && outstandingOf(invoice) > 0;
  const chaseSummary = invoiceChaseSummary({
    status: invoice.status,
    dueDate: invoice.due_date,
    outstandingPence: outstandingOf(invoice),
    lastReminderAt: invoice.last_reminder_at,
    hasEmail: Boolean(invoice.client?.email),
    clientOn: invoice.client?.auto_reminders !== false,
    settingOn: settings.remind_invoices,
    everyDays: settings.invoice_reminder_every_days,
    control: chase ?? null,
  });

  const outstanding = invoice.total_pence - invoice.paid_pence;
  const isDraft = invoice.status === "draft";
  const settled = invoice.status === "paid" || invoice.status === "void";
  const late = invoice.status === "overdue" || ((invoice.status === "sent" || invoice.status === "part_paid") && isPast(invoice.due_date));

  // A draft shows live settings, so a change in Settings shows up straight
  // away; a sent invoice shows what it was issued with (payment details on an
  // unpaid one are kept current by updateSettings).
  const business = businessForInvoice(invoice, settings);

  const clientSnapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const snapshotAddress = clientSnapshot.address as Record<string, string | null> | null;

  const footerNote =
    typeof business.invoice_footer_note === "string" ? business.invoice_footer_note : null;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={invoice.reference}
          description={invoice.job ? invoice.job.title : undefined}
          back={
            invoice.job
              ? { href: `/app/jobs/${invoice.job.id}`, label: "Back to the job" }
              : { href: "/app/invoices", label: "All invoices" }
          }
          action={<InvoiceStatusBadge status={invoice.status} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="print-avoid-break">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <BusinessBlock snapshot={business} />

              <div className="text-right">
                <p className="font-display text-heading text-ink">Invoice</p>
                <p className="mt-1 font-mono tabular-nums text-ink-muted">{invoice.reference}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-between gap-6 border-t border-line pt-6">
              <div className="text-sm leading-relaxed text-ink-muted">
                <p className="text-label uppercase text-ink-subtle">Billed to</p>
                <p className="mt-1.5 font-medium text-ink">
                  {(clientSnapshot.full_name as string | null) ??
                    invoice.client?.full_name ??
                    "Customer"}
                </p>
                {clientSnapshot.company_name ? <p>{String(clientSnapshot.company_name)}</p> : null}
                {snapshotAddress ? (
                  <p className="mt-1">
                    {[
                      snapshotAddress.address_line1,
                      snapshotAddress.address_line2,
                      snapshotAddress.city,
                      snapshotAddress.postcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : null}
              </div>

              <dl className="text-sm">
                <div className="flex justify-between gap-6">
                  <dt className="text-ink-muted">Invoice date</dt>
                  <dd className="font-medium text-ink">{formatDate(invoice.issue_date)}</dd>
                </div>
                <div className="mt-1.5 flex justify-between gap-6">
                  <dt className="text-ink-muted">Payment due</dt>
                  <dd className="font-medium text-ink">{formatDate(invoice.due_date)}</dd>
                </div>
                {invoice.job ? (
                  <div className="mt-1.5 flex justify-between gap-6">
                    <dt className="text-ink-muted">Job</dt>
                    <dd className="font-mono tabular-nums text-ink">{invoice.job.reference}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="mt-8">
              <DocumentLines
                items={items ?? []}
                vatRegistered={settings.vat_registered}
                reverseCharge={invoice.reverse_charge}
              />
            </div>

            <TotalsPanel
              className="mt-6 print-avoid-break"
              subtotalPence={invoice.subtotal_pence}
              vatPence={invoice.vat_pence}
              cisDeductionPence={invoice.cis_deduction_pence}
              totalPence={invoice.total_pence}
              paidPence={invoice.paid_pence}
              vatRegistered={settings.vat_registered}
              cisEnabled={settings.cis_enabled}
              cisDeductionRateBp={settings.cis_deduction_rate_bp}
              reverseCharge={invoice.reverse_charge}
              totalLabel="Invoice total"
            />

            {invoice.notes ? (
              <p className="mt-6 whitespace-pre-wrap border-t border-line pt-5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {invoice.notes}
              </p>
            ) : null}

            {!settled ? (
              <BankDetails
                className="mt-6 print-avoid-break"
                snapshot={business}
                reference={invoice.reference}
              />
            ) : null}

            {footerNote ? (
              <p className="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-subtle">
                {footerNote}
              </p>
            ) : null}
          </Card>

          {(payments ?? []).length > 0 ? (
            <Card className="no-print">
              <h2 className="text-label uppercase text-ink-subtle">Payments received</h2>

              <ul className="mt-4 flex flex-col gap-2">
                {(payments ?? []).map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-baseline justify-between gap-3 rounded-md bg-surface-sunken px-4 py-3"
                  >
                    <span className="text-[0.9375rem] text-ink">
                      {formatDate(payment.paid_on)}
                      <span className="ml-2 text-sm text-ink-subtle">
                        {methodLabels[payment.method]}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-ink">
                      {formatPence(payment.amount_pence)}
                    </span>
                    <RemovePaymentButton
                      paymentId={payment.id}
                      amountLabel={formatPence(payment.amount_pence)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="no-print order-first flex min-w-0 flex-col gap-6 lg:order-none">
          {isDraft ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Not sent yet</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                Check the figures. Nothing has left your account.
              </p>

              {/* Edit, then read it back as the customer will, then send —
                  the order you would use them in, each harder to undo. */}
              <Link
                href={`/app/invoices/${invoice.id}/edit`}
                className={buttonClasses({
                  variant: "secondary",
                  fullWidth: true,
                  className: "mt-5",
                })}
              >
                <PencilSimpleIcon size={18} aria-hidden="true" />
                Change the lines, dates or note
              </Link>

              <Link
                href={`/app/invoices/${invoice.id}/preview`}
                className={buttonClasses({
                  variant: "secondary",
                  fullWidth: true,
                  className: "mt-2.5",
                })}
              >
                <EyeIcon size={18} aria-hidden="true" />
                See it as the customer will
              </Link>

              <div className="mt-3">
                <SendInvoiceButton
                  invoiceId={invoice.id}
                  clientId={invoice.client?.id ?? null}
                  clientEmail={invoice.client?.email ?? null}
                  totalLabel={formatPence(invoice.total_pence)}
                />
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <DeleteDraftInvoiceButton invoiceId={invoice.id} />
              </div>
            </Card>
          ) : null}

          {late ? (
            <Card className="border-critical/25 bg-critical-soft">
              <h2 className="text-label uppercase text-critical">Overdue</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {formatPence(outstanding)} was due on {formatDate(invoice.due_date)}.
              </p>

              {invoice.client?.phone ? (
                <a
                  href={`tel:${invoice.client.phone.replace(/\s/g, "")}`}
                  className="mt-4 flex min-h-14 items-center justify-center gap-3 rounded-md border border-critical/30 bg-surface px-4 font-medium tabular text-ink transition-colors duration-200 hover:border-critical"
                >
                  Ring {invoice.client.full_name} on {invoice.client.phone}
                </a>
              ) : null}
            </Card>
          ) : null}

          {!isDraft && invoice.status !== "void" ? (
            <RecordPaymentForm invoiceId={invoice.id} outstandingPence={outstanding} />
          ) : null}

          {canChase ? (
            <InvoiceReminders
              invoiceId={invoice.id}
              line={chaseSummary.line}
              state={chaseSummary.state}
              lastSentLabel={invoice.last_reminder_at ? formatDateTime(invoice.last_reminder_at) : null}
              note={chase?.note ?? null}
              paused={Boolean(chase?.paused_until && chase.paused_until >= today)}
              stopped={Boolean(chase?.stopped)}
              canChase={canChase}
              clientEmail={invoice.client?.email ?? null}
              today={today}
            />
          ) : null}

          {!isDraft && invoice.status !== "void" ? (
            <RemindMe
              links={{ invoice_id: invoice.id, client_id: invoice.client?.id, job_id: invoice.job_id ?? undefined }}
              defaultTitle={`Chase ${invoice.client?.full_name ?? "the customer"} about ${invoice.reference}`}
              today={today}
            />
          ) : null}

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Details</h2>

            <dl className="mt-3 divide-y divide-line border-t border-line">
              <DetailRow label="Raised">{formatDateTime(invoice.created_at)}</DetailRow>
              {invoice.sent_at ? (
                <DetailRow label="Sent">{formatDateTime(invoice.sent_at)}</DetailRow>
              ) : null}
              {invoice.paid_at ? (
                <DetailRow label="Settled">{formatDateTime(invoice.paid_at)}</DetailRow>
              ) : null}
              {invoice.client ? (
                <DetailRow label="Customer">
                  <Link
                    href={`/app/clients/${invoice.client.id}`}
                    className="text-accent hover:underline hover:underline-offset-4"
                  >
                    {invoice.client.full_name}
                  </Link>
                </DetailRow>
              ) : null}
              {invoice.client ? (
                <DetailRow label="Email">
                  {invoice.client.email ? (
                    <>
                      {/* Same reason as the customers list: an address is one
                          unbreakable word and will leave the row without it. */}
                      <span className="wrap-anywhere">{invoice.client.email}</span>{" "}
                      <Link
                        href={`/app/clients/${invoice.client.id}/edit`}
                        className="text-accent hover:underline hover:underline-offset-4"
                      >
                        Change
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={`/app/clients/${invoice.client.id}/edit`}
                      className="text-accent hover:underline hover:underline-offset-4"
                    >
                      Add one
                    </Link>
                  )}
                </DetailRow>
              ) : null}
              {invoice.quote_id ? (
                <DetailRow label="From quote">
                  <Link
                    href={`/app/quotes/${invoice.quote_id}`}
                    className="text-accent hover:underline hover:underline-offset-4"
                  >
                    View the quote
                  </Link>
                </DetailRow>
              ) : null}
            </dl>

            {invoice.sent_at && invoice.status !== "void" ? (
              <div className="mt-5 border-t border-line pt-4">
                <ResendInvoiceButton
                  invoiceId={invoice.id}
                  clientId={invoice.client?.id ?? null}
                  clientEmail={invoice.client?.email ?? null}
                />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2.5">
              <Link
                href={`/app/invoices/${invoice.id}/preview`}
                className={buttonClasses({ variant: "secondary", fullWidth: true })}
              >
                <EyeIcon size={18} aria-hidden="true" />
                Customer&apos;s copy
              </Link>

              <PrintButton pdfHref={`/app/invoices/${invoice.id}/pdf`} />
            </div>

            {/* Sent but nothing paid: the one state where cancelling is clean.
                Drafts are deleted instead; once money is in, it stays. */}
            {(invoice.status === "sent" || invoice.status === "overdue") &&
            invoice.paid_pence === 0 ? (
              <div className="mt-5 border-t border-line pt-4">
                <VoidInvoiceButton invoiceId={invoice.id} reference={invoice.reference} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function outstandingOf(invoice: { total_pence: number; paid_pence: number }): number {
  return invoice.total_pence - invoice.paid_pence;
}
