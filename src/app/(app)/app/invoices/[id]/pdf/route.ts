import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { buildInvoicePdf, pdfResponse } from "@/lib/document-pdf";
import { createClient } from "@/lib/supabase/server";

/** The owner's PDF of any invoice, drafts included, read under their own session. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("see_prices");

  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, reference")
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();

  const pdf = await buildInvoicePdf(supabase, invoice.id);
  if (!pdf) return new Response("The PDF could not be made. Try again in a moment.", { status: 500 });

  return pdfResponse(pdf, `Invoice-${invoice.reference}.pdf`);
}
