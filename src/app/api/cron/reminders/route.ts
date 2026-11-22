import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvoiceReminder, sendQuoteExpiryReminder, sendVisitReminder } from "@/lib/email";
import { addDays, formatDate, formatDayHeading, formatTime, londonDayBoundsIso, todayInLondon } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import type { ChaseControl } from "@/types/database";

/**
 * The chasing that nobody wants to do.
 *
 * Once a day, every day (the owner works seven):
 *
 *   1. Remind customers about invoices that have gone past their due date.
 *   2. Warn customers whose quote is about to lapse.
 *   3. Remind customers the day before a visit.
 *   4. Put nudges on the owner's own to-do list: a finished job with no invoice,
 *      a quote that ran out with no answer, a promised payment that did not
 *      come. The every-minute check (/api/cron/due-reminders) buzzes the owner's phone.
 *
 * the owner has the last word on every customer email: each kind can be switched
 * off in Settings, for one customer, or for one invoice, quote or job, and an
 * invoice can be paused until the day the customer said they would pay.
 *
 * Why this is a scheduled route and not part of a page: the app already had a
 * housekeeping function that flips invoices to `overdue`, but it only ran when
 * somebody loaded the dashboard. Money owed should not be chased on whether
 * somebody opened an app.
 *
 * Safety properties, in order of how badly each would hurt to get wrong:
 *
 *   * **It cannot email the same person about the same invoice inside the
 *     gap set in Settings** (a week by default). Every send stamps
 *     `last_reminder_at`; a visit reminder stamps `reminder_sent_at`.
 *   * **It is authenticated.** The URL is public, so without a shared secret
 *     anybody could hammer it and turn the reminder system into a way of
 *     spamming this business's own customers.
 *   * **One failure does not stop the run.** Each send is independent.
 *   * **It never invents work.** It only reads rows that already exist and
 *     sends about them; there is nothing here that can change a balance.
 */

/** Used if the settings row cannot be read: the gap between invoice reminders. */
const DEFAULT_COOLDOWN_DAYS = 7;

/** A finished job counts as "not invoiced" after this many days. */
const UNBILLED_AFTER_DAYS = 2;

/** How far ahead of expiry a quote gets its nudge. */
const QUOTE_WARNING_DAYS = 3;

/** Cap per run: a mail provider throttles, and a huge burst looks like spam. */
const MAX_PER_RUN = 25;

type Admin = ReturnType<typeof createAdminClient>;
type ControlLookup = (entity: string, id: string) => ChaseControl | undefined;

interface RunResult {
  invoicesChased: number;
  quotesChased: number;
  visitsReminded: number;
  nudgesAdded: number;
  nudgesClosed: number;
  skipped: number;
  orphanPhotosRemoved: number;
  failed: number;
  errors: string[];
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header; a person with the URL does not.
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = todayInLondon();

  const { data: settings } = await admin
    .from("settings")
    .select(
      "remind_invoices, invoice_reminder_every_days, remind_quotes, remind_visits, nudge_unbilled, nudge_quotes, nudge_promises",
    )
    .maybeSingle();

  const flags = {
    invoices: settings?.remind_invoices ?? true,
    quotes: settings?.remind_quotes ?? true,
    visits: settings?.remind_visits ?? true,
    unbilled: settings?.nudge_unbilled ?? true,
    lapsed: settings?.nudge_quotes ?? true,
    promises: settings?.nudge_promises ?? true,
  };

  const cooldownDays = settings?.invoice_reminder_every_days ?? DEFAULT_COOLDOWN_DAYS;
  const cooldownStart = new Date(now.getTime() - cooldownDays * 86_400_000).toISOString();
  // Quotes keep the week: one nudge before they lapse is all they get anyway.
  const quoteCooldownStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  // the owner's controls, all of them: a handful of rows at most.
  const { data: controlRows } = await admin.from("chase_controls").select("*");
  const allControls = controlRows ?? [];
  const controls = new Map<string, ChaseControl>(allControls.map((row) => [`${row.entity}:${row.entity_id}`, row]));
  const control: ControlLookup = (entity, id) => controls.get(`${entity}:${id}`);

