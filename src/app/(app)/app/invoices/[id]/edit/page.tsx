import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/owner/invoice-builder";
import { linesFromItems } from "@/lib/draft-lines";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit invoice", robots: { index: false } };

/**
 * Changing a draft invoice before it goes out.
 *
 * The same builder as a new invoice, handed what is already there, so the
 * two can never disagree about VAT, CIS or the price list. Drafts only: once
 * sent, an invoice is a record the customer is holding.
 */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requirePermission("manage_invoices");
  const supabase = await createClient();

  const [{ data: invoice }, { data: items }, { data: settings }, { data: priceItems }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          `id, reference, status, issue_date, due_date, notes, reverse_charge, job_id, quote_id,
           client:clients(id, full_name),
           job:jobs(id, reference, title)`,
        )
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("invoice_items")
        .select("description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
        .eq("invoice_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("settings").select("*").maybeSingle(),
      supabase
        .from("price_items")
        .select("*")
        .order("times_used", { ascending: false })
        .order("description", { ascending: true }),
    ]);

  if (!invoice || !settings) notFound();

  // Sent, paid or void — back to the invoice rather than a form whose save
  // would be refused anyway.
  if (invoice.status !== "draft") redirect(`/app/invoices/${invoice.id}`);

  return (
    <>
      <PageHeader
        title="Edit this invoice"
        description={
          invoice.job ? `${invoice.job.reference} · ${invoice.job.title}` : invoice.reference
        }
        back={{ href: `/app/invoices/${invoice.id}`, label: "Back to the invoice" }}
      />

      <div className="mx-auto max-w-4xl">
        <InvoiceBuilder
          invoiceId={invoice.id}
          jobId={invoice.job_id ?? undefined}
          clientId={invoice.client?.id}
          clientName={invoice.client?.full_name ?? "this customer"}
          jobTitle={invoice.job?.title ?? `Invoice ${invoice.reference}`}
          quoteId={invoice.quote_id}
          initialLines={linesFromItems(items ?? [])}
          priceItems={priceItems ?? []}
          settings={settings}
          initialIssueDate={invoice.issue_date}
          initialDueDate={invoice.due_date}
          initialNotes={invoice.notes}
          initialReverseCharge={invoice.reverse_charge}
        />
      </div>
    </>
  );
}
