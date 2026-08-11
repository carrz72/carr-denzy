import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircleIcon, LinkIcon } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/surface";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import {
  BankDetails,
  BusinessBlock,
  DocumentLines,
  TotalsPanel,
} from "@/components/money-document";
import { PrintButton } from "@/components/print-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { business } from "@/lib/site";
import type { PaymentMethod } from "@/types/database";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

const methodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

/**
 * The invoice, with no account needed to see it.
 *
 * Every other view of an invoice sits behind Row Level Security — the owner's
 * copy needs staff, the portal copy needs the client's own session. Neither
 * works for the person this link is actually emailed to: a payments or
 * accounts-payable clerk who has never had, and will never need, a login for
 * this business's systems.
 *
 * So this route is deliberately public, and deliberately reads with the
 * admin client to get past RLS. What guards it instead is the invoice id
 * itself — a 128-bit UUID that is never listed or enumerable, only ever
 * handed out one at a time in an email. That is the same "anyone with the
 * link" model most invoicing and document-sharing products use; it is not a
 * weaker guarantee than a login, just a different one, and it is the only
 * one that also works for someone who was never given an account.
 *
 * Nothing sensitive beyond what the named customer already gets in the
 * portal is exposed here — the query below is the same one the portal page
 * runs.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createAdminClient();

  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, reference, status, issue_date, due_date, business_snapshot, client_snapshot,
         subtotal_pence, vat_pence, cis_deduction_pence, total_pence, paid_pence,
         reverse_charge, notes, sent_at, paid_at,
         job:jobs(id, title)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("phone, vat_registered, cis_enabled, cis_deduction_rate_bp")
      .maybeSingle(),
  ]);

  // A draft has never been sent, and a link to one has never been handed to
  // anybody — treat it exactly like a missing invoice rather than let it be
  // guessed at while still being written.
  if (!invoice || invoice.status === "draft" || !invoice.sent_at) notFound();

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount_pence, method, paid_on, reference")
      .eq("invoice_id", id)
      .order("paid_on", { ascending: false }),
  ]);

  const snapshot = invoice.business_snapshot as Record<string, unknown> | null;
  const clientSnapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const snapshotAddress = clientSnapshot.address as Record<string, string | null> | null;

  const outstanding = invoice.total_pence - invoice.paid_pence;
  const paid = invoice.status === "paid";
  const late = invoice.status === "overdue" || (invoice.status === "sent" && isPast(invoice.due_date));

  const footerNote =
    typeof snapshot?.invoice_footer_note === "string" ? snapshot.invoice_footer_note : null;

  const phone = settings?.phone ?? business.phone;
  const customerName = (clientSnapshot.full_name as string | null) ?? "the customer";

  return (
    <main className="container-page py-8 md:py-10">
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-surface-sunken p-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <LinkIcon size={18} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            Anyone with this link can view this invoice — it was sent directly to {customerName} by
            email, so it works without signing in.
          </p>
        </div>

        <InvoiceStatusBadge status={invoice.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <Card className="print-avoid-break">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <BusinessBlock snapshot={snapshot} />

            <div className="text-right">
              <p className="font-display text-heading text-ink">Invoice</p>
              <p className="mt-1 font-mono tabular-nums text-ink-muted">{invoice.reference}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-between gap-6 border-t border-line pt-6">
            <div className="text-sm leading-relaxed text-ink-muted">
              <p className="text-label uppercase text-ink-subtle">Billed to</p>
              <p className="mt-1.5 font-medium text-ink">{customerName}</p>
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
                  <dd className="text-ink">{invoice.job.title}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="mt-8">
            <DocumentLines
              items={items ?? []}
              vatRegistered={settings?.vat_registered ?? false}
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
            vatRegistered={settings?.vat_registered ?? false}
            cisEnabled={settings?.cis_enabled ?? false}
            cisDeductionRateBp={settings?.cis_deduction_rate_bp ?? 0}
            reverseCharge={invoice.reverse_charge}
            totalLabel="Invoice total"
          />

          {invoice.notes ? (
            <p className="mt-6 whitespace-pre-wrap border-t border-line pt-5 text-[0.9375rem] leading-relaxed text-ink-muted">
              {invoice.notes}
            </p>
          ) : null}

          {!paid ? (
            <BankDetails
              className="mt-6 print-avoid-break"
              snapshot={snapshot}
              reference={invoice.reference}
            />
          ) : null}

          {footerNote ? (
            <p className="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-ink-subtle">
              {footerNote}
            </p>
          ) : null}
        </Card>

        <div className="no-print flex flex-col gap-6">
          {paid ? (
            <Card className="border-positive/25 bg-positive-soft">
              <h2 className="flex items-center gap-2 text-label uppercase text-positive-ink">
                <CheckCircleIcon size={17} weight="fill" aria-hidden="true" />
                Paid in full
              </h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {invoice.paid_at
                  ? `Settled on ${formatDate(invoice.paid_at)}. `
                  : "This invoice is settled. "}
                Nothing further to do.
              </p>
            </Card>
          ) : (
            <Card className={late ? "border-caution/30 bg-caution-soft" : undefined}>
              <h2 className="text-label uppercase text-ink-subtle">
                {late ? "This one is past its date" : "Still to pay"}
              </h2>

              <p className="mt-2 font-mono text-heading font-bold tabular-nums text-ink">
                {formatPence(Math.max(outstanding, 0))}
              </p>

              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                {late
                  ? `This was due on ${formatDate(invoice.due_date)}. If something is wrong with it, ring us on ${phone}.`
                  : `Payable by bank transfer by ${formatDate(invoice.due_date)}. The details are on the invoice, with the reference to quote.`}
              </p>
            </Card>
          )}

          {(payments ?? []).length > 0 ? (
            <Card>
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
                      </span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-ink">
                      {formatPence(payment.amount_pence)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Keep a copy</h2>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              This page prints as a clean invoice, or saves as a PDF for your records.
            </p>

            <div className="mt-5">
              <PrintButton />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
