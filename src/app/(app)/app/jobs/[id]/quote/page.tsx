import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/owner/quote-builder";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { linesFromItems, type DraftLine } from "@/lib/draft-lines";

export const metadata: Metadata = { title: "New quote", robots: { index: false } };

const fallbackTerms = [
  "This price holds for the work described above. Anything found once the job is opened up will be discussed and agreed with you before it is done.",
  "Payment by bank transfer within the terms shown on the invoice.",
  "All work is guaranteed for 12 months. Parts carry their manufacturer's warranty.",
].join("\n\n");

export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  await requirePermission("manage_quotes");
  const supabase = await createClient();

  const [{ data: job }, { data: settings }, { data: priceItems }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, reference, title, description, client:clients(full_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
    // Most-used first: after a few months the top of this list is the six
    // things this plumber actually charges for.
    supabase
      .from("price_items")
      .select("*")
      .order("times_used", { ascending: false })
      .order("description", { ascending: true }),
  ]);

  if (!job || !settings) notFound();

  // ?from=<quote id> starts from an earlier quote on this job: a customer who
  // went quiet and came back, or a price that needs a small change. The old
  // quote stays exactly as it was; this is a fresh draft with its lines,
  // note and terms, and a new "open until" date. The id is only a pointer, so
  // it is re-checked here to belong to this job.
  let initialLines: DraftLine[] | undefined;
  let initialIntro: string | null = null;
  let terms = fallbackTerms;
  let copiedFrom: string | null = null;

  if (from) {
    const { data: source } = await supabase
      .from("quotes")
      .select("id, reference, intro_note, terms")
      .eq("id", from)
      .eq("job_id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (source) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
        .eq("quote_id", source.id)
        .order("sort_order", { ascending: true });

      if (items?.length) initialLines = linesFromItems(items);
      initialIntro = source.intro_note;
      if (source.terms) terms = source.terms;
      copiedFrom = source.reference;
    }
  }

  return (
    <>
      <PageHeader
        title="Build a quote"
        description={`${job.reference} · ${job.title}`}
        back={{ href: `/app/jobs/${job.id}`, label: "Back to the job" }}
      />

      <div className="mx-auto max-w-4xl">
        {copiedFrom ? (
          <p className="mb-6 rounded-md border border-info/25 bg-info-soft px-4 py-3 text-[0.9375rem] text-info-ink">
            Copied from {copiedFrom}. Check the prices and the date, then save. {copiedFrom} itself
            stays as it was.
          </p>
        ) : null}
        <QuoteBuilder
          jobId={job.id}
          jobTitle={job.title}
          clientName={job.client?.full_name ?? "this customer"}
          priceItems={priceItems ?? []}
          settings={settings}
          defaultTerms={terms}
          initialLines={initialLines}
          initialIntro={initialIntro}
        />
      </div>
    </>
  );
}
