import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, PlusIcon, ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@/types/database";

export const metadata: Metadata = { title: "Money", robots: { index: false } };

/**
 * The money screen.
 *
 * Sorted by what needs chasing, not by date. An owner opens this to answer one
 * question — "who owes me?" — and the answer is at the top before any
 * scrolling.
 */
const groups: { statuses: InvoiceStatus[]; heading: string; blurb: string }[] = [
  {
    statuses: ["overdue"],
    heading: "Overdue",
    blurb: "Past the date you gave them. Worth a ring.",
  },
  {
    statuses: ["sent", "part_paid"],
    heading: "Waiting on payment",
    blurb: "Sent and still open.",
  },
  {
    statuses: ["draft"],
    heading: "Drafts",
    blurb: "Written but not sent. Nobody has seen these.",
  },
];

export default async function InvoicesPage() {
  const supabase = await createClient();

  // Cheap and idempotent: flips anything past its due date to overdue before
  // the page reads it, so the figures below are never a day stale.
  await supabase.rpc("mark_overdue_invoices");

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, reference, status, issue_date, due_date, total_pence, paid_pence, job_id,
       client:clients(id, full_name)`,
    )
    .is("deleted_at", null)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });

  const all = invoices ?? [];

  const owed = all
    .filter((invoice) => ["sent", "part_paid", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + (invoice.total_pence - invoice.paid_pence), 0);

  const overdue = all
    .filter((invoice) => invoice.status === "overdue")
    .reduce((sum, invoice) => sum + (invoice.total_pence - invoice.paid_pence), 0);

  const settled = all.filter((invoice) => ["paid", "void"].includes(invoice.status));

  return (
    <>
      <PageHeader
        title="Money"
        description="What is owed, what is late, what is done."
        action={
          <Link
            href="/app/invoices/new"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <PlusIcon size={17} weight="bold" aria-hidden="true" />
            Invoice, no job
          </Link>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon size={28} weight="duotone" />}
          title="No invoices yet"
          description="Invoices are usually raised from a job once the work is finished — if the customer accepted a quote, its lines come across for you. For work that never went through the app, raise one on its own."
          action={{ label: "Open jobs", href: "/app/jobs" }}
          secondaryAction={{ label: "Invoice with no job", href: "/app/invoices/new" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryTile
              label="Owed to you"
              valuePence={owed}
              tone={owed > 0 ? "accent" : "neutral"}
            />
            <SummaryTile
              label="Of that, overdue"
              valuePence={overdue}
              tone={overdue > 0 ? "critical" : "neutral"}
            />
          </div>

          {groups.map((group) => {
            const rows = all.filter((invoice) => group.statuses.includes(invoice.status));
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
                  {rows.map((invoice) => (
                    <InvoiceRow key={invoice.id} invoice={invoice} />
                  ))}
                </ul>
              </section>
            );
          })}

          {settled.length > 0 ? (
            <section>
              <h2 className="font-display text-subheading text-ink">
                Settled
                <span className="ml-2 font-sans text-sm font-normal text-ink-subtle">
                  {settled.length}
                </span>
              </h2>

              <ul className="mt-4 flex flex-col gap-3">
                {settled.slice(0, 20).map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} muted />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function SummaryTile({
  label,
  valuePence,
  tone,
}: {
  label: string;
  valuePence: number;
  tone: "neutral" | "accent" | "critical";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-5",
        tone === "critical" && "border-critical/25 bg-critical-soft",
        tone === "accent" && "border-accent-line bg-accent-soft",
        tone === "neutral" && "border-line bg-surface-raised",
      )}
    >
      <p className="text-label uppercase text-ink-subtle">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-title font-bold tabular-nums",
          tone === "critical" ? "text-critical" : "text-ink",
        )}
      >
        {formatPence(valuePence)}
      </p>
    </div>
  );
}

type InvoiceRowData = {
  id: string;
  reference: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  total_pence: number;
  paid_pence: number;
  client: { id: string; full_name: string } | null;
};

function InvoiceRow({ invoice, muted = false }: { invoice: InvoiceRowData; muted?: boolean }) {
  const outstanding = invoice.total_pence - invoice.paid_pence;
  const late = invoice.status === "overdue" || (invoice.status === "sent" && isPast(invoice.due_date));

  return (
    <li>
      <Link
        href={`/app/invoices/${invoice.id}`}
        className={cn(
          "group flex items-start gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          late ? "border-critical/25 bg-critical-soft" : "border-line bg-surface-raised",
          muted && "opacity-70",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">
              {invoice.client?.full_name ?? "Customer removed"}
            </span>
            <InvoiceStatusBadge status={invoice.status} />
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-subtle">
            <span className="font-mono tabular-nums">{invoice.reference}</span>
            <span>
              ·{" "}
              {invoice.due_date
                ? `due ${formatDate(invoice.due_date)}`
                : `issued ${formatRelative(invoice.issue_date)}`}
            </span>
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-mono text-subheading font-bold tabular-nums text-ink">
            {formatPence(invoice.total_pence)}
          </span>

          {invoice.paid_pence > 0 && outstanding > 0 ? (
            <span className="mt-0.5 block text-xs text-ink-subtle">
              {formatPence(outstanding)} left
            </span>
          ) : null}
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
