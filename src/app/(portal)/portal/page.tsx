import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, HouseIcon, WrenchIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { JobStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Your jobs", robots: { index: false } };

export default async function PortalHomePage() {
  const user = await getSessionUser();
  const supabase = await createClient();

  // No `.eq("client_id", ...)` anywhere in this file. Row Level Security
  // filters to this person's own jobs at the database, so a bug in this
  // component cannot leak someone else's work (spec AC-3).
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, reference, title, status, urgency, scheduled_start, created_at,
       property:properties(address_line1, city, postcode)`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const list = jobs ?? [];
  const active = list.filter(
    (job) => job.status !== "paid" && job.status !== "cancelled" && job.status !== "declined",
  );
  const past = list.filter(
    (job) => job.status === "paid" || job.status === "cancelled" || job.status === "declined",
  );

  return (
    <>
      <PageHeader
        title={user?.fullName ? `Hello, ${user.fullName.split(" ")[0]}` : "Your jobs"}
        description="Everything we are doing for you, and everything we have done."
        action={
          <Link href="/request" className={buttonClasses({ variant: "secondary" })}>
            Request another job
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<WrenchIcon size={28} weight="duotone" />}
          title="Nothing here yet"
          description="Once we have taken on a job for you it will appear here, with the price, the date we are coming and every photograph we take along the way."
          action={{ label: "Request a job", href: "/request" }}
          secondaryAction={{ label: "See what we do", href: "/services" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {active.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">In progress</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {active.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </section>
          ) : null}

          {past.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">Finished</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {past.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

type JobRowData = {
  id: string;
  reference: string;
  title: string;
  status: Parameters<typeof JobStatusBadge>[0]["status"];
  scheduled_start: string | null;
  created_at: string;
  property: { address_line1: string; city: string | null; postcode: string } | null;
};

function JobRow({ job }: { job: JobRowData }) {
  return (
    <li>
      <Link
        href={`/portal/jobs/${job.id}`}
        className={cn(
          "group flex items-start gap-4 rounded-lg border border-line bg-surface-raised p-5",
          "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
        >
          <HouseIcon size={20} weight="duotone" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{job.title}</span>
            <JobStatusBadge status={job.status} />
          </span>

          <span className="mt-1 block font-mono text-xs tabular-nums text-ink-subtle">
            {job.reference}
          </span>

          {job.property ? (
            <span className="mt-1.5 block text-sm text-ink-muted">
              {job.property.address_line1}
              {job.property.city ? `, ${job.property.city}` : ""} {job.property.postcode}
            </span>
          ) : null}

          <span className="mt-1.5 block text-sm text-ink-subtle">
            {job.scheduled_start
              ? `Booked for ${formatDateTime(job.scheduled_start)}`
              : `Requested ${formatRelative(job.created_at)}`}
          </span>
        </span>

        <ArrowRightIcon
          size={18}
          weight="bold"
          aria-hidden="true"
          className="mt-1 shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent"
        />
      </Link>
    </li>
  );
}