  const result: RunResult = {
    invoicesChased: 0,
    quotesChased: 0,
    visitsReminded: 0,
    nudgesAdded: 0,
    nudgesClosed: 0,
    skipped: 0,
    orphanPhotosRemoved: 0,
    failed: 0,
    errors: [],
  };

  // The date sweep used to run only when the owner opened a list. Run it here
  // first, every scheduled day, before deciding who to chase.
  const { error: sweepError } = await admin.rpc("mark_overdue_invoices");
  if (sweepError) {
    console.error("[cron] overdue sweep failed", sweepError.message);
    result.errors.push(`sweep: ${sweepError.message}`);
  }

  // A query that fails returns `data: null`, which loops zero times and looks
  // exactly like "nothing needed chasing". Every query is checked, and a
  // failure is reported in the response the schedule sees.

  // --- Overdue invoices ----------------------------------------------------
  if (flags.invoices) {
    const { data: invoices, error: invoiceError } = await admin
      .from("invoices")
      .select(
        "id, reference, due_date, total_pence, paid_pence, last_reminder_at, client:clients(full_name, email, auto_reminders)",
      )
      // Part-paid counts: the balance is just as late as an unpaid invoice.
      .in("status", ["sent", "part_paid", "overdue"])
      .is("deleted_at", null)
      .lt("due_date", today)
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${cooldownStart}`)
      .order("due_date", { ascending: true })
      .limit(MAX_PER_RUN);

    if (invoiceError) {
      console.error("[cron] could not read invoices", invoiceError.message);
      result.errors.push(`invoices: ${invoiceError.message}`);
    }

    for (const invoice of invoices ?? []) {
      const outstanding = invoice.total_pence - invoice.paid_pence;

      // A row can be `sent` with nothing left owing if a payment landed between
      // the trigger and this query. Chasing that would be embarrassing.
      if (outstanding <= 0) continue;
      if (!invoice.client?.email || !invoice.due_date) continue;

      // the owner's say: off for this customer, stopped on this invoice, or paused
      // until the day they said they would pay (that day included).
      const say = control("invoice", invoice.id);
      if (invoice.client.auto_reminders === false || say?.stopped || (say?.paused_until && say.paused_until >= today)) {
        result.skipped += 1;
        continue;
      }

      const sent = await sendInvoiceReminder(
        invoice.client.email,
        invoice.client.full_name,
        invoice.reference,
        outstanding,
        daysBetween(new Date(`${invoice.due_date}T12:00:00Z`), new Date(`${today}T12:00:00Z`)),
        invoice.id,
        invoice.due_date,
      );

      if (!sent.sent) {
        // Deliberately NOT stamped. An email that did not send has not chased
        // anybody, and pretending otherwise means this invoice is never chased.
        console.error("[cron] invoice reminder failed", invoice.reference, sent.error);
        result.failed += 1;
        continue;
      }

      await admin.from("invoices").update({ last_reminder_at: now.toISOString() }).eq("id", invoice.id);
      result.invoicesChased += 1;
    }
  }

  // --- Quotes about to lapse -----------------------------------------------
  if (flags.quotes) {
    const warnBy = addDays(today, QUOTE_WARNING_DAYS);

    const { data: quotes, error: quoteError } = await admin
      .from("quotes")
      .select(
        "id, reference, valid_until, total_pence, last_reminder_at, client:clients(full_name, email, auto_reminders)",
      )
      .eq("status", "sent")
      .is("deleted_at", null)
      .not("valid_until", "is", null)
      .lte("valid_until", warnBy)
      .gte("valid_until", today)
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${quoteCooldownStart}`)
      .order("valid_until", { ascending: true })
      .limit(MAX_PER_RUN);

    if (quoteError) {
      console.error("[cron] could not read quotes", quoteError.message);
      result.errors.push(`quotes: ${quoteError.message}`);
    }

