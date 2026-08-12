import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { BusinessBlock, DocumentLines, TotalsPanel } from "@/components/money-document";
import { PrintButton } from "@/components/print-button";
import { QuoteLinkResponse } from "@/components/quote-link-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, isPast } from "@/lib/dates";
import { business } from "@/lib/site";

export const metadata: Metadata = { title: "Quote", robots: { index: false, follow: false } };

/**
 * The quote, with no account needed to see or answer it.
 *
 * This mirrors /invoices/view/[id] deliberately, because the problem is the
 * same one: most of this business's customers arrive by telephone, have a
 * client record and no login, and the portal link was a sign-in wall at the
 * exact moment they were about to agree to the work.
 *
 * Guarded by the quote's own id — a 128-bit UUID, never listed, never
 * enumerable, handed out one at a time in an email. That is the "anyone with
 * the link" model, and it is the only one that also works for the person's
 * partner, their landlord or their letting agent, none of whom will ever have
 * an account here.
 *
 * A draft returns 404. A link to one has never been given to anybody, and a
 * half-written price must not be readable while it is still being decided.
 */
export default async function PublicQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createAdminClient();

  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `id, reference, status, intro_note, terms, valid_until, sent_at, responded_at,
         subtotal_pence, tax_pence, total_pence,
         client:clients(full_name, company_name),
         job:jobs(title, description),
         items:quote_items(id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp, sort_order)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("settings")
      .select(
        "trading_name, legal_name, address_line1, address_line2, city, postcode, phone, email, vat_registered, vat_number, cis_enabled, cis_deduction_rate_bp",
      )
      .maybeSingle(),
  ]);

  if (!quote || quote.status === "draft" || !quote.sent_at) notFound();

  const items = [...(quote.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // `expired` is a stored status that a nightly-ish sweep sets. The date is the
  // real fact, so check it here too rather than showing a lapsed quote as live
  // just because nothing has run since it lapsed.
  const lapsed = quote.status === "expired" || (quote.status === "sent" && isPast(quote.valid_until));
  const answerable = quote.status === "sent" && !lapsed;

  return (
    <div className="min-h-dvh bg-surface-sunken py-8 md:py-12">
      <div className="container-page">
        <div className="mx-auto max-w-3xl">
          {/* --- The response, ABOVE the document ---------------------------
              Deliberately first on the page. Someone opening this on a phone
              has already decided most of the time; making them scroll a full
              itemised quote to find the Accept button loses the ones who were
              ready to say yes. The detail is directly below for the ones who
              want it. */}
          {answerable ? (
            <div className="no-print mb-8">
              <QuoteLinkResponse
                quoteId={quote.id}
                totalPence={quote.total_pence}
                validUntil={quote.valid_until ? formatDate(quote.valid_until) : null}
              />
            </div>
          ) : null}

          {!answerable ? (
            <div className="no-print mb-8 rounded-xl border border-line bg-surface-raised p-6">
              <div className="flex flex-wrap items-center gap-3">
                <QuoteStatusBadge status={lapsed ? "expired" : quote.status} />
                {quote.responded_at ? (
                  <span className="text-sm text-ink-muted">
                    Answered {formatDate(quote.responded_at)}
                  </span>
                ) : null}
              </div>

              <p className="container-prose mt-3 leading-relaxed text-ink-muted">
                {quote.status === "accepted"
                  ? "You have accepted this quote — there is nothing else to do. We will be in touch to agree a date."
                  : quote.status === "declined"
                    ? "This quote was declined. If that was not what you meant, give us a ring and we will sort it out."
                    : "This quote has passed the date it was held until. Ring us and we will price it again — it may not have changed."}
              </p>

              <a
                href={business.phoneHref}
                className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-accent hover:underline hover:underline-offset-4"
              >
                <PhoneIcon size={18} weight="fill" aria-hidden="true" />
                <span className="tabular">{business.phone}</span>
              </a>
            </div>
          ) : null}

          {/* --- The quote itself ---------------------------------------- */}
          <article className="rounded-xl border border-line bg-surface-raised p-6 shadow-subtle sm:p-9 print:border-0 print:shadow-none">
            <header className="flex flex-wrap items-start justify-between gap-6">
              <BusinessBlock snapshot={settings as Record<string, unknown> | null} />

              <div className="text-right">
                <p className="text-label uppercase text-ink-subtle">Quote</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">
                  {quote.reference}
                </p>
                {quote.valid_until ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    Held until {formatDate(quote.valid_until)}
                  </p>
                ) : null}
              </div>
            </header>

            <div className="mt-8 border-t border-line pt-6">
              <p className="text-sm text-ink-muted">Prepared for</p>
              <p className="mt-0.5 font-medium text-ink">{quote.client?.full_name}</p>
              {quote.client?.company_name ? (
                <p className="text-sm text-ink-muted">{quote.client.company_name}</p>
              ) : null}

              {quote.job?.title ? (
                <p className="mt-3 text-[0.9375rem] text-ink">
                  <span className="text-ink-muted">For: </span>
                  {quote.job.title}
                </p>
              ) : null}
            </div>

            {quote.intro_note ? (
              <p className="mt-6 whitespace-pre-wrap leading-relaxed text-ink">
                {quote.intro_note}
              </p>
            ) : null}

            <div className="mt-8">
              <DocumentLines
                items={items}
                vatRegistered={settings?.vat_registered ?? false}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <TotalsPanel
                className="w-full max-w-xs"
                subtotalPence={quote.subtotal_pence}
                vatPence={quote.tax_pence}
                cisDeductionPence={0}
                totalPence={quote.total_pence}
                vatRegistered={settings?.vat_registered ?? false}
                cisEnabled={settings?.cis_enabled ?? false}
                cisDeductionRateBp={settings?.cis_deduction_rate_bp ?? 0}
                totalLabel="Total for the work"
              />
            </div>

            {quote.terms ? (
              <div className="mt-8 border-t border-line pt-6">
                <h2 className="text-label uppercase text-ink-subtle">Terms</h2>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {quote.terms}
                </p>
              </div>
            ) : null}

            <footer className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-ink-muted">
              <p>
                This is a quote, not a bill. Nothing is payable until the work is done and
                invoiced.
              </p>
              <p className="mt-2">
                Questions? Ring{" "}
                <a href={business.phoneHref} className="font-medium tabular text-ink">
                  {business.phone}
                </a>
                .
              </p>
            </footer>
          </article>

          <div className="no-print mt-6 flex justify-center">
            <PrintButton label="Print or save as PDF" />
          </div>
        </div>
      </div>
    </div>
  );
}
