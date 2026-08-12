import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EyeIcon, ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card, DetailRow } from "@/components/ui/surface";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DocumentLines, TotalsPanel } from "@/components/money-document";
import { SendQuoteButton } from "@/components/owner/quote-actions";
import { ShareLink } from "@/components/owner/share-link";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { formatDate, formatDateTime, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";

export const metadata: Metadata = { title: "Quote", robots: { index: false } };

export default async function OwnerQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `id, reference, status, intro_note, terms, subtotal_pence, tax_pence, total_pence,
         valid_until, sent_at, responded_at, decline_reason, created_at, job_id,
         client:clients(id, full_name, email, phone, company_name),
         job:jobs(id, reference, title)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!quote || !settings) notFound();

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true });

  const expired = quote.status === "sent" && isPast(quote.valid_until);

  return (
    <>
      <PageHeader
        title={quote.reference}
        description={quote.job ? quote.job.title : undefined}
        back={
          quote.job
            ? { href: `/app/jobs/${quote.job.id}`, label: "Back to the job" }
            : { href: "/app/jobs", label: "All jobs" }
        }
        action={<QuoteStatusBadge status={quote.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">
              What the customer sees
            </h2>

            {quote.intro_note ? (
              <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink">
                {quote.intro_note}
              </p>
            ) : null}

            <div className="mt-6">
              <DocumentLines items={items ?? []} vatRegistered={settings.vat_registered} />
            </div>

            <TotalsPanel
              className="mt-6"
              subtotalPence={quote.subtotal_pence}
              vatPence={quote.tax_pence}
              cisDeductionPence={0}
              totalPence={quote.total_pence}
              vatRegistered={settings.vat_registered}
              cisEnabled={false}
              cisDeductionRateBp={settings.cis_deduction_rate_bp}
            />

            {quote.terms ? (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-label uppercase text-ink-subtle">Terms</h3>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {quote.terms}
                </p>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {quote.status === "draft" ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Ready to go?</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                Read it back as the customer will. Nothing has left your account yet.
              </p>

              {/* Preview first, send second — deliberately in that order. This
                  is the last point at which a wrong price is still private. */}
              <Link
                href={`/app/quotes/${quote.id}/preview`}
                className={buttonClasses({
                  variant: "secondary",
                  fullWidth: true,
                  className: "mt-5",
                })}
              >
                <EyeIcon size={18} aria-hidden="true" />
                See it as the customer will
              </Link>

              <div className="mt-2.5">
                <SendQuoteButton
                  quoteId={quote.id}
                  clientEmail={quote.client?.email ?? null}
                  totalLabel={formatPence(quote.total_pence)}
                />
              </div>
            </Card>
          ) : null}

          {/*
            Sent, but no answer yet. This is where a phone-only customer is
            handled: they have no email, so nothing was sent — the owner texts
            them this link and they can accept it from their phone.
          */}
          {quote.status === "sent" ? (
            <Card>
              <ShareLink
                path={`/quotes/view/${quote.id}`}
                label="Send it to the customer"
                shareTitle={`Quote ${quote.reference}`}
                hint={
                  quote.client?.email
                    ? "Already emailed to them. Use this if they would rather have it by text, or if they cannot find the email."
                    : "This customer has no email address on file, so nothing was sent automatically. Text them this link — they can accept it without signing in."
                }
              />
            </Card>
          ) : null}

          {quote.status === "accepted" ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Accepted</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {quote.responded_at
                  ? `The customer accepted this on ${formatDateTime(quote.responded_at)}.`
                  : "The customer has accepted this quote."}{" "}
                Raising an invoice will carry these lines across so you do not retype them.
              </p>

              <Link
                href={`/app/jobs/${quote.job_id}/invoice?from=${quote.id}`}
                className={buttonClasses({ fullWidth: true, className: "mt-5" })}
              >
                <ReceiptIcon size={19} aria-hidden="true" />
                Invoice this quote
              </Link>
            </Card>
          ) : null}

          {quote.status === "declined" ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Declined</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {quote.decline_reason
                  ? `They said: "${quote.decline_reason}"`
                  : "They declined without leaving a reason."}
              </p>
              <Link
                href={`/app/jobs/${quote.job_id}/quote`}
                className={buttonClasses({ variant: "secondary", fullWidth: true, className: "mt-5" })}
              >
                Quote it again
              </Link>
            </Card>
          ) : null}

          {expired ? (
            <Card>
              <h2 className="text-label uppercase text-ink-subtle">Past its date</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                This was open until {formatDate(quote.valid_until)} and has not been answered.
                Worth a phone call before you write it off.
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Details</h2>

            <dl className="mt-3 divide-y divide-line border-t border-line">
              <DetailRow label="Reference">
                <span className="font-mono tabular-nums">{quote.reference}</span>
              </DetailRow>
              <DetailRow label="Raised">{formatDateTime(quote.created_at)}</DetailRow>
              {quote.sent_at ? (
                <DetailRow label="Sent">{formatDateTime(quote.sent_at)}</DetailRow>
              ) : null}
              <DetailRow label="Open until">{formatDate(quote.valid_until)}</DetailRow>
              {quote.client ? (
                <DetailRow label="Customer">
                  <Link
                    href={`/app/clients/${quote.client.id}`}
                    className="text-accent hover:underline hover:underline-offset-4"
                  >
                    {quote.client.full_name}
                  </Link>
                </DetailRow>
              ) : null}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
