import { notFound } from "next/navigation";
import { buildInvoicePdf, pdfResponse } from "@/lib/document-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The public invoice as a PDF file. Same guard as the page beside it: the
 * unguessable id, and never a draft or a deleted invoice.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, reference, status, sent_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invoice || invoice.status === "draft" || !invoice.sent_at) notFound();

  const pdf = await buildInvoicePdf(supabase, invoice.id);
  if (!pdf) return new Response("The PDF could not be made. Try again in a moment.", { status: 500 });

  return pdfResponse(pdf, `Invoice-${invoice.reference}.pdf`);
}
