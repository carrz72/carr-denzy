import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/owner/quote-builder";
import { linesFromItems } from "@/lib/draft-lines";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { isPast } from "@/lib/dates";

export const metadata: Metadata = { title: "Edit quote", robots: { index: false } };

/**
 * Changing a draft before it goes out.
 *
 * The same builder as a new quote, handed what is already there. Building a
 * separate editing screen would give two forms that have to agree about
 * quantities, VAT and the price list for ever — and they would not.
 *
 * Drafts only. A sent quote is a document the customer is holding, and editing
 * it under them is not a feature.
 */
export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requirePermission("manage_quotes");
  const supabase = await createClient();

  const [{ data: quote }, { data: settings }, { data: priceItems }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `id, status, intro_note, terms, valid_until,
         job:jobs(id, reference, title, client:clients(full_name)),
         items:quote_items(description, kind, quantity_milli, unit_price_pence, vat_rate_bp, sort_order)`,
      )
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

  if (!quote || !settings || !quote.job) notFound();

  // Sent, accepted or declined — send them back to the quote rather than
  // showing a form whose save would be refused by the action anyway.
  if (quote.status !== "draft") redirect(`/app/quotes/${quote.id}`);

  const ordered = [...(quote.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <PageHeader
        title="Edit this quote"
        description={`${quote.job.reference} · ${quote.job.title}`}
        back={{ href: `/app/quotes/${quote.id}`, label: "Back to the quote" }}
      />

      <div className="mx-auto max-w-4xl">
        <QuoteBuilder
          quoteId={quote.id}
          jobId={quote.job.id}
          jobTitle={quote.job.title}
          clientName={quote.job.client?.full_name ?? "this customer"}
          priceItems={priceItems ?? []}
          settings={settings}
          defaultTerms={quote.terms ?? ""}
          initialIntro={quote.intro_note}
          // A draft left long enough for its date to pass would otherwise be
          // unsaveable: the date box refuses anything before today, so the
          // form would not submit until the owner spotted a field they never
          // touched. Offer the usual period from today instead.
          initialValidUntil={isPast(quote.valid_until) ? null : quote.valid_until}
          initialLines={linesFromItems(ordered)}
        />
      </div>
    </>
  );
}
