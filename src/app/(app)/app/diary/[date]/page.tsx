import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPinIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { JobStatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import {
  addDays,
  dayAndMonth,
  formatDuration,
  formatTime,
  londonDateOf,
  todayInLondon,
  weekdayShort,
} from "@/lib/dates";
import { business } from "@/lib/site";

export const metadata: Metadata = { title: "Day sheet", robots: { index: false } };

/**
 * One day, printable.
 *
 * This is the bridge from the paper book: a running order that can be printed
 * on Sunday night, put on the dashboard of the van, and written on. Everything
 * needed on site is on it — time, address, phone number, how to get in, and
 * what the customer said was wrong — so the day works with no signal and no
 * phone at all.
 */
export default async function DaySheetPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  await requireStaff();
  const supabase = await createClient();

  // Queried a day either side and filtered in London time — a UTC-midnight
  // bound would drop an early job during British Summer Time.
  const { data } = await supabase
    .from("jobs")
    .select(
      `id, reference, title, description, status, urgency, scheduled_start,
       duration_minutes, private_notes,
       client:clients(full_name, phone, email),
       property:properties(address_line1, address_line2, city, postcode, access_notes),
       service:services(name)`,
    )
    .is("deleted_at", null)
    .not("scheduled_start", "is", null)
    .gte("scheduled_start", `${addDays(date, -1)}T00:00:00`)
    .lte("scheduled_start", `${addDays(date, 1)}T23:59:59`)
    .order("scheduled_start", { ascending: true });

  const jobs = (data ?? []).filter(
    (job) =>
      job.scheduled_start &&
      londonDateOf(job.scheduled_start) === date &&
      job.status !== "cancelled" &&
      job.status !== "declined",
  );

  const totalMinutes = jobs.reduce((sum, job) => sum + (job.duration_minutes ?? 0), 0);
  const isToday = date === todayInLondon();

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`${weekdayShort(date)} ${dayAndMonth(date)}`}
          description={
            jobs.length === 0
              ? "Nothing booked for this day."
              : `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} · ${formatDuration(totalMinutes)} of work`
          }
          back={{ href: `/app/diary?week=${date}`, label: "Back to the diary" }}
        />
      </div>

      {/* Only on paper: the app's own header does this job on screen. */}
      <div className="print-only mb-6 border-b border-line pb-4">
        <p className="font-display text-heading">
          {weekdayShort(date)} {dayAndMonth(date)}
        </p>
        <p className="mt-1 text-sm">
          {business.name} · {jobs.length} {jobs.length === 1 ? "job" : "jobs"} ·{" "}
          {formatDuration(totalMinutes)}
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card className="border-dashed">
          <p className="py-6 text-center text-ink-muted">
            Nothing booked in for this day.
          </p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-4">
          {jobs.map((job, index) => {
            const address = job.property
              ? [
                  job.property.address_line1,
                  job.property.address_line2,
                  job.property.city,
                  job.property.postcode,
                ]
                  .filter(Boolean)
                  .join(", ")
              : null;

            return (
              <li key={job.id}>
                <Card className="print-avoid-break">
                  <div className="flex flex-wrap items-start gap-4">
                    <span className="flex w-20 shrink-0 flex-col items-center rounded-md bg-accent-soft py-2.5">
                      <span className="font-mono text-lg font-bold tabular-nums text-accent-ink">
                        {formatTime(job.scheduled_start)}
                      </span>
                      {job.duration_minutes ? (
                        <span className="mt-0.5 text-xs text-ink-subtle">
                          {formatDuration(job.duration_minutes)}
                        </span>
                      ) : null}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-label uppercase text-ink-subtle">
                          Stop {index + 1}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-ink-subtle">
                          {job.reference}
                        </span>
                        <JobStatusBadge status={job.status} />
                        {job.urgency === "emergency" ? (
                          <UrgencyBadge urgency={job.urgency} />
                        ) : null}
                      </div>

                      <h2 className="mt-1.5 font-display text-subheading text-ink">
                        {job.title}
                      </h2>

                      {job.client ? (
                        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-medium text-ink">{job.client.full_name}</span>
                          {job.client.phone ? (
                            <a
                              href={`tel:${job.client.phone.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1.5 font-medium tabular text-accent"
                            >
                              <PhoneIcon size={15} weight="fill" aria-hidden="true" />
                              {job.client.phone}
                            </a>
                          ) : null}
                        </p>
                      ) : null}

                      {address ? (
                        <p className="mt-1.5">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-start gap-1.5 text-[0.9375rem] text-ink"
                          >
                            <MapPinIcon
                              size={15}
                              weight="fill"
                              className="mt-1 shrink-0 text-accent"
                              aria-hidden="true"
                            />
                            {address}
                          </a>
                        </p>
                      ) : null}

                      {job.property?.access_notes ? (
                        <p className="mt-3 rounded-md bg-surface-sunken px-3.5 py-2.5 text-[0.9375rem] text-ink">
                          <span className="font-medium">Getting in: </span>
                          {job.property.access_notes}
                        </p>
                      ) : null}

                      {job.description ? (
                        <p className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-muted">
                          {job.description}
                        </p>
                      ) : null}

                      {job.private_notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-muted">
                          <span className="font-medium">Your note: </span>
                          {job.private_notes}
                        </p>
                      ) : null}

                      <Link
                        href={`/app/jobs/${job.id}`}
                        className="no-print mt-3 inline-flex text-sm font-medium text-accent hover:underline hover:underline-offset-4"
                      >
                        Open the job
                      </Link>

                      {/* Ruled space, on paper only. People who have used a book
                          for years will still want to write on it. */}
                      <div className="print-only mt-4 border-t border-line pt-2">
                        <p className="text-xs">Notes</p>
                        <div className="mt-2 h-14 border-b border-line" />
                        <div className="h-7 border-b border-line" />
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {jobs.length > 0 ? (
        <div className="no-print mt-8 flex flex-wrap gap-3">
          <div className="w-full sm:w-auto sm:min-w-56">
            <PrintButton label={isToday ? "Print today's sheet" : "Print this day sheet"} />
          </div>
        </div>
      ) : null}
    </>
  );
}
