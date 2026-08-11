import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { InvoiceBuilder } from "@/components/owner/invoice-builder";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "New invoice", robots: { index: false } };

/**
 * An invoice with no job behind it.
 *
 * For work that never became a job in the app: something done before any of
 * this existed, a call-out settled on the doorstep, or a favour that turned
 * into a bill. The invoice is a legal record in its own right and does not need
 * a job to hang off — `invoices.job_id` has always been nullable.
 */
export default async function NewInvoicePage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: settings }, { data: priceItems }, { data: clients }] = await Promise.all([
    supabase.from("settings").select("*").maybeSingle(),
    supabase
      .from("price_items")
      .select("*")
      .order("times_used", { ascending: false })
      .order("description", { ascending: true }),
    supabase
      .from("clients")
      .select("id, full_name, phone")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);

  if (!settings) notFound();

  return (
    <>
      <PageHeader
        title="Invoice, no job"
        description="For work that never went through the app. Pick the customer or add them here, then put the lines in."
        back={{ href: "/app/invoices", label: "Money" }}
      />

      <div className="mx-auto max-w-4xl">
        <InvoiceBuilder
          quoteId={null}
          initialLines={[]}
          priceItems={priceItems ?? []}
          settings={settings}
          clients={clients ?? []}
        />
      </div>
    </>
  );
}
