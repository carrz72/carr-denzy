import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderInvoicePdf, renderQuotePdf } from "@/lib/invoice-pdf";
import { businessForInvoice } from "@/lib/invoice-snapshot";
import type { Database } from "@/types/database";

/**
 * Loads a quote or invoice and renders it as a PDF.
 *
 * Shared by the email senders (attachments) and the PDF download routes, so
 * the file someone downloads is byte-for-byte the same document as the one
 * they were emailed. The caller picks the client: the owner's own session
 * (RLS applies) or the admin client behind an unguessable public link.
 */

type DbClient = SupabaseClient<Database>;

/**
 * Renders a quote as a PDF, using the same document as invoices.
 *
 * Reads the business details live from `settings` rather than from a snapshot,
 * because unlike an invoice a quote is not a permanent financial record — it is
 * an offer, and if the phone number changed between quoting and the customer
 * opening the PDF, the newer one is the more useful of the two.
 */
export async function buildQuotePdf(
  supabase: DbClient,
  quoteId: string,
): Promise<Buffer | undefined> {

  const [{ data: quote }, { data: business }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `reference, sent_at, valid_until, subtotal_pence, tax_pence, total_pence, intro_note,
         client:clients(full_name, company_name),
         job:jobs(property:properties(address_line1, address_line2, city, postcode)),
         items:quote_items(description, kind, quantity_milli, unit_price_pence, vat_rate_bp, sort_order)`,
      )
      .eq("id", quoteId)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!quote) return undefined;

  const address = quote.job?.property;

  return renderQuotePdf({
    reference: quote.reference,
    issueDate: quote.sent_at,
    dueDate: quote.valid_until,
    business: business as Record<string, unknown> | null,
    customerName: quote.client?.full_name ?? "your customer",
    customerCompany: quote.client?.company_name ?? null,
    customerAddress: address
      ? [address.address_line1, address.address_line2, address.city, address.postcode]
          .filter(Boolean)
          .join(", ")
      : null,
    items: [...(quote.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    subtotalPence: quote.subtotal_pence,
    vatPence: quote.tax_pence,
    cisDeductionPence: 0,
    cisDeductionRateBp: business?.cis_deduction_rate_bp ?? 0,
    totalPence: quote.total_pence,
    vatRegistered: business?.vat_registered ?? false,
    // CIS is deducted when an invoice is paid, never on a quote — the customer
    // is being shown the price of the work, not a subcontractor settlement.
    cisEnabled: false,
    reverseCharge: false,
    notes: quote.intro_note,
    footerNote: null,
  });
}

/**
 * Builds the PDF copy attached to an invoice email. Reads back everything
 * needed for `money-document.tsx`'s figures — the same source the portal and
 * print pages use — so the attachment can never disagree with what the
 * customer sees on the invoice page. Returns null rather than throwing: a
 * missing attachment is not worth losing the whole send over.
 */
export async function buildInvoicePdf(
  supabase: DbClient,
  invoiceId: string,
): Promise<Buffer | null> {
  const [{ data: invoice, error: invoiceError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          `reference, issue_date, due_date, business_snapshot, client_snapshot,
           subtotal_pence, vat_pence, cis_deduction_pence, total_pence, paid_pence,
           reverse_charge, notes, status, client:clients(full_name)`,
        )
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase.from("settings").select("*").maybeSingle(),
    ]);

  if (!invoice || !settings) {
    console.error("[invoice] pdf skipped: missing data", {
      invoiceError: invoiceError?.message,
      settingsError: settingsError?.message,
      hasInvoice: !!invoice,
      hasSettings: !!settings,
    });
    return null;
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  // A draft carries live settings, so an owner downloading one before sending
  // sees the bank details they saved this morning, not the ones from creation.
  const business = businessForInvoice(invoice, settings);
  const clientSnapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const snapshotAddress = clientSnapshot.address as Record<string, string | null> | null;
  const footerNote =
    typeof business.invoice_footer_note === "string" ? business.invoice_footer_note : null;

  try {
    return await renderInvoicePdf({
      reference: invoice.reference,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      business,
      customerName:
        (clientSnapshot.full_name as string | null) ?? invoice.client?.full_name ?? "your customer",
      customerCompany: (clientSnapshot.company_name as string | null) ?? null,
      customerAddress: snapshotAddress
        ? [
            snapshotAddress.address_line1,
            snapshotAddress.address_line2,
            snapshotAddress.city,
            snapshotAddress.postcode,
          ]
            .filter(Boolean)
            .join(", ")
        : null,
      items: items ?? [],
      subtotalPence: invoice.subtotal_pence,
      vatPence: invoice.vat_pence,
      cisDeductionPence: invoice.cis_deduction_pence,
      cisDeductionRateBp: settings.cis_deduction_rate_bp,
      totalPence: invoice.total_pence,
      paidPence: invoice.paid_pence,
      vatRegistered: settings.vat_registered,
      cisEnabled: settings.cis_enabled,
      reverseCharge: invoice.reverse_charge,
      notes: invoice.notes,
      footerNote,
      settled: invoice.status === "paid" || invoice.status === "void",
      voided: invoice.status === "void",
    });
  } catch (pdfError) {
    console.error("[invoice] pdf generation failed", pdfError);
    return null;
  }
}

/**
 * Wraps a rendered PDF for a download route.
 *
 * `inline` rather than `attachment`: on an iPhone home-screen app a forced
 * download goes nowhere visible, while an inline PDF opens in the system
 * viewer with the share sheet (Save to Files, Print, Mail). Desktop browsers
 * show it in a tab with their own save button. `no-store` because these are
 * per-customer financial documents that must never sit in a shared cache.
 */
export function pdfResponse(pdf: Buffer, filename: string): Response {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "-");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
