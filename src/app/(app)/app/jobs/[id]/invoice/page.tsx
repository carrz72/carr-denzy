import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/owner/invoice-builder";
import { linesFromItems, type DraftLine } from "@/lib/draft-lines";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "New invoice", robots: { index: false } };

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: job }, { data: settings }, { data: priceItems }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, reference, title, client:clients(id, full_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
    supabase
      .from("price_items")
      .select("*")
      .order("times_used", { ascending: false })
      .order("description", { ascending: true }),
  ]);

  if (!job || !settings || !job.client) notFound();

  // `?from=<quote id>` carries an accepted quote's lines across. The quote is
  // re-fetched and re-checked here rather than trusted from the URL: the id is
  // only a pointer, and it must belong to this job.
  let initialLines: DraftLine[] = [];
  let quoteId: string | null = null;
  let alreadyInvoiced: { id: string; reference: string } | null = null;

  if (from) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, job_id, status")
      .eq("id", from)
      .eq("job_id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (quote) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, reference")
        .eq("quote_id", quote.id)
        .is("deleted_at", null)
        .neq("status", "void")
        .limit(1)
        .maybeSingle();
      alreadyInvoiced = existing;
    }

    // Already billed: start a blank invoice rather than carry the quote over
    // a second time, and say where the first one is.
    if (quote && !alreadyInvoiced) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
        .eq("quote_id", quote.id)
        .order("sort_order", { ascending: true });

      if (items?.length) {
        initialLines = linesFromItems(items);
        quoteId = quote.id;
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Raise an invoice"
        description={`${job.reference} · ${job.title}`}
        back={{ href: `/app/jobs/${job.id}`, label: "Back to the job" }}
      />

      <div className="mx-auto max-w-4xl">
        {alreadyInvoiced ? (
          <p className="mb-6 rounded-md border border-caution/30 bg-caution-soft px-4 py-3 text-[0.9375rem] text-ink">
            This quote has already been invoiced as{" "}
            <Link
              href={`/app/invoices/${alreadyInvoiced.id}`}
              className="font-medium text-accent underline underline-offset-4"
            >
              {alreadyInvoiced.reference}
            </Link>
            . Anything you raise here is a separate, extra invoice.
          </p>
        ) : null}
        <InvoiceBuilder
          jobId={job.id}
          clientId={job.client.id}
          clientName={job.client.full_name}
          jobTitle={job.title}
          quoteId={quoteId}
          initialLines={initialLines}
          priceItems={priceItems ?? []}
          settings={settings}
        />
      </div>
    </>
  );
}
