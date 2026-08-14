import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvoiceReminder, sendQuoteExpiryReminder } from "@/lib/email";

/**
 * The chasing that nobody wants to do.
 *
 * Two jobs, once a day:
 *
 *   1. Remind customers about invoices that have gone past their due date.
 *   2. Warn customers whose quote is about to lapse.
 *
 * Why this is a scheduled route and not part of a page: the app already had a
 * housekeeping function that flips invoices to `overdue`, but it only ran when
 * somebody loaded the dashboard. Anything hung off that fires when the owner
 * happens to open the app — which for a plumber might be twice on Monday and
 * not again until Thursday — or never. Money owed should not be chased on
 * whether somebody opened an app.
 *
 * Safety properties, in order of how badly each would hurt to get wrong:
 *
 *   * **It cannot email the same person twice in a week.** Every send stamps
 *     `last_reminder_at`, and nothing is chased inside the cooldown. A daily
 *     schedule therefore does not mean daily emails; it means the reminder
 *     goes out the day it becomes due and then goes quiet.
 *   * **It is authenticated.** The URL is public, so without a shared secret
 *     anybody could hammer it and turn the reminder system into a way of
 *     spamming this business's own customers.
 *   * **One failure does not stop the run.** Each send is independent; a
 *     bounced address must not leave the rest of the list unchased.
 *   * **It never invents work.** It only reads rows that already exist and
 *     sends about them; there is nothing here that can change a balance.
 */

/** How long before the same document may be chased again. */
const COOLDOWN_DAYS = 7;

/** How far ahead of expiry a quote gets its nudge. */
const QUOTE_WARNING_DAYS = 3;

/** Cap per run: a mail provider throttles, and a huge burst looks like spam. */
const MAX_PER_RUN = 25;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header; a person with the URL does not.
  //
  // Checked with a plain comparison rather than anything clever: this guards a
  // job that emails customers, and the failure mode of a subtle auth bug here
  // is the business's own mailing list being used against it.
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
  const today = now.toISOString().slice(0, 10);
  const cooldownStart = new Date(now.getTime() - COOLDOWN_DAYS * 86_400_000).toISOString();

  const result = { invoicesChased: 0, quotesChased: 0, failed: 0, errors: [] as string[] };

  // A query that fails returns `data: null`, which loops zero times and looks
  // exactly like "nothing needed chasing". That is the worst possible way for
  // this to break: silent, and indistinguishable from working. Both queries
  // are checked, and a failure is reported in the response the schedule sees.

  // --- Overdue invoices ----------------------------------------------------
  const { data: invoices, error: invoiceError } = await admin
    .from("invoices")
    .select(
      "id, reference, due_date, total_pence, paid_pence, last_reminder_at, client:clients(full_name, email)",
    )
    .in("status", ["sent", "overdue"])
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

    const sent = await sendInvoiceReminder(
      invoice.client.email,
      invoice.client.full_name,
      invoice.reference,
      outstanding,
      daysBetween(new Date(invoice.due_date), now),
      invoice.id,
    );

    if (!sent.sent) {
      // Deliberately NOT stamped. An email that did not send has not chased
      // anybody, and pretending otherwise means this invoice is never chased
      // again.
      console.error("[cron] invoice reminder failed", invoice.reference, sent.error);
      result.failed += 1;
      continue;
    }

    await admin
      .from("invoices")
      .update({ last_reminder_at: now.toISOString() })
      .eq("id", invoice.id);

    result.invoicesChased += 1;
  }

  // --- Quotes about to lapse -----------------------------------------------
  const warnBy = new Date(now.getTime() + QUOTE_WARNING_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: quotes, error: quoteError } = await admin
    .from("quotes")
    .select(
      "id, reference, valid_until, total_pence, last_reminder_at, client:clients(full_name, email)",
    )
    .eq("status", "sent")
    .is("deleted_at", null)
    .not("valid_until", "is", null)
    .lte("valid_until", warnBy)
    .gte("valid_until", today)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cooldownStart}`)
    .order("valid_until", { ascending: true })
    .limit(MAX_PER_RUN);

  if (quoteError) {
    console.error("[cron] could not read quotes", quoteError.message);
    result.errors.push(`quotes: ${quoteError.message}`);
  }

  for (const quote of quotes ?? []) {
    if (!quote.client?.email || !quote.valid_until) continue;

    const sent = await sendQuoteExpiryReminder(
      quote.client.email,
      quote.client.full_name,
      quote.reference,
      quote.total_pence,
      daysBetween(now, new Date(quote.valid_until)),
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

  console.info("[cron] reminders", result);

  // A non-200 when a query failed, so a failing schedule shows up as failing in
  // Vercel's cron log instead of as a long run of quiet successes.
  return NextResponse.json(
    { ok: result.errors.length === 0, ...result },
    { status: result.errors.length === 0 ? 200 : 500 },
  );
}
