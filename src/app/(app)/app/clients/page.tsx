import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatPence } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Customers", robots: { index: false } };

export default async function ClientsPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: jobs }, { data: invoices }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, company_name, email, phone, created_at")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase.from("jobs").select("id, client_id, status").is("deleted_at", null),
    supabase
      .from("invoices")
      .select("client_id, total_pence, paid_pence, status")
      .in("status", ["sent", "part_paid", "overdue"])
      .is("deleted_at", null),
  ]);

  // Counted in memory rather than with a per-row aggregate query. A single
  // plumber's customer list is in the hundreds, not the millions, and three
  // round trips beat N+1.
  const jobCounts = new Map<string, number>();
  const liveJobs = new Map<string, number>();

  for (const job of jobs ?? []) {
    jobCounts.set(job.client_id, (jobCounts.get(job.client_id) ?? 0) + 1);
    if (!["paid", "cancelled", "declined"].includes(job.status)) {
      liveJobs.set(job.client_id, (liveJobs.get(job.client_id) ?? 0) + 1);
    }
  }

  const owed = new Map<string, number>();
  for (const invoice of invoices ?? []) {
    owed.set(
      invoice.client_id,
      (owed.get(invoice.client_id) ?? 0) + (invoice.total_pence - invoice.paid_pence),
    );
  }

  const rows = clients ?? [];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you have worked for, and what is still open with them."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={28} weight="duotone" />}
          title="No customers yet"
          description="A customer record is created for you the first time you turn an enquiry into a job — there is nothing to type in twice."
          action={{ label: "Open enquiries", href: "/app/enquiries" }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((client) => {
            const outstanding = owed.get(client.id) ?? 0;
            const live = liveJobs.get(client.id) ?? 0;
            const total = jobCounts.get(client.id) ?? 0;

            return (
              <li key={client.id}>
                <Link
                  href={`/app/clients/${client.id}`}
                  className={cn(
                    "group flex items-start gap-4 rounded-lg border border-line bg-surface-raised p-5",
                    "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
                    "[transition-timing-function:var(--ease-standard)]",
                    "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{client.full_name}</span>

                    {client.company_name ? (
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {client.company_name}
                      </span>
                    ) : null}

                    <span className="mt-1 block text-sm text-ink-subtle">
                      {client.phone ? <span className="tabular">{client.phone}</span> : null}
                      {client.phone && client.email ? " · " : null}
                      {client.email}
                    </span>

                    <span className="mt-1.5 block text-xs text-ink-subtle">
                      {total === 0
                        ? "No jobs yet"
                        : live > 0
                          ? `${total} ${total === 1 ? "job" : "jobs"} · ${live} still open`
                          : `${total} ${total === 1 ? "job" : "jobs"}`}
                    </span>
                  </span>

                  {outstanding > 0 ? (
                    <span className="shrink-0 text-right">
                      <span className="block font-mono font-bold tabular-nums text-critical">
                        {formatPence(outstanding)}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-subtle">owed</span>
                    </span>
                  ) : null}

                  <ArrowRightIcon
                    size={18}
                    weight="bold"
                    aria-hidden="true"
                    className="mt-1 shrink-0 self-start text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
