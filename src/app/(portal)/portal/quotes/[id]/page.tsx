import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DocumentLines, TotalsPanel } from "@/components/money-document";
import { QuoteResponse } from "@/components/portal/quote-response";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { business } from "@/lib/site";

export const metadata: Metadata = { title: "Your quote", robots: { index: false } };

export default async function PortalQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  // RLS decides whether this quote belongs to the caller and hides drafts. A
  // quote id belonging to someone else simply returns nothing, which is a 404
  // here — the same answer a made-up id gets, so guessing reveals nothing.
  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `id, reference, status, intro_note, terms, subtotal_pence, tax_pence, total_pence,
         valid_until, sent_at, responded_at, decline_reason,
         job:jobs(id, title)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("trading_name, phone, vat_registered, cis_deduction_rate_bp").maybeSingle(),
  ]);

  if (!quote) notFound();

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true });

  const open = quote.status === "sent" && !isPast(quote.valid_until);
  const phone = settings?.phone ?? business.phone;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={quote.job?.title ?? "Your quote"}
          description={`Quote ${quote.reference}`}
          back={{ href: "/portal/quotes", label: "All your quotes" }}
          action={<QuoteStatusBadge status={quote.status} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <Card className="min-w-0 print-avoid-break">
          {quote.intro_note ? (
            <p className="whitespace-pre-wrap leading-relaxed text-ink">{quote.intro_note}</p>
          ) : null}

          <div className="mt-6">
            <DocumentLines
              items={items ?? []}
              vatRegistered={settings?.vat_registered ?? false}
            />
          </div>

          <TotalsPanel
            className="mt-6"
            subtotalPence={quote.subtotal_pence}
            vatPence={quote.tax_pence}
            cisDeductionPence={0}
            totalPence={quote.total_pence}
            vatRegistered={settings?.vat_registered ?? false}
            cisEnabled={false}
            cisDeductionRateBp={settings?.cis_deduction_rate_bp ?? 0}
          />

          {quote.terms ? (
            <div className="mt-6 border-t border-line pt-5">
              <h2 className="text-label uppercase text-ink-subtle">Terms</h2>
              <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {quote.terms}
              </p>
            </div>
          ) : null}
        </Card>

        <div className="no-print flex min-w-0 flex-col gap-6">
          {open ? (
            <QuoteResponse quoteId={quote.id} totalLabel={formatPence(quote.total_pence)} />
          ) : null}

          {quote.status === "accepted" ? (
            <Card className="border-positive/25 bg-positive-soft">
              <h2 className="flex items-center gap-2 text-label uppercase text-positive-ink">
                <CheckCircleIcon size={17} weight="fill" aria-hidden="true" />
                Accepted
              </h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {quote.responded_at
                  ? `You accepted this on ${formatDateTime(quote.responded_at)}.`
                  : "You have accepted this quote."}{" "}
                We will be in touch to agree a date, and you will see it on the job.
              </p>

              {quote.job ? (
                <Link
                  href={`/portal/jobs/${quote.job.id}`}
                  className={buttonClasses({
                    variant: "secondary",
                    fullWidth: true,
                    className: "mt-5",
                  })}
                >
                  See the job
                </Link>
              ) : null}
            </Card>
          ) : null}

          {quote.status === "declined" ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">You declined this</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {quote.decline_reason
                  ? "Thank you for telling us why — it helps."
                  : "No problem at all."}{" "}
                If anything changes, give us a ring on {phone} and we will pick it back up.
              </p>
            </Card>
          ) : null}

          {quote.status === "expired" ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">This one has run out</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                It was open until {formatDate(quote.valid_until)}. Prices move, so we would
                rather re-quote than hold you to an old figure — ring us on {phone} and we
                will send a fresh one.
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Keep a copy</h2>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              {quote.sent_at ? `Sent ${formatDate(quote.sent_at)}. ` : null}
              This page prints as a clean one-page document.
            </p>

            <div className="mt-5">
              <PrintButton />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
