import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { QuoteBuilder } from "@/components/owner/quote-builder";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "New quote", robots: { index: false } };

const fallbackTerms = [
  "This price holds for the work described above. Anything found once the job is opened up will be discussed and agreed with you before it is done.",
  "Payment by bank transfer within the terms shown on the invoice.",
  "All work is guaranteed for 12 months. Parts carry their manufacturer's warranty.",
].join("\n\n");

export default async function NewQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireOwner();
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

  return (
    <>
      <PageHeader
        title="Build a quote"
        description={`${job.reference} · ${job.title}`}
        back={{ href: `/app/jobs/${job.id}`, label: "Back to the job" }}
      />

      <div className="mx-auto max-w-4xl">
        <QuoteBuilder
          jobId={job.id}
          jobTitle={job.title}
          clientName={job.client?.full_name ?? "this customer"}
          priceItems={priceItems ?? []}
          settings={settings}
          defaultTerms={fallbackTerms}
        />
      </div>
    </>
  );
}
