import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, FileTextIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { QuoteStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { QuoteStatus } from "@/types/database";

export const metadata: Metadata = { title: "Your quotes", robots: { index: false } };

export default async function PortalQuotesPage() {
  const supabase = await createClient();

  // No client filter here either: the "client reads own sent quotes" policy
  // scopes this to the caller and hides drafts, so an unfinished quote cannot
  // be seen before it is sent.
  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      `id, reference, status, total_pence, valid_until, sent_at, created_at,
       job:jobs(id, title)`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const list = quotes ?? [];
  const awaiting = list.filter((quote) => quote.status === "sent");
  const answered = list.filter((quote) => quote.status !== "sent");

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Prices we have sent you. Accepting one lets us book the work in."
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={28} weight="duotone" />}
          title="No quotes yet"
          description="When we have priced a job for you it will appear here, broken down line by line, and you can accept or decline it without having to ring us."
          action={{ label: "Request a job", href: "/request" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {awaiting.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">Waiting on you</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {awaiting.map((quote) => (
                  <QuoteRow key={quote.id} quote={quote} highlight />
                ))}
              </ul>
            </section>
          ) : null}

          {answered.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">Answered</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {answered.map((quote) => (
                  <QuoteRow key={quote.id} quote={quote} />
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
  job: { id: string; title: string } | null;
};

function QuoteRow({
  quote,
  highlight = false,
}: {
  quote: QuoteRowData;
  highlight?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/portal/quotes/${quote.id}`}
        className={cn(
          "group flex items-start gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          highlight ? "border-accent-line bg-accent-soft" : "border-line bg-surface-raised",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{quote.job?.title ?? "Your job"}</span>
            <QuoteStatusBadge status={quote.status} />
          </span>

          <span className="mt-1.5 block text-sm text-ink-subtle">
            <span className="font-mono tabular-nums">{quote.reference}</span>
            {quote.sent_at ? ` · sent ${formatRelative(quote.sent_at)}` : null}
          </span>

          {quote.status === "sent" && quote.valid_until ? (
            <span className="mt-1 block text-sm text-ink-muted">
              Open until {formatDate(quote.valid_until)}
            </span>
          ) : null}
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
