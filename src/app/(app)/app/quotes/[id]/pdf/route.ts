import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { buildQuotePdf, pdfResponse } from "@/lib/document-pdf";
import { createClient } from "@/lib/supabase/server";

/** The owner's PDF of any quote, drafts included, read under their own session. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("see_prices");

  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, reference")
    .eq("id", id)
    .maybeSingle();

  if (!quote) notFound();

  const pdf = await buildQuotePdf(supabase, quote.id);
  if (!pdf) return new Response("The PDF could not be made. Try again in a moment.", { status: 500 });

  return pdfResponse(pdf, `Quote-${quote.reference}.pdf`);
}