    for (const quote of quotes ?? []) {
      if (!quote.client?.email || !quote.valid_until) continue;
      if (quote.client.auto_reminders === false || control("quote", quote.id)?.stopped) {
        result.skipped += 1;
        continue;
      }

      const sent = await sendQuoteExpiryReminder(
        quote.client.email,
        quote.client.full_name,
        quote.reference,
        quote.total_pence,
        daysBetween(new Date(`${today}T12:00:00Z`), new Date(`${quote.valid_until}T12:00:00Z`)),
        quote.id,
      );

      if (!sent.sent) {
        console.error("[cron] quote reminder failed", quote.reference, sent.error);
        result.failed += 1;
        continue;
      }

      await admin.from("quotes").update({ last_reminder_at: now.toISOString() }).eq("id", quote.id);
      result.quotesChased += 1;
    }
  }

  // --- Visits tomorrow -----------------------------------------------------
  if (flags.visits) {
    try {
      await remindTomorrowsVisits(admin, now, today, control, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[cron] visit reminders failed", message);
      result.errors.push(`visits: ${message}`);
    }
  }

  // --- Nudges for the owner ---------------------------------------------------
  try {
    await addOwnerNudges(admin, now, today, flags, control, allControls, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] nudges failed", message);
    result.errors.push(`nudges: ${message}`);
  }

  // --- Orphan enquiry photos ------------------------------------------------
  try {
    result.orphanPhotosRemoved = await removeOrphanEnquiryPhotos(admin, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] orphan photo cleanup failed", message);
    result.errors.push(`orphan photos: ${message}`);
  }

  console.info("[cron] reminders", result);

  // A non-200 when a query failed, so a failing schedule shows up as failing in
  // Vercel's cron log instead of as a long run of quiet successes.
  return NextResponse.json(
    { ok: result.errors.length === 0, ...result },
    { status: result.errors.length === 0 ? 200 : 500 },
  );
}

type VisitJob = {
  id: string;
  title: string;
  status: string;
  deleted_at: string | null;
  client: { full_name: string; email: string | null; auto_reminders: boolean; notify_booking: boolean } | null;
  property: { address_line1: string; address_line2: string | null; city: string | null; postcode: string } | null;
};

/**
 * "See you tomorrow" to every customer with a visit tomorrow.
 *
 * Not for every day of a long job: a visit with another one on the same job in
 * the three days before it is a job already under way, and the customer knows.
 * Not for a visit booked in the last day either: the booking email has only
 * just gone.
 */
