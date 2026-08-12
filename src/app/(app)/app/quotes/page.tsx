import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, FileTextIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { QuoteStatus } from "@/types/database";

export const metadata: Metadata = { title: "Quotes", robots: { index: false } };

const groups: { statuses: QuoteStatus[]; heading: string; blurb: string }[] = [
  {
    statuses: ["sent"],
    heading: "Waiting on an answer",
    blurb: "Sent, and nobody has said yes or no yet.",
  },
  {
    statuses: ["draft"],
    heading: "Drafts",
    blurb: "Written but not sent. The customer cannot see these.",
  },
  {
    statuses: ["accepted"],
    heading: "Accepted",
    blurb: "Won. Raise the invoice when the work is done.",
  },
];

export default async function QuotesPage() {
  const supabase = await createClient();

  // Expires anything past its valid_until, so nothing here reads as live when
  // it has quietly lapsed. Run alongside the read, not before it — the render
  // below already treats a lapsed valid_until as expired via `isPast`, so the
  // screen is correct even on the load where this write has not landed.
  const [, { data: quotes }] = await Promise.all([
    supabase.rpc("mark_overdue_invoices"),
    supabase
      .from("quotes")
      .select(
        `id, reference, status, total_pence, valid_until, sent_at, created_at, job_id,
         client:clients(id, full_name),
         job:jobs(id, title)`,
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const all = quotes ?? [];
  const closed = all.filter((quote) => ["declined", "expired"].includes(quote.status));

  const openValue = all
    .filter((quote) => quote.status === "sent")
    .reduce((sum, quote) => sum + quote.total_pence, 0);

  return (
    <>
      {/* Back to Money, not Today. This screen is now reached from Money, and
          a Back link that lands somewhere other than where you came from is
          the kind of small wrongness that makes an app feel untrustworthy. */}
      <PageHeader
        title="Quotes"
        description="Everything you have priced, and where each one stands."
        back={{ href: "/app/invoices", label: "Money" }}
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={28} weight="duotone" />}
          title="No quotes yet"
          description="A quote is built from a job. Open a job and choose 'New quote' — the customer gets it by email and can accept or decline it without ringing you."
          action={{ label: "Open jobs", href: "/app/jobs" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {openValue > 0 ? (
            <div className="rounded-lg border border-accent-line bg-accent-soft p-5">
              <p className="text-label uppercase text-ink-subtle">Out with customers</p>
              <p className="mt-2 font-mono text-title font-bold tabular-nums text-ink">
                {formatPence(openValue)}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Work you have priced that nobody has answered.
              </p>
            </div>
          ) : null}

          {groups.map((group) => {
            const rows = all.filter((quote) => group.statuses.includes(quote.status));
            if (rows.length === 0) return null;

            return (
              <section key={group.heading}>
                <h2 className="font-display text-subheading text-ink">
                  {group.heading}
                  <span className="ml-2 font-sans text-sm font-normal text-ink-subtle">
                    {rows.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">{group.blurb}</p>

                <ul className="mt-4 flex flex-col gap-3">
                  {rows.map((quote) => (
                    <QuoteRow key={quote.id} quote={quote} />
                  ))}
                </ul>
              </section>
            );
          })}

          {closed.length > 0 ? (
            <section>
              <h2 className="font-display text-subheading text-ink">
                Declined and expired
                <span className="ml-2 font-sans text-sm font-normal text-ink-subtle">
                  {closed.length}
                </span>
              </h2>

              <ul className="mt-4 flex flex-col gap-3">
                {closed.slice(0, 20).map((quote) => (
                  <QuoteRow key={quote.id} quote={quote} muted />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

type QuoteRowData = {
  id: string;
  reference: string;
  status: QuoteStatus;
  total_pence: number;
  valid_until: string | null;
  sent_at: string | null;
  created_at: string;
  client: { id: string; full_name: string } | null;
  job: { id: string; title: string } | null;
};

function QuoteRow({ quote, muted = false }: { quote: QuoteRowData; muted?: boolean }) {
  const lapsing = quote.status === "sent" && isPast(quote.valid_until);

  return (
    <li>
      <Link
        href={`/app/quotes/${quote.id}`}
        className={cn(
          "group flex items-start gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          lapsing ? "border-caution/30 bg-caution-soft" : "border-line bg-surface-raised",
          muted && "opacity-70",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{quote.job?.title ?? "Job removed"}</span>
            <QuoteStatusBadge status={quote.status} />
          </span>

          {quote.client ? (
            <span className="mt-1 block text-sm text-ink-muted">{quote.client.full_name}</span>
          ) : null}

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-subtle">
            <span className="font-mono tabular-nums">{quote.reference}</span>
            <span>
              ·{" "}
              {quote.sent_at
                ? `sent ${formatRelative(quote.sent_at)}`
                : `drafted ${formatRelative(quote.created_at)}`}
            </span>
            {quote.status === "sent" && quote.valid_until ? (
              <span>· open until {formatDate(quote.valid_until)}</span>
            ) : null}
          </span>
        </span>

        <span className="shrink-0 font-mono text-subheading font-bold tabular-nums text-ink">
          {formatPence(quote.total_pence)}
        </span>

        <ArrowRightIcon
          size={18}
          weight="bold"
          aria-hidden="true"
          className="mt-1 shrink-0 self-start text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent"
        />
      </Link>
    </li>
  );
}
