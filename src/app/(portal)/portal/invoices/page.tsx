import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatDate, isPast } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@/types/database";

export const metadata: Metadata = { title: "Your invoices", robots: { index: false } };

export default async function PortalInvoicesPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, reference, status, issue_date, due_date, total_pence, paid_pence,
       job:jobs(id, title)`,
    )
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  const list = invoices ?? [];
  const open = list.filter((invoice) =>
    ["sent", "part_paid", "overdue"].includes(invoice.status),
  );
  const settled = list.filter((invoice) => !["sent", "part_paid", "overdue"].includes(invoice.status));

  const owing = open.reduce(
    (sum, invoice) => sum + (invoice.total_pence - invoice.paid_pence),
    0,
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What we have billed you for, and what is still to pay."
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon size={28} weight="duotone" />}
          title="Nothing to pay"
          description="Invoices appear here once a job is finished. You will get an email when one is sent, and every invoice stays here for your records."
          action={{ label: "See your jobs", href: "/portal" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {owing > 0 ? (
            <div className="rounded-lg border border-accent-line bg-accent-soft p-5">
              <p className="text-label uppercase text-ink-subtle">Outstanding</p>
              <p className="mt-2 font-mono text-title font-bold tabular-nums text-ink">
                {formatPence(owing)}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Open an invoice for the bank details and reference.
              </p>
            </div>
          ) : null}

          {open.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">To pay</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {open.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </ul>
            </section>
          ) : null}

          {settled.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">Paid</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {settled.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
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
  job: { id: string; title: string } | null;
};

function InvoiceRow({ invoice }: { invoice: InvoiceRowData }) {
  const outstanding = invoice.total_pence - invoice.paid_pence;
  const late = invoice.status === "overdue" || (invoice.status === "sent" && isPast(invoice.due_date));

  return (
    <li>
      <Link
        href={`/portal/invoices/${invoice.id}`}
        className={cn(
          "group flex items-start gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          late ? "border-caution/30 bg-caution-soft" : "border-line bg-surface-raised",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{invoice.job?.title ?? "Your job"}</span>
            <InvoiceStatusBadge status={invoice.status} />
          </span>

          <span className="mt-1.5 block text-sm text-ink-subtle">
            <span className="font-mono tabular-nums">{invoice.reference}</span>
            {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : null}
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
