import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  MapPinIcon,
  PhoneIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { JobStatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRelative, isToday } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { JobStatus } from "@/types/database";

export const metadata: Metadata = { title: "Jobs", robots: { index: false } };

/** The order the owner thinks about work in, not alphabetical. */
const boardOrder: { status: JobStatus[]; heading: string; blurb: string }[] = [
  {
    status: ["new"],
    heading: "To quote",
    blurb: "Taken on but no price sent yet.",
  },
  {
    status: ["quoted"],
    heading: "Waiting on the customer",
    blurb: "Quote sent, no answer yet.",
  },
  {
    status: ["accepted"],
    heading: "To book in",
    blurb: "They said yes. Give it a date.",
  },
  {
    status: ["scheduled", "in_progress"],
    heading: "Booked and under way",
    blurb: "In the diary or on site.",
  },
  {
    status: ["completed"],
    heading: "To invoice",
    blurb: "Work finished, money not asked for.",
  },
  {
    status: ["invoiced"],
    heading: "Waiting on payment",
    blurb: "Invoice sent, not settled.",
  },
];

export default async function JobsPage() {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, reference, title, status, urgency, scheduled_start, created_at,
       client:clients(full_name, phone),
       property:properties(address_line1, city, postcode)`,
    )
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const all = jobs ?? [];
  const live = all.filter(
    (job) => !["paid", "cancelled", "declined"].includes(job.status),
  );
  const done = all.filter((job) => ["paid", "cancelled", "declined"].includes(job.status));

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Grouped by what each one needs from you next."
        action={
          <Link href="/app/jobs/new" className={buttonClasses({ size: "sm" })}>
            <PhoneIcon size={17} weight="fill" aria-hidden="true" />
            Job from a call
          </Link>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon size={28} weight="duotone" />}
          title="No jobs yet"
          description="Most work arrives by phone — take it down here and it goes straight in the diary. Jobs from the website form land in your enquiry inbox first."
          action={{ label: "Job from a call", href: "/app/jobs/new" }}
          secondaryAction={{ label: "Open enquiries", href: "/app/enquiries" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {boardOrder.map((group) => {
            const groupJobs = live.filter((job) => group.status.includes(job.status));
            if (groupJobs.length === 0) return null;

            return (
              <section key={group.heading}>
                <h2 className="font-display text-subheading text-ink">
                  {group.heading}
                  <span className="ml-2 font-sans text-sm font-normal text-ink-subtle">
                    {groupJobs.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">{group.blurb}</p>

                <ul className="mt-4 flex flex-col gap-3">
                  {groupJobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </ul>
              </section>
            );
          })}

          {done.length > 0 ? (
            <section>
              <h2 className="font-display text-subheading text-ink">
                Finished
                <span className="ml-2 font-sans text-sm font-normal text-ink-subtle">
                  {done.length}
                </span>
              </h2>

              <ul className="mt-4 flex flex-col gap-3">
                {done.slice(0, 20).map((job) => (
                  <JobRow key={job.id} job={job} muted />
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
  status: JobStatus;
  urgency: "emergency" | "soon" | "flexible";
  scheduled_start: string | null;
  created_at: string;
  client: { full_name: string; phone: string | null } | null;
  property: { address_line1: string; city: string | null; postcode: string } | null;
};

function JobRow({ job, muted = false }: { job: JobRowData; muted?: boolean }) {
  const today = isToday(job.scheduled_start);

  return (
    <li>
      <Link
        href={`/app/jobs/${job.id}`}
        className={cn(
          "group flex gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          today ? "border-accent-line bg-accent-soft" : "border-line bg-surface-raised",
          muted && "opacity-70",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{job.title}</span>
            <JobStatusBadge status={job.status} />
            {job.urgency === "emergency" ? <UrgencyBadge urgency={job.urgency} /> : null}
            {today ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                Today
              </span>
            ) : null}
          </span>

          {job.client ? (
            <span className="mt-1 block text-sm text-ink-muted">
              {job.client.full_name}
              {job.client.phone ? <span className="tabular"> · {job.client.phone}</span> : null}
            </span>
          ) : null}

          {job.property ? (
            <span className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
              <MapPinIcon size={14} weight="fill" aria-hidden="true" />
              {job.property.address_line1}
              {job.property.city ? `, ${job.property.city}` : ""} {job.property.postcode}
            </span>
          ) : null}

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-subtle">
            <span className="font-mono tabular-nums">{job.reference}</span>
            <span>
              ·{" "}
              {job.scheduled_start
                ? formatDateTime(job.scheduled_start)
                : `created ${formatRelative(job.created_at)}`}
            </span>
          </span>
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
