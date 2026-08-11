import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { JobStatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ClosuresPanel } from "@/components/owner/closures-panel";
import { createClient } from "@/lib/supabase/server";
import { closureDays } from "@/lib/closures";
import { requireStaff } from "@/lib/auth";
import {
  addDays,
  dayAndMonth,
  formatDuration,
  formatTime,
  isBeforeToday,
  londonDateOf,
  mondayOf,
  todayInLondon,
  weekDays,
  weekLabel,
  weekdayShort,
} from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { JobStatus, UrgencyLevel } from "@/types/database";

export const metadata: Metadata = { title: "Diary", robots: { index: false } };

type DiaryJob = {
  id: string;
  reference: string;
  title: string;
  status: JobStatus;
  urgency: UrgencyLevel;
  scheduled_start: string | null;
  duration_minutes: number | null;
  client: { full_name: string; phone: string | null } | null;
  property: { address_line1: string; city: string | null; postcode: string } | null;
};

/** Anything still live. A cancelled job should not occupy a slot in the week. */
const OFF_THE_BOARD: JobStatus[] = ["cancelled", "declined"];

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireStaff();
  const supabase = await createClient();

  const { week } = await searchParams;
  const monday = mondayOf(
    typeof week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayInLondon(),
  );

  const days = weekDays(monday);
  const today = todayInLondon();

  /*
   * Queried a day wider at each end, then bucketed in JS.
   *
   * `scheduled_start` is a timestamptz and the database runs in UTC, so a naive
   * `${monday}T00:00:00` bound is UTC midnight — which is 1am in British Summer
   * Time, and would quietly drop an 8am Monday job into the previous week. A
   * wider fetch plus `londonDateOf` bucketing is correct in either half of the
   * year.
   */
  const [{ data: booked }, { data: unscheduled }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, reference, title, status, urgency, scheduled_start, duration_minutes,
         client:clients(full_name, phone),
         property:properties(address_line1, city, postcode)`,
      )
      .is("deleted_at", null)
      .not("scheduled_start", "is", null)
      .gte("scheduled_start", `${addDays(monday, -1)}T00:00:00`)
      .lte("scheduled_start", `${addDays(monday, 7)}T23:59:59`)
      .order("scheduled_start", { ascending: true }),

    // The paper-book failure mode: work that has been agreed and then never
    // written into a day.
    supabase
      .from("jobs")
      .select(
        `id, reference, title, status, urgency, scheduled_start, duration_minutes,
         client:clients(full_name, phone),
         property:properties(address_line1, city, postcode)`,
      )
      .is("deleted_at", null)
      .is("scheduled_start", null)
      .in("status", ["new", "quoted", "accepted"])
      .order("urgency", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  // Time off overlapping this week, so closed days can be marked rather than
  // looking like ordinary free ones.
  const { data: closures } = await supabase
    .from("closures")
    .select("*")
    .lte("starts_on", days[6]!)
    .gte("ends_on", days[0]!)
    .order("starts_on", { ascending: true });

  const { data: allClosures } = await supabase
    .from("closures")
    .select("*")
    .gte("ends_on", addDays(today, -30))
    .order("starts_on", { ascending: true });

  const closedDays = new Set<string>();
  for (const closure of closures ?? []) {
    for (const day of closureDays(closure.starts_on, closure.ends_on)) closedDays.add(day);
  }

  const live = (booked ?? []).filter((job) => !OFF_THE_BOARD.includes(job.status));

  const byDay = new Map<string, DiaryJob[]>();
  for (const day of days) byDay.set(day, []);

  for (const job of live) {
    if (!job.scheduled_start) continue;
    const day = londonDateOf(job.scheduled_start);
    byDay.get(day)?.push(job);
  }

  const minutesOn = (day: string) =>
    (byDay.get(day) ?? []).reduce((total, job) => total + (job.duration_minutes ?? 0), 0);

  const weekMinutes = days.reduce((total, day) => total + minutesOn(day), 0);
  const weekJobs = days.reduce((total, day) => total + (byDay.get(day)?.length ?? 0), 0);

  const waiting = unscheduled ?? [];

  return (
    <>
      <PageHeader
        title="Diary"
        description="Everything booked in, day by day. The week you are looking at is named above the dates."
        action={
          <div className="no-print flex items-center gap-2">
            <Link
              href={`/app/diary?week=${addDays(monday, -7)}`}
              aria-label="Previous week"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
            </Link>

            {monday !== mondayOf(today) ? (
              <Link href="/app/diary" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                This week
              </Link>
            ) : null}

            <Link
              href={`/app/diary?week=${addDays(monday, 7)}`}
              aria-label="Next week"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-8">
        {/* --- The week at a glance ------------------------------------- */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-heading text-ink">{weekLabel(monday)}</h2>
            <p className="text-sm text-ink-muted">
              {weekJobs === 0
                ? "Nothing booked in"
                : `${weekJobs} ${weekJobs === 1 ? "job" : "jobs"} · ${formatDuration(weekMinutes)} of work`}
            </p>
          </div>

          {/*
            Seven cells, always. An empty Thursday is information — it is where
            the next job goes — so the grid never collapses to hide it.
          */}
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {days.map((day) => {
              const count = byDay.get(day)?.length ?? 0;
              const isToday = day === today;
              const past = isBeforeToday(day);
              const closed = closedDays.has(day);

              return (
                <li key={day}>
                  <a
                    href={`#day-${day}`}
                    className={cn(
                      "flex min-h-24 flex-col rounded-lg border p-3 transition-colors duration-200",
                      "[transition-timing-function:var(--ease-standard)] hover:border-line-strong",
                      isToday
                        ? "border-accent bg-accent-soft"
                        : closed
                          ? "border-caution/30 bg-caution-soft"
                          : count > 0
                            ? "border-line bg-surface-raised"
                            : "border-dashed border-line bg-surface-raised/50",
                      past && !isToday && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "text-label uppercase",
                        isToday ? "text-accent-ink" : "text-ink-subtle",
                      )}
                    >
                      {weekdayShort(day)}
                      {isToday ? " · today" : ""}
                    </span>

                    <span className="mt-0.5 text-sm text-ink-muted">{dayAndMonth(day)}</span>

                    <span className="mt-auto pt-2">
                      {closed && count === 0 ? (
                        <span className="text-sm font-medium text-caution-ink">Away</span>
                      ) : count === 0 ? (
                        <span className="text-sm text-ink-subtle">Free</span>
                      ) : (
                        <>
                          <span className="block font-display text-subheading text-ink">
                            {count} {count === 1 ? "job" : "jobs"}
                          </span>
                          <span className="block text-xs text-ink-subtle">
                            {formatDuration(minutesOn(day))}
                          </span>
                        </>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* --- Day by day ------------------------------------------------ */}
        <section className="flex flex-col gap-6">
          {days.map((day) => {
            const jobs = byDay.get(day) ?? [];
            const isToday = day === today;
            const past = isBeforeToday(day);

            // Past days with nothing in them are noise. Today and the future
            // always show, because an empty day ahead is a day to fill.
            if (jobs.length === 0 && past) return null;

            return (
              <div key={day} id={`day-${day}`} className="scroll-mt-24">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
                  <h3
                    className={cn(
                      "font-display text-subheading",
                      isToday ? "text-accent" : "text-ink",
                    )}
                  >
                    {weekdayShort(day)} {dayAndMonth(day)}
                  </h3>

                  {isToday ? (
                    <span className="text-label uppercase text-accent">Today</span>
                  ) : null}

                  {jobs.length > 0 ? (
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-sm text-ink-subtle">
                        {formatDuration(minutesOn(day))}
                      </span>
                      <Link
                        href={`/app/diary/${day}`}
                        className="no-print text-sm font-medium text-accent hover:underline hover:underline-offset-4"
                      >
                        Day sheet
                      </Link>
                    </span>
                  ) : null}
                </div>

                {jobs.length === 0 ? (
                  <p className="mt-3 text-[0.9375rem] text-ink-muted">
                    Nothing booked in.{" "}
                    {waiting.length > 0 ? (
                      <span>
                        You have {waiting.length} waiting to be given a date, below.
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {jobs.map((job) => (
                      <DiaryRow key={job.id} job={job} day={day} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        <ClosuresPanel closures={allClosures ?? []} />

        {/* --- Agreed, but never given a date ---------------------------- */}
        {waiting.length > 0 ? (
          <section className="no-print">
            <Card className="border-caution/30 bg-caution-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-subheading text-ink">
                    <WarningIcon size={19} weight="fill" className="text-caution" aria-hidden="true" />
                    Not in the diary yet
                  </h2>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                    {waiting.length} {waiting.length === 1 ? "job has" : "jobs have"} been taken
                    on but never given a day. This is the pile a paper book loses.
                  </p>
                </div>
              </div>

              <ul className="mt-5 flex flex-col gap-2">
                {waiting.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/app/jobs/${job.id}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-line bg-surface p-3.5",
                        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-medium text-ink">{job.title}</span>
                          {job.urgency === "emergency" ? (
                            <UrgencyBadge urgency={job.urgency} />
                          ) : null}
                          <JobStatusBadge status={job.status} />
                        </span>

                        {job.client ? (
                          <span className="mt-0.5 block text-sm text-ink-muted">
                            {job.client.full_name}
                          </span>
                        ) : null}
                      </span>

                      <span className="shrink-0 text-sm font-medium text-accent">
                        Give it a date
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        {weekJobs === 0 && waiting.length === 0 ? (
          <Card className="border-dashed">
            <div className="flex flex-col items-center py-8 text-center">
              <span
                aria-hidden="true"
                className="mb-4 flex size-14 items-center justify-center rounded-xl bg-accent-soft text-accent"
              >
                <CalendarBlankIcon size={28} weight="duotone" />
              </span>
              <h2 className="text-subheading text-ink">Nothing booked this week</h2>
              <p className="container-prose mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                When you book a job in from its page, it appears here. Enquiries that come
                through the website land in your inbox first.
              </p>
              <Link
                href="/app/jobs"
                className={cn(buttonClasses({ variant: "secondary" }), "mt-6")}
              >
                Open jobs
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function DiaryRow({ job, day }: { job: DiaryJob; day: string }) {
  const address = job.property
    ? [job.property.address_line1, job.property.city, job.property.postcode]
        .filter(Boolean)
        .join(", ")
    : null;

  // Booked, the day has passed, and nobody ever moved it on. The single most
  // useful thing this screen can point at.
  const slipped =
    isBeforeToday(day) && (job.status === "scheduled" || job.status === "in_progress");

  return (
    <li>
      <Link
        href={`/app/jobs/${job.id}`}
        className={cn(
          "group flex gap-4 rounded-lg border p-4 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          slipped ? "border-critical/30 bg-critical-soft" : "border-line bg-surface-raised",
        )}
      >
        <span
          className={cn(
            "flex w-16 shrink-0 flex-col items-center rounded-md py-2",
            slipped ? "bg-critical/10" : "bg-accent-soft",
          )}
        >
          <span
            className={cn(
              "font-mono text-base font-semibold tabular-nums",
              slipped ? "text-critical" : "text-accent-ink",
            )}
          >
            {formatTime(job.scheduled_start)}
          </span>
          {job.duration_minutes ? (
            <span className="mt-0.5 text-[0.6875rem] text-ink-subtle">
              {formatDuration(job.duration_minutes)}
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-medium text-ink">{job.title}</span>
            <JobStatusBadge status={job.status} />
            {job.urgency === "emergency" ? <UrgencyBadge urgency={job.urgency} /> : null}
          </span>

          {job.client ? (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
              <span>{job.client.full_name}</span>
              {job.client.phone ? (
                <span className="inline-flex items-center gap-1 tabular">
                  <PhoneIcon size={13} weight="fill" aria-hidden="true" />
                  {job.client.phone}
                </span>
              ) : null}
            </span>
          ) : null}

          {address ? (
            <span className="mt-1 flex items-start gap-1.5 text-sm text-ink-subtle">
              <MapPinIcon size={13} weight="fill" className="mt-1 shrink-0" aria-hidden="true" />
              {address}
            </span>
          ) : null}

          {slipped ? (
            <span className="mt-2 flex items-center gap-1.5 text-sm font-medium text-critical">
              <ClockIcon size={14} weight="fill" aria-hidden="true" />
              This day has passed and it was never marked finished
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
