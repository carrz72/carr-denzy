import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeftIcon, CheckIcon, EyeIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { BusinessBlock, DocumentLines, TotalsPanel } from "@/components/money-document";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { business } from "@/lib/site";

export const metadata: Metadata = { title: "Quote preview", robots: { index: false } };

/**
 * The quote exactly as the customer will see it.
 *
 * Built from the same components the public page renders — `BusinessBlock`,
 * `DocumentLines`, `TotalsPanel` — rather than a second copy of the layout. A
 * preview that is merely *similar* to the real thing is worse than none: it
 * builds confidence in something that was never checked.
 *
 * The one deliberate difference is the Accept and Decline buttons, which are
 * inert here. Rendering them live would let the owner accept a quote on the
 * customer's behalf with one mis-tap, and that acceptance is a contract with a
 * timestamp against it.
 */
export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `id, reference, status, intro_note, terms, valid_until, sent_at,
         subtotal_pence, tax_pence, total_pence, job_id,
         client:clients(full_name, company_name),
         job:jobs(title),
         items:quote_items(id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp, sort_order)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!quote || !settings) notFound();

  const items = [...(quote.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto max-w-3xl">
      {/* --- Owner-only chrome, never printed, never seen by a customer --- */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/app/quotes/${quote.id}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-accent"
        >
          <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
          Back to the quote
        </Link>

        <QuoteStatusBadge status={quote.status} />
      </div>

      <div className="no-print mb-6 flex items-start gap-3 rounded-lg border border-info/25 bg-info-soft p-4">
        <EyeIcon size={20} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
        <div>
          <p className="font-medium text-info-ink">
            This is what {quote.client?.full_name ?? "your customer"} will see
          </p>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">
            {quote.status === "draft"
              ? "Nothing has been sent yet. Read it back, then send it from the previous screen."
              : "The buttons below are switched off here — only the customer can answer their own quote."}
          </p>
        </div>
      </div>

      {/* --- From here down, identical to /quotes/view/[id] -------------- */}
      <div className="no-print mb-8 rounded-xl border border-accent-line bg-accent-soft p-6 opacity-70">
        <h2 className="font-display text-heading text-accent-ink">Happy with this?</h2>

        <p className="container-prose mt-2.5 leading-relaxed text-ink">
          {quote.valid_until
            ? `Let us know either way and we will get you booked in. This price is held until ${formatDate(quote.valid_until)}.`
            : "Let us know either way and we will get you booked in."}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {/* Disabled rather than omitted: the owner needs to see the weight
              these two give the page, since they are the whole point of it. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={buttonClasses({ size: "lg", fullWidth: true })}
          >
            <CheckIcon size={20} weight="bold" aria-hidden="true" />
            Accept this quote — {formatPence(quote.total_pence)}
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className={buttonClasses({ variant: "secondary", size: "lg", fullWidth: true })}
          >
            <XIcon size={18} weight="bold" aria-hidden="true" />
            No thank you
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Accepting is not a payment — nothing is taken now. It tells us to go ahead and
          book the work in.
        </p>
      </div>

      <article className="rounded-xl border border-line bg-surface-raised p-6 shadow-subtle sm:p-9 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <BusinessBlock snapshot={settings as unknown as Record<string, unknown>} />

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
          <p className="mt-6 whitespace-pre-wrap leading-relaxed text-ink">{quote.intro_note}</p>
        ) : null}

        <div className="mt-8">
          <DocumentLines items={items} vatRegistered={settings.vat_registered} />
        </div>

        <div className="mt-6 flex justify-end">
          <TotalsPanel
            className="w-full max-w-xs"
            subtotalPence={quote.subtotal_pence}
            vatPence={quote.tax_pence}
            cisDeductionPence={0}
            totalPence={quote.total_pence}
            vatRegistered={settings.vat_registered}
            cisEnabled={settings.cis_enabled}
            cisDeductionRateBp={settings.cis_deduction_rate_bp}
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
            <span className="font-medium tabular text-ink">{business.phone}</span>.
          </p>
        </footer>
      </article>

      <div className="no-print mt-6">
        <PrintButton label="Print or save as PDF" />
      </div>
    </div>
  );
}
