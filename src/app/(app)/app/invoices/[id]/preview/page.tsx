import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeftIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/surface";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  BankDetails,
  BusinessBlock,
  DocumentLines,
  TotalsPanel,
} from "@/components/money-document";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Invoice preview", robots: { index: false } };

/**
 * The invoice exactly as the customer will see it.
 *
 * Built from the same components the portal renders — `BusinessBlock`,
 * `DocumentLines`, `TotalsPanel`, `BankDetails` — rather than a second copy of
 * the layout. A preview that is merely *similar* to the real thing is worse
 * than none: it invites the owner to sign off on something that will go out
 * looking different.
 *
 * Everything owner-only is stripped: no payment form, no private notes, no
 * status controls. What is left is the document.
 */
export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, reference, status, issue_date, due_date, business_snapshot, client_snapshot,
         subtotal_pence, vat_pence, cis_deduction_pence, total_pence, paid_pence,
         reverse_charge, notes,
         client:clients(full_name, email),
         job:jobs(reference, title)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!invoice || !settings) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  // A draft has no snapshot yet — it is taken when the invoice is issued — so
  // live settings stand in. That is exactly what the customer would get if it
  // were sent right now, which is what a preview is for.
  const business =
    invoice.business_snapshot ??
    ({
      trading_name: settings.trading_name,
      legal_name: settings.legal_name,
      address_line1: settings.address_line1,
      address_line2: settings.address_line2,
      city: settings.city,
      postcode: settings.postcode,
      phone: settings.phone,
      email: settings.email,
      vat_registered: settings.vat_registered,
      vat_number: settings.vat_number,
      cis_enabled: settings.cis_enabled,
      utr: settings.utr,
      bank_account_name: settings.bank_account_name,
      bank_sort_code: settings.bank_sort_code,
      bank_account_number: settings.bank_account_number,
      invoice_footer_note: settings.invoice_footer_note,
    } as Record<string, unknown>);

  const clientSnapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const snapshotAddress = clientSnapshot.address as Record<string, string | null> | null;

  const footerNote =
    typeof business.invoice_footer_note === "string" ? business.invoice_footer_note : null;

  const settled = invoice.status === "paid" || invoice.status === "void";
  const customerName =
    (clientSnapshot.full_name as string | null) ?? invoice.client?.full_name ?? "your customer";

  return (
    <>
      {/* Owner-only bar. Never printed, never part of the document. */}
      <div className="no-print mb-6 flex flex-col gap-4 rounded-lg border border-accent-line bg-accent-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-accent-ink">
              <EyeIcon size={18} weight="fill" aria-hidden="true" />
              This is what {customerName} sees
            </p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
              {invoice.status === "draft"
                ? "Nothing has been sent yet. Check the figures and the wording, then send it from the invoice page."
                : "This invoice has already been sent. It is shown here as the customer sees it."}
            </p>
          </div>

          <InvoiceStatusBadge status={invoice.status} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/app/invoices/${invoice.id}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
            Back to the invoice
          </Link>

          <div className="min-w-52">
            <PrintButton label="Download or print" />
          </div>
        </div>
      </div>

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
    </>
  );
}
