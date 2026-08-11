import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/owner/invoice-builder";
import { linesFromItems, type DraftLine } from "@/components/owner/line-items";
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

  if (from) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, job_id, status")
      .eq("id", from)
      .eq("job_id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (quote) {
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
