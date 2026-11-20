import { notFound } from "next/navigation";
import { buildQuotePdf, pdfResponse } from "@/lib/document-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The public quote as a PDF file. Same guard as the page beside it: the
 * unguessable id, and never a draft or a deleted quote.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, reference, status, sent_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!quote || quote.status === "draft" || !quote.sent_at) notFound();

  const pdf = await buildQuotePdf(supabase, quote.id);
  if (!pdf) return new Response("The PDF could not be made. Try again in a moment.", { status: 500 });

  return pdfResponse(pdf, `Quote-${quote.reference}.pdf`);
}