async function remindTomorrowsVisits(admin: Admin, now: Date, today: string, control: ControlLookup, result: RunResult) {
  const { start, end } = londonDayBoundsIso(addDays(today, 1));

  const { data: visits, error } = await admin
    .from("job_visits")
    .select(
      `id, job_id, starts_at, created_at,
       job:jobs(id, title, status, deleted_at,
         client:clients(full_name, email, auto_reminders, notify_booking),
         property:properties(address_line1, address_line2, city, postcode))`,
    )
    .gte("starts_at", start)
    .lt("starts_at", end)
    .is("reminder_sent_at", null)
    .order("starts_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) throw new Error(error.message);
  if (!visits?.length) return;

  // Earlier days on the same jobs, to tell a first morning from day four.
  const { data: earlier } = await admin
    .from("job_visits")
    .select("job_id")
    .in(
      "job_id",
      visits.map((visit) => visit.job_id),
    )
    .gte("starts_at", new Date(new Date(start).getTime() - 3 * 86_400_000).toISOString())
    .lt("starts_at", start);
  const underWay = new Set((earlier ?? []).map((row) => row.job_id));

  for (const visit of visits) {
    const job = visit.job as unknown as VisitJob | null;

    if (!job || job.deleted_at || !["scheduled", "in_progress", "accepted"].includes(job.status)) continue;
    if (!job.client?.email) continue;

    const bookedJustNow = now.getTime() - new Date(visit.created_at).getTime() < 20 * 60 * 60 * 1000;
    if (
      job.client.auto_reminders === false ||
      job.client.notify_booking === false ||
      control("job", job.id)?.stopped ||
      underWay.has(job.id) ||
      bookedJustNow
    ) {
      result.skipped += 1;
      continue;
    }

    const startsAt = new Date(visit.starts_at);
    const arrival = `between ${formatTime(startsAt)} and ${formatTime(new Date(startsAt.getTime() + 2 * 60 * 60 * 1000))}`;
    const address = job.property
      ? [job.property.address_line1, job.property.address_line2, job.property.city, job.property.postcode]
          .filter(Boolean)
          .join(", ")
      : null;

    const sent = await sendVisitReminder(
      job.client.email,
      job.client.full_name,
      job.title,
      formatDayHeading(startsAt),
      arrival,
      address,
      job.id,
    );

    if (!sent.sent) {
      console.error("[cron] visit reminder failed", visit.id, sent.error);
      result.failed += 1;
      continue;
    }

    await admin.from("job_visits").update({ reminder_sent_at: now.toISOString() }).eq("id", visit.id);
    result.visitsReminded += 1;
  }
}

/**
 * Adds the things the owner would otherwise forget to their to-do list, and ticks
 * off the ones that have sorted themselves out (the invoice went, the quote
 * got an answer, the money came in).
 *
 * Each nudge has an `auto_key`, so a job that stays unbilled for a week gets
 * one nudge, not seven.
 */
async function addOwnerNudges(
  admin: Admin,
  now: Date,
  today: string,
  flags: { unbilled: boolean; lapsed: boolean; promises: boolean },
  control: ControlLookup,
  allControls: ChaseControl[],
  result: RunResult,
) {
  const nudges: {
    title: string;
    kind: "unbilled_job" | "quote_lapsed" | "promise_due";
    auto_key: string;
    job_id: string | null;
    client_id: string | null;
    invoice_id: string | null;
    quote_id: string | null;
  }[] = [];

  if (flags.unbilled) {
    const { data: jobs, error } = await admin
      .from("jobs")
      .select("id, title, client_id, client:clients(full_name)")
      .eq("status", "completed")
      .is("deleted_at", null)
      .lt("completed_at", new Date(now.getTime() - UNBILLED_AFTER_DAYS * 86_400_000).toISOString())
      .limit(MAX_PER_RUN);
    if (error) throw new Error(error.message);

    for (const job of jobs ?? []) {
      nudges.push({
        title: `Send ${job.client?.full_name ?? "the customer"} their invoice for ${job.title}`,
        kind: "unbilled_job",
        auto_key: `unbilled:${job.id}`,
        job_id: job.id,
        client_id: job.client_id,
        invoice_id: null,
        quote_id: null,
      });
    }
  }

  if (flags.lapsed) {
    const { data: quotes, error } = await admin
      .from("quotes")
      .select("id, reference, job_id, client_id, client:clients(full_name)")
      .in("status", ["sent", "expired"])
      .is("deleted_at", null)
      .lt("valid_until", today)
      .gte("valid_until", addDays(today, -7))
      .limit(MAX_PER_RUN);
    if (error) throw new Error(error.message);

    for (const quote of quotes ?? []) {
      if (control("quote", quote.id)?.stopped) continue;
      nudges.push({
        title: `No answer on quote ${quote.reference} for ${quote.client?.full_name ?? "the customer"}. Worth a ring?`,
        kind: "quote_lapsed",
        auto_key: `quote:${quote.id}`,
        job_id: quote.job_id,
        client_id: quote.client_id,
        invoice_id: null,
        quote_id: quote.id,
      });
    }
  }

  if (flags.promises) {
    // Invoices whose "they will pay by" day has been and gone.
    const promised = allControls.filter(
      (row) => row.entity === "invoice" && !row.stopped && row.paused_until && row.paused_until < today,
    );

    if (promised.length > 0) {
      const { data: invoices, error } = await admin
        .from("invoices")
        .select("id, reference, job_id, client_id, total_pence, paid_pence, client:clients(full_name)")
        .in(
          "id",
          promised.map((row) => row.entity_id),
        )
        .in("status", ["sent", "part_paid", "overdue"])
        .is("deleted_at", null);
      if (error) throw new Error(error.message);

      for (const invoice of invoices ?? []) {
        const outstanding = invoice.total_pence - invoice.paid_pence;
        const promise = control("invoice", invoice.id);
        if (outstanding <= 0 || !promise?.paused_until) continue;
        nudges.push({
          title: `${invoice.client?.full_name ?? "The customer"} said they would pay ${invoice.reference} by ${formatDate(promise.paused_until)}. ${formatPence(outstanding)} still to pay.`,
          kind: "promise_due",
          auto_key: `promise:${invoice.id}:${promise.paused_until}`,
          job_id: invoice.job_id,
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          quote_id: null,
        });
      }
    }
  }

  if (nudges.length > 0) {
    const { data: added, error } = await admin
      .from("owner_reminders")
      .upsert(
        nudges.map((nudge) => ({ ...nudge, due_at: now.toISOString() })),
        { onConflict: "auto_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    result.nudgesAdded = (added ?? []).length;
  }

  // Tick off the ones that no longer apply.
  const { data: open } = await admin
    .from("owner_reminders")
    .select("id, kind, job:jobs(status), quote:quotes(status), invoice:invoices(status, total_pence, paid_pence)")
    .is("done_at", null)
    .neq("kind", "manual")
    .limit(200);

  const resolved = (open ?? [])
    .filter((row) => {
      const job = row.job as unknown as { status: string } | null;
      const quote = row.quote as unknown as { status: string } | null;
      const invoice = row.invoice as unknown as { status: string; total_pence: number; paid_pence: number } | null;
      if (row.kind === "unbilled_job") return !job || job.status !== "completed";
      if (row.kind === "quote_lapsed") return !quote || !["sent", "expired"].includes(quote.status);
      if (row.kind === "promise_due") {
        return !invoice || ["paid", "void"].includes(invoice.status) || invoice.total_pence - invoice.paid_pence <= 0;
      }
      return false;
    })
    .map((row) => row.id);

  if (resolved.length > 0) {
    await admin.from("owner_reminders").update({ done_at: now.toISOString() }).in("id", resolved);
    result.nudgesClosed = resolved.length;
  }
}

/**
 * Deletes enquiry photos that nothing points at.
 *
 * The request form uploads each photo the moment it is picked, before the
 * customer presses send. When they never send it (or the send fails), the
 * files stay in the `enquiry-photos` bucket with no enquiry, invisible to
 * everyone. Those are the only files this removes:
 *
 *   - only the `enquiry-photos` bucket, under `enquiry/`. Job photos, the
 *     gallery and the logo live in other buckets and are never listed here;
 *   - only files no `job_photos` row refers to. A sent enquiry links its photos
 *     there, and converting it to a job keeps that same row, so every photo
 *     anyone can see is referenced;
 *   - only files more than a day old, so a photo uploaded seconds before the
 *     customer presses send is never caught mid-flight.
 */
async function removeOrphanEnquiryPhotos(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
): Promise<number> {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;

  const { data: files, error } = await admin.storage
    .from("enquiry-photos")
    .list("enquiry", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error(error.message);

  const candidates = (files ?? [])
    .filter((file) => file.id && file.created_at && new Date(file.created_at).getTime() < cutoff)
    .map((file) => `enquiry/${file.name}`);
  if (candidates.length === 0) return 0;

  const referenced = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const batch = candidates.slice(i, i + 200);
    const { data: rows, error: lookupError } = await admin
      .from("job_photos")
      .select("storage_path")
      .in("storage_path", batch);
    // A failed lookup must never be read as "nothing refers to these".
    if (lookupError) throw new Error(lookupError.message);
    for (const row of rows ?? []) referenced.add(row.storage_path);
  }

  const orphans = candidates.filter((path) => !referenced.has(path));
  if (orphans.length === 0) return 0;

  const { error: removeError } = await admin.storage.from("enquiry-photos").remove(orphans);
  if (removeError) throw new Error(removeError.message);

  return orphans.length;
}
