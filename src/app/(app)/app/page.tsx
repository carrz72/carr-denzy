import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  ClockCounterClockwiseIcon,
  ClockIcon,
  FileTextIcon,
  GearSixIcon,
  ImagesIcon,
  MapPinIcon,
  UsersIcon,
  SunHorizonIcon,
  TrayIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import { JobStatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { formatPence } from "@/lib/money";
import {
  addDays,
  formatDuration,
  formatRelative,
  formatShortDate,
  formatTime,
  londonDateOf,
  todayInLondon,
} from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * The owner's home screen.
 *
 * Answers four questions in the order they matter at 7am: where am I going
 * today, who is waiting to hear from me, what have I quoted that nobody has
 * answered, and who owes me money.
 *
 * Deliberately not a chart. A business this size needs to know what to do next,
 * not a trend line.
 */
export default async function OwnerDashboard() {
  const user = await getSessionUser();
  const supabase = await createClient();

  // Cheap, idempotent housekeeping: flips invoices past their due date to
  // overdue and expires stale quotes. Running it on dashboard load means the
  // figures below are true without needing a scheduled job.
  await supabase.rpc("mark_overdue_invoices");

  const today = todayInLondon();
  const dayStart = `${today}T00:00:00`;
  const dayEnd = `${today}T23:59:59`;

  const [
    { data: todayJobs },
    { data: newEnquiries },
    { data: openQuotes },
    { data: unpaidInvoices },
    { data: activeJobs },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, reference, title, status, scheduled_start, duration_minutes,
         client:clients(full_name, phone),
         property:properties(address_line1, city, postcode)`,
      )
      .is("deleted_at", null)
      .gte("scheduled_start", dayStart)
      .lte("scheduled_start", dayEnd)
      .order("scheduled_start", { ascending: true }),

    supabase
      .from("enquiries")
      .select("id, reference, full_name, description, urgency, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("quotes")
      .select("id, reference, total_pence, sent_at, job_id, client:clients(full_name)")
      .eq("status", "sent")
      .is("deleted_at", null)
      .order("sent_at", { ascending: true })
      .limit(5),

    supabase
      .from("invoices")
      .select("id, reference, total_pence, paid_pence, status, due_date")
      .in("status", ["sent", "part_paid", "overdue"])
      .is("deleted_at", null),

    supabase
      .from("jobs")
      .select("id", { count: "exact", head: false })
      .is("deleted_at", null)
      .in("status", ["new", "quoted", "accepted", "scheduled", "in_progress", "completed"]),
  ]);

  /*
   * The three ways work goes missing when it lives in a book.
   *
   * Queried separately from the tiles above because these are not statistics —
   * they are a to-do list, and each one is a job that will be forgotten unless
   * somebody looks at the right page on the right day.
   */
  const [{ data: slipped }, { data: needsBooking }, { data: comingUp }] = await Promise.all([
    // Booked for a day that has been and gone, and never moved on. The single
    // most common way a paper diary loses a job.
    supabase
      .from("jobs")
      .select("id, title, scheduled_start, status, client:clients(full_name, phone)")
      .is("deleted_at", null)
      .in("status", ["scheduled", "in_progress"])
      .lt("scheduled_start", dayStart)
      .order("scheduled_start", { ascending: true })
      .limit(8),

    // Agreed and never given a date. Emergencies float to the top.
    supabase
      .from("jobs")
      .select("id, title, urgency, status, created_at, client:clients(full_name, phone)")
      .is("deleted_at", null)
      .is("scheduled_start", null)
      .in("status", ["accepted", "new"])
      .order("urgency", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(8),

    // The rest of the week, so tomorrow is never a surprise.
    supabase
      .from("jobs")
      .select("id, scheduled_start, duration_minutes")
      .is("deleted_at", null)
      .not("scheduled_start", "is", null)
      .gt("scheduled_start", dayEnd)
      .lte("scheduled_start", `${addDays(today, 7)}T23:59:59`)
      .not("status", "in", "(cancelled,declined)"),
  ]);

  const slippedJobs = slipped ?? [];
  const unbookedJobs = needsBooking ?? [];

  const tomorrow = addDays(today, 1);
  const tomorrowCount = (comingUp ?? []).filter(
    (job) => job.scheduled_start && londonDateOf(job.scheduled_start) === tomorrow,
  ).length;

  const restOfWeekCount = (comingUp ?? []).length;

  const outstandingPence = (unpaidInvoices ?? []).reduce(
    (total, invoice) => total + (invoice.total_pence - invoice.paid_pence),
    0,
  );

  const overdueCount = (unpaidInvoices ?? []).filter(
    (invoice) => invoice.status === "overdue",
  ).length;

  const firstName = user?.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Morning, ${firstName}` : "Today"}
        description="What needs you today, and what is owed."
        action={
          // Neither of these is on the navigation bar: both are occasional, and
          // a fifth and sixth thumb target would cost every other screen space.
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/clients"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <UsersIcon size={17} aria-hidden="true" />
              Customers
            </Link>

            <Link
              href="/app/portfolio"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <ImagesIcon size={17} aria-hidden="true" />
              Our work
            </Link>

            <Link href="/app/settings" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <GearSixIcon size={17} aria-hidden="true" />
              Settings
            </Link>
          </div>
        }
      />

      {/*
        Before anything else: work that is quietly going missing.
        Only rendered when there is something wrong, so it never becomes
        furniture the owner learns to scroll past.
      */}
      {slippedJobs.length > 0 || unbookedJobs.length > 0 ? (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {slippedJobs.length > 0 ? (
            <AttentionCard
              tone="critical"
              icon={<ClockCounterClockwiseIcon size={19} weight="fill" />}
              title={
                slippedJobs.length === 1
                  ? "1 job was booked and never finished"
                  : `${slippedJobs.length} jobs were booked and never finished`
              }
              blurb="The day came and went and nobody moved these on. Mark them finished, or give them a new date."
              items={slippedJobs.map((job) => ({
                id: job.id,
                title: job.title,
                detail: `${job.client?.full_name ?? "Customer"} · was ${formatShortDate(job.scheduled_start)}`,
              }))}
            />
          ) : null}

          {unbookedJobs.length > 0 ? (
            <AttentionCard
              tone="caution"
              icon={<CalendarPlusIcon size={19} weight="fill" />}
              title={
                unbookedJobs.length === 1
                  ? "1 job has no date"
                  : `${unbookedJobs.length} jobs have no date`
              }
              blurb="Taken on, but never written into a day. Give them one before the customer rings to ask."
              items={unbookedJobs.map((job) => ({
                id: job.id,
                title: job.title,
                detail:
                  (job.client?.full_name ?? "Customer") +
                  (job.urgency === "emergency" ? " · emergency" : ""),
                urgent: job.urgency === "emergency",
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {/* --- Four numbers, at a glance ---------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Booked today"
          value={String((todayJobs ?? []).length)}
          detail={
            tomorrowCount > 0
              ? `${tomorrowCount} tomorrow`
              : restOfWeekCount > 0
                ? `${restOfWeekCount} later this week`
                : undefined
          }
          detailTone="calm"
          href="/app/diary"
          icon={<CalendarCheckIcon size={19} weight="duotone" />}
        />
        <StatTile
          label="New enquiries"
          value={String((newEnquiries ?? []).length)}
          href="/app/enquiries"
          icon={<TrayIcon size={19} weight="duotone" />}
          emphasis={(newEnquiries ?? []).length > 0}
        />
        <StatTile
          label="Quotes waiting"
          value={String((openQuotes ?? []).length)}
          href="/app/quotes"
          icon={<FileTextIcon size={19} weight="duotone" />}
        />
        <StatTile
          label="Owed to you"
          value={formatPence(outstandingPence)}
          detail={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
          href="/app/invoices"
          icon={<ClockIcon size={19} weight="duotone" />}
          alarm={overdueCount > 0}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        {/* --- Today's round ------------------------------------------- */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-display text-heading text-ink">Today&apos;s round</h2>

            <div className="flex items-center gap-4">
              {(todayJobs ?? []).length > 0 ? (
                <Link
                  href={`/app/diary/${today}`}
                  className={buttonClasses({ variant: "link", size: "sm" })}
                >
                  Day sheet
                </Link>
              ) : null}

              <Link href="/app/diary" className={buttonClasses({ variant: "link", size: "sm" })}>
                The week
                <ArrowRightIcon size={15} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {(todayJobs ?? []).length === 0 ? (
            <EmptyState
              icon={<SunHorizonIcon size={28} weight="duotone" />}
              title="Nothing in the diary today"
              description={
                (activeJobs ?? []).length > 0
                  ? "You have live jobs that are not booked in yet. Pick one and give it a date."
                  : "No jobs booked. New enquiries land in your inbox as they come in."
              }
              action={{ label: "Open jobs", href: "/app/jobs" }}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {(todayJobs ?? []).map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/app/jobs/${job.id}`}
                    className={cn(
                      "group flex gap-4 rounded-lg border border-line bg-surface-raised p-5",
                      "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
                      "[transition-timing-function:var(--ease-standard)]",
                      "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
                    )}
                  >
                    <span className="flex w-16 shrink-0 flex-col items-center rounded-md bg-accent-soft py-2.5">
                      <span className="font-mono text-base font-semibold tabular-nums text-accent-ink">
                        {formatTime(job.scheduled_start)}
                      </span>
                      {job.duration_minutes ? (
                        <span className="mt-0.5 text-[0.6875rem] text-accent-ink/70">
                          {formatDuration(job.duration_minutes)}
                        </span>
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="font-medium text-ink">{job.title}</span>
                        <JobStatusBadge status={job.status} />
                      </span>

                      {job.client ? (
                        <span className="mt-1 block text-sm text-ink-muted">
                          {job.client.full_name}
                          {job.client.phone ? (
                            <span className="tabular"> · {job.client.phone}</span>
                          ) : null}
                        </span>
                      ) : null}

                      {job.property ? (
                        <span className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
                          <MapPinIcon size={14} weight="fill" aria-hidden="true" />
                          {job.property.address_line1}
                          {job.property.city ? `, ${job.property.city}` : ""}{" "}
                          {job.property.postcode}
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
              ))}
            </ul>
          )}
        </section>

        {/* --- Waiting on you ------------------------------------------ */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-subheading text-ink">New enquiries</h2>
              {(newEnquiries ?? []).length > 0 ? (
                <Link
                  href="/app/enquiries"
                  className={buttonClasses({ variant: "link", size: "sm" })}
                >
                  Open inbox
                </Link>
              ) : null}
            </div>

            {(newEnquiries ?? []).length === 0 ? (
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                Nothing new. Enquiries from the website land here, with photos.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(newEnquiries ?? []).map((enquiry) => (
                  <li key={enquiry.id}>
                    <Link
                      href={`/app/enquiries/${enquiry.id}`}
                      className={cn(
                        "block rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium text-ink">
                          {enquiry.full_name}
                        </span>
                        <UrgencyBadge urgency={enquiry.urgency} />
                      </span>

                      <span className="mt-1 line-clamp-2 block text-sm leading-snug text-ink-muted">
                        {enquiry.description}
                      </span>

                      <span className="mt-1.5 block text-xs text-ink-subtle">
                        {formatRelative(enquiry.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-subheading text-ink">Quotes with no answer</h2>
            </div>

            {(openQuotes ?? []).length === 0 ? (
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                Nothing outstanding. Quotes you send appear here until the customer
                accepts or declines.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(openQuotes ?? []).map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={`/app/jobs/${quote.job_id}`}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {quote.client?.full_name ?? "Customer"}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-subtle">
                          Sent {formatRelative(quote.sent_at)}
                        </span>
                      </span>

                      <span className="shrink-0 font-medium tabular text-ink">
                        {formatPence(quote.total_pence)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * A short list of jobs that need rescuing.
 *
 * Deliberately not a StatTile. A count tells the owner there is a problem; this
 * tells them which jobs, so the next action is one tap rather than a hunt.
 */
function AttentionCard({
  tone,
  icon,
  title,
  blurb,
  items,
}: {
  tone: "critical" | "caution";
  icon: React.ReactNode;
  title: string;
  blurb: string;
  items: { id: string; title: string; detail: string; urgent?: boolean }[];
}) {
  return (
    <Card
      className={cn(
        tone === "critical"
          ? "border-critical/30 bg-critical-soft"
          : "border-caution/30 bg-caution-soft",
      )}
    >
      <h2 className="flex items-start gap-2.5 font-display text-subheading text-ink">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 shrink-0", tone === "critical" ? "text-critical" : "text-caution")}
        >
          {icon}
        </span>
        {title}
      </h2>

      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">{blurb}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/app/jobs/${item.id}`}
              className={cn(
                "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{item.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-sm",
                    item.urgent ? "font-medium text-critical" : "text-ink-subtle",
                  )}
                >
                  {item.detail}
                </span>
              </span>

              <ArrowRightIcon
                size={16}
                weight="bold"
                aria-hidden="true"
                className="shrink-0 text-ink-subtle"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatTile({
  label,
  value,
  detail,
  detailTone = "alarm",
  href,
  icon,
  emphasis = false,
  alarm = false,
}: {
  label: string;
  value: string;
  detail?: string;
  /** `calm` for "3 tomorrow"; `alarm` for anything the owner should worry about. */
  detailTone?: "calm" | "alarm";
  href: string;
  icon: React.ReactNode;
  emphasis?: boolean;
  alarm?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col rounded-lg border p-5 shadow-subtle",
        "transition-[border-color,box-shadow,transform] duration-200",
        "[transition-timing-function:var(--ease-standard)]",
        "hover:-translate-y-0.5 hover:shadow-float",
        alarm
          ? "border-critical/30 bg-critical-soft"
          : emphasis
            ? "border-accent-line bg-accent-soft"
            : "border-line bg-surface-raised",
      )}
    >
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <span aria-hidden="true" className={alarm ? "text-critical" : "text-accent"}>
          {icon}
        </span>
        {label}
      </span>

      <span
        className={cn(
          "mt-2.5 font-display text-[1.75rem] font-bold leading-none tabular-nums",
          alarm ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </span>

      {detail ? (
        detailTone === "calm" ? (
          <span className="mt-1.5 text-sm text-ink-muted">{detail}</span>
        ) : (
          <span className="mt-1.5 flex items-center gap-1 text-sm font-medium text-critical">
            <WarningCircleIcon size={14} weight="fill" aria-hidden="true" />
            {detail}
          </span>
        )
      ) : null}
    </Link>
  );
}
