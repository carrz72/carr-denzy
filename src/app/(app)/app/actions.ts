"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requireStaff } from "@/lib/auth";
import {
  convertEnquirySchema,
  emailSchema,
  fieldErrors,
  invoiceSchema,
  jobNoteSchema,
  jobSchema,
  jobStatusSchema,
  paymentSchema,
  phoneJobSchema,
  quoteSchema,
  scheduleSchema,
  settingsSchema,
} from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipientsForClient } from "@/lib/recipients";
import {
  explainSendFailure,
  sendEnquiryDeclined,
  sendInvoiceToClient,
  sendDocumentNotice,
  sendPaymentReceipt,
  sendPortalInvite,
  sendQuoteToClient,
} from "@/lib/email";
import { buildInvoicePdf, buildQuotePdf } from "@/lib/document-pdf";
import {
  businessSnapshot,
  LIVE_PAYMENT_FIELDS,
  UNPAID_ISSUED_STATUSES,
} from "@/lib/invoice-snapshot";
import { notifyClientBooked, notifyClientCompleted } from "@/lib/notify-client";
import { formatPence } from "@/lib/money";
import {
  addDaysToToday,
  formatDate,
  formatDateTime,
  formatTime,
  isPast,
  londonDayBoundsIso,
  londonWallTimeToIso,
  workingDaysFrom,
} from "@/lib/dates";

export interface ActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
  warning?: string;
  /** Which "do it anyway?" this warning is asking about, so each is confirmed on its own. */
  confirm?: "closure" | "overlap";
  id?: string;
}

/** Turns a Postgres error into something a plumber can act on. */
function friendly(message: string | undefined, fallback: string): string {
  if (!message) return fallback;

  // The status machine and the immutability guards raise their own messages,
  // already written for a human. Pass those straight through.
  if (
    message.includes("can't go from") ||
    message.includes("can't be edited") ||
    message.includes("can't be changed") ||
    message.includes("no longer open")
  ) {
    return message;
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

// Marking an enquiry read lives in the enquiry page itself, inside `after()`.
// It was a server action here, and the page called it while rendering — which
// silently broke the page, because a server action revalidates paths and you
// cannot revalidate the tree you are in the middle of rendering.

export async function declineEnquiry(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const enquiryId = String(formData.get("enquiry_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  // Off unless the owner ticks it. The note field is where you write "time
  // waster" — that must never leave the building by accident.
  const shareReason = formData.get("share_reason") === "on";

  if (!enquiryId) return { ok: false, formError: "Missing enquiry." };

  const supabase = await createClient();

  const { data: enquiry, error } = await supabase
    .from("enquiries")
    .update({ status: "declined", decline_reason: reason || null })
    .eq("id", enquiryId)
    .select("full_name, email, phone, reference")
    .maybeSingle();

  if (error) {
    return { ok: false, formError: "Could not update that enquiry. Try again." };
  }

  revalidatePath("/app/enquiries");
  revalidatePath("/app", "layout");

  // Tell the customer. Somebody who filled in a form and then hears nothing
  // assumes they are still in a queue — they wait, and the leak keeps leaking.
  //
  // A failure here never fails the decline: the enquiry is already closed, and
  // the owner is told what to do instead.
  if (!enquiry) return { ok: true };

  if (!enquiry.email) {
    return {
      ok: true,
      warning: enquiry.phone
        ? `Declined. They left no email address, so nothing was sent — give them a ring on ${enquiry.phone} if you want to let them know.`
        : "Declined. They left no email address and no phone number, so there is no way to tell them.",
    };
  }

  const sent = await sendEnquiryDeclined(
    enquiry.email,
    enquiry.full_name,
    enquiry.reference,
    shareReason && reason ? reason : null,
  );

  if (!sent.sent) {
    return {
      ok: true,
      warning: `Declined, but we could not email them. ${explainSendFailure(sent.error)}`,
    };
  }

  return { ok: true };
}

/**
 * Converts an enquiry into a real job (spec FR-29).
 *
 * Creates or reuses a client, creates a property from the address supplied,
 * creates the job, moves the enquiry's photographs onto it, and links the two.
 * Done in this order so a failure part-way leaves an enquiry that can simply
 * be converted again, rather than an orphaned job with no customer.
 */
export async function convertEnquiry(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = convertEnquirySchema.safeParse({
    enquiry_id: formData.get("enquiry_id") ?? "",
    client_id: formData.get("client_id") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("*")
    .eq("id", parsed.data.enquiry_id)
    .maybeSingle();

  if (!enquiry) return { ok: false, formError: "That enquiry no longer exists." };

  if (enquiry.job_id) {
    // Already converted — send the owner to the job rather than making a second.
    redirect(`/app/jobs/${enquiry.job_id}`);
  }

  // --- Client -----------------------------------------------------------
  let clientId = parsed.data.client_id || null;

  if (!clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        full_name: enquiry.full_name,
        email: enquiry.email,
        phone: enquiry.phone,
      })
      .select("id")
      .single();

    if (clientError || !client) {
      console.error("[convert] client insert failed", clientError);
      return { ok: false, formError: "Could not create the customer record. Try again." };
    }

    clientId = client.id;
  }

  // --- Property ---------------------------------------------------------
  let propertyId: string | null = null;

  if (enquiry.address_line1 && enquiry.postcode) {
    const { data: property } = await supabase
      .from("properties")
      .insert({
        client_id: clientId,
        address_line1: enquiry.address_line1,
        address_line2: enquiry.address_line2,
        city: enquiry.city,
        postcode: enquiry.postcode,
      })
      .select("id")
      .single();

    propertyId = property?.id ?? null;
  }

  // --- Job --------------------------------------------------------------
  const title =
    enquiry.service_label ??
    enquiry.description.split(/[.\n]/)[0]?.slice(0, 80) ??
    "New job";

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: clientId,
      property_id: propertyId,
      service_id: enquiry.service_id,
      title,
      description: enquiry.description,
      urgency: enquiry.urgency,
      status: "new",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("[convert] job insert failed", jobError);
    return { ok: false, formError: "Could not create the job. Try again." };
  }

  // --- Carry the photographs across --------------------------------------
  await supabase
    .from("job_photos")
    .update({ job_id: job.id })
    .eq("enquiry_id", parsed.data.enquiry_id);

  await supabase
    .from("enquiries")
    .update({ status: "converted", client_id: clientId, job_id: job.id })
    .eq("id", parsed.data.enquiry_id);

  revalidatePath("/app", "layout");

  redirect(`/app/jobs/${job.id}`);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function createJob(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = jobSchema.safeParse({
    client_id: formData.get("client_id") ?? "",
    property_id: formData.get("property_id") ?? "",
    service_id: formData.get("service_id") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    urgency: formData.get("urgency") ?? "soon",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      client_id: parsed.data.client_id,
      property_id: parsed.data.property_id || null,
      service_id: parsed.data.service_id || null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      urgency: parsed.data.urgency,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, formError: "Could not create that job. Try again." };
  }

  revalidatePath("/app", "layout");
  redirect(`/app/jobs/${data.id}`);
}

/**
 * Takes a job over the phone (or off a text, or from a neighbour in the street).
 *
 * Most of this business's work arrives this way, not through the website form,
 * so this is the primary intake path rather than a convenience. It does in one
 * submit what `convertEnquiry` does across a conversion: find or create the
 * customer, record the address if one was given, create the job, and book it in
 * if a date was taken during the call.
 *
 * Order matters. The customer is created first and the job last, so a failure
 * part-way leaves a customer record that can simply be picked from the list on
 * a second attempt — never a job with no customer, which the schema forbids
 * anyway.
 */
export async function createPhoneJob(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = phoneJobSchema.safeParse({
    client_id: formData.get("client_id") ?? "",
    full_name: formData.get("full_name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address_line1: formData.get("address_line1") ?? "",
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city") ?? "",
    postcode: formData.get("postcode") ?? "",
    access_notes: formData.get("access_notes") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    service_id: formData.get("service_id") ?? "",
    urgency: formData.get("urgency") ?? "soon",
    date: formData.get("date") ?? "",
    time: formData.get("time") ?? "",
    duration_minutes: formData.get("duration_minutes") ?? "60",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // --- Customer ---------------------------------------------------------
  let clientId = parsed.data.client_id || null;

  if (!clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        full_name: parsed.data.full_name!,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
      })
      .select("id")
      .single();

    if (clientError || !client) {
      console.error("[phone job] client insert failed", clientError);
      return { ok: false, formError: "Could not save the customer. Try again." };
    }

    clientId = client.id;
  }

  // --- Address ----------------------------------------------------------
  // Only when there is enough of one to be worth keeping. A half-address is
  // worse than none: it looks complete on a job sheet and is not.
  let propertyId: string | null = null;

  if (parsed.data.address_line1 && parsed.data.postcode) {
    const { data: property } = await supabase
      .from("properties")
      .insert({
        client_id: clientId,
        address_line1: parsed.data.address_line1,
        address_line2: parsed.data.address_line2 || null,
        city: parsed.data.city || null,
        postcode: parsed.data.postcode,
        access_notes: parsed.data.access_notes || null,
      })
      .select("id")
      .single();

    propertyId = property?.id ?? null;
  }

  // --- Job --------------------------------------------------------------
  const booked = Boolean(parsed.data.date && parsed.data.time);

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: clientId,
      property_id: propertyId,
      service_id: parsed.data.service_id || null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      urgency: parsed.data.urgency,
      // A naive local string, so Postgres applies the London zone — the same
      // reasoning as scheduleJob below.
      scheduled_start: booked ? londonWallTimeToIso(parsed.data.date!, parsed.data.time!) : null,
      duration_minutes: booked ? parsed.data.duration_minutes : null,
      status: booked ? "scheduled" : "new",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("[phone job] job insert failed", jobError);
    return {
      ok: false,
      formError: "The customer saved but the job did not. Try again — pick them from the list this time.",
    };
  }

  revalidatePath("/app", "layout");

  redirect(`/app/jobs/${job.id}`);
}

/**
 * Moves a job along.
 *
 * The transition is validated by trigger, not here — so a status change made
 * any other way is checked by the same rule (spec FR-31).
 */
export async function updateJobStatus(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();

  const parsed = jobStatusSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    status: formData.get("status") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const completionNote = String(formData.get("completion_note") ?? "").trim();

  // --- Two moves that are not just a status change -------------------------
  //
  // Both of these used to be one tap on a big button, and both of them do
  // something in the real world: one tells a customer to expect you on a day,
  // the other tells them their job is done. A mis-tap standing in somebody's
  // kitchen sent a real email to a real person.
  //
  // The guard is deliberately not an "are you sure?" — people learn to tap
  // through those inside a week. Each one instead asks for the thing that has
  // to exist for the status to be true at all.

  if (parsed.data.status === "scheduled") {
    // "Booked in" with nothing booked was a lie the app told about itself: the
    // status changed, no date was ever set, and because the booking email only
    // goes out from the scheduling form, the customer heard nothing.
    const { data: job } = await supabase
      .from("jobs")
      .select("scheduled_start")
      .eq("id", parsed.data.job_id)
      .maybeSingle();

    if (!job?.scheduled_start) {
      return {
        ok: false,
        formError:
          "Pick a date and time first — a job is not booked in until there is a day for it, and that is what tells the customer when you are coming.",
      };
    }
  }

  if (parsed.data.status === "completed" && completionNote.length < 5) {
    return {
      ok: false,
      errors: {
        completion_note: "Write a line about what you did — the customer sees this.",
      },
    };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.job_id);

  if (error) {
    return {
      ok: false,
      formError: friendly(error.message, "Could not change the status. Try again."),
    };
  }

  // --- Cancelling tidies up after itself ----------------------------------
  // A cancelled job used to keep an acceptable quote (whose acceptance then
  // failed), booked days in the customer's portal, and unpaid invoices that
  // nobody was reminded of. Quotes are withdrawn and future days removed here;
  // money owed is the owner's call, so it is named, not cancelled for them.
  let warning: string | undefined;

  if (parsed.data.status === "cancelled") {
    const nowIso = new Date().toISOString();
    const [{ error: quoteError }, { error: visitError }, { data: unpaid }] = await Promise.all([
      supabase
        .from("quotes")
        .update({ status: "withdrawn" })
        .eq("job_id", parsed.data.job_id)
        .eq("status", "sent")
        .is("deleted_at", null),
      supabase
        .from("job_visits")
        .delete()
        .eq("job_id", parsed.data.job_id)
        .gte("starts_at", nowIso),
      supabase
        .from("invoices")
        .select("reference, total_pence, paid_pence")
        .eq("job_id", parsed.data.job_id)
        .in("status", [...UNPAID_ISSUED_STATUSES])
        .is("deleted_at", null),
    ]);

    if (quoteError) console.error("[job] could not withdraw quotes on cancel", quoteError.message);
    if (visitError) console.error("[job] could not clear visits on cancel", visitError.message);

    if (unpaid?.length) {
      const list = unpaid
        .map((invoice) => `${invoice.reference} (${formatPence(invoice.total_pence - invoice.paid_pence)})`)
        .join(", ");
      warning = `Still unpaid on this job: ${list}. If the customer should not pay, cancel the invoice from its own page.`;
    }

    revalidatePath("/app/quotes");
    revalidatePath("/app/diary");
  }

  // Only completion is worth telling the customer about. Every other move —
  // quoted, accepted, in progress — is either already covered by its own email
  // or is internal bookkeeping, and a notification per status change would
  // train them to ignore all of them.
  if (parsed.data.status === "completed") {
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", parsed.data.job_id)
      .maybeSingle();

    // The completion note becomes part of the job's record, visible to the
    // customer. It is the same sentence that goes in their email, so there is
    // one account of what was done rather than two that can disagree.
    await supabase.from("job_notes").insert({
      job_id: parsed.data.job_id,
      author_id: user.id,
      body: completionNote,
      visible_to_client: true,
    });

    if (job) await notifyClientCompleted(parsed.data.job_id, job.title, completionNote);
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);
  revalidatePath("/app", "layout");

  return { ok: true, warning };
}

/**
 * Corrects a job's own details: title, description, urgency, type of work and
 * which of the customer's addresses it is at. The customer it belongs to is
 * fixed — moving a job between customers is what merging customers is for.
 */
export async function updateJobDetails(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) return { ok: false, formError: "Missing job." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("jobs")
    .select("id, client_id")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { ok: false, formError: "That job no longer exists." };

  const parsed = jobSchema.safeParse({
    client_id: existing.client_id,
    property_id: formData.get("property_id") ?? "",
    service_id: formData.get("service_id") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    urgency: formData.get("urgency") ?? "soon",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  // The address must be one of this customer's, not any id posted in.
  if (parsed.data.property_id) {
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", parsed.data.property_id)
      .eq("client_id", existing.client_id)
      .maybeSingle();
    if (!property) return { ok: false, errors: { property_id: "Pick one of this customer's addresses." } };
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      urgency: parsed.data.urgency,
      service_id: parsed.data.service_id || null,
      property_id: parsed.data.property_id || null,
    })
    .eq("id", jobId);

  if (error) {
    console.error("[job] update failed", error);
    return { ok: false, formError: "Could not save those details. Try again." };
  }

  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/jobs");
  revalidatePath("/app", "layout");

  return { ok: true, id: jobId };
}

/** Books a job in. Overlaps warn but never block (spec FR-35, E-10). */
export async function scheduleJob(formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const parsed = scheduleSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    date: formData.get("date") ?? "",
    time: formData.get("time") ?? "",
    duration_minutes: formData.get("duration_minutes") ?? "60",
    confirm_overlap: formData.get("confirm_overlap") === "on",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // Times are entered as London wall-clock time and converted here. Saving
  // the bare string let the UTC database read 09:00 as 09:00 UTC, which is
  // 10:00 in British Summer Time.
  const startsAt = londonWallTimeToIso(parsed.data.date, parsed.data.time);
  const startMs = new Date(startsAt).getTime();
  const endMs = startMs + parsed.data.duration_minutes * 60_000;

  // A day you have marked off in the diary. Warned about, like a clash,
  // rather than refused: an emergency on a day off is still your call.
  if (formData.get("confirm_closure") !== "on") {
    const { data: closed } = await supabase
      .from("closures")
      .select("starts_on, ends_on, reason")
      .lte("starts_on", parsed.data.date)
      .gte("ends_on", parsed.data.date)
      .limit(1)
      .maybeSingle();

    if (closed) {
      return {
        ok: false,
        confirm: "closure",
        warning: `${formatDate(parsed.data.date)} is marked as a day off in your diary${closed.reason ? ` (${closed.reason})` : ""}. Book it anyway?`,
      };
    }
  }

  // Every booked day of every other live job, not just each job's next one:
  // day three of a refurbishment is as real a clash as day one.
  if (!parsed.data.confirm_overlap) {
    const { start: dayStart, end: dayEnd } = londonDayBoundsIso(parsed.data.date);
    const { data: sameDay } = await supabase
      .from("job_visits")
      .select("starts_at, duration_minutes, job:jobs(id, title, status, deleted_at)")
      .neq("job_id", parsed.data.job_id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd);

    const overlap = (sameDay ?? []).find((visit) => {
      if (!visit.job || visit.job.deleted_at || ["cancelled", "declined"].includes(visit.job.status)) {
        return false;
      }
      const otherStart = new Date(visit.starts_at).getTime();
      const otherEnd = otherStart + visit.duration_minutes * 60_000;
      return otherStart < endMs && startMs < otherEnd;
    });

    if (overlap?.job) {
      return {
        ok: false,
        confirm: "overlap",
        warning: `You already have "${overlap.job.title}" booked at ${formatTime(overlap.starts_at)} that day. Save anyway?`,
      };
    }
  }

  // A day on site is a row in `job_visits`. `jobs.scheduled_start` is kept in
  // step by a trigger, so the diary and the Today screen carry on reading the
  // one column they always read, and nothing here has to remember to update it.
  const { data: existingVisits } = await supabase
    .from("job_visits")
    .select("id")
    .eq("job_id", parsed.data.job_id);

  const isFirstDay = (existingVisits ?? []).length === 0;

  const { error } = await supabase.from("job_visits").insert({
    job_id: parsed.data.job_id,
    starts_at: startsAt,
    duration_minutes: parsed.data.duration_minutes,
    note: String(formData.get("visit_note") ?? "").trim() || null,
  });

  if (error) {
    // The unique index catches the same day being added twice, which is a
    // double tap rather than a plan.
    if (error.code === "23505") {
      return { ok: false, formError: "That day and time is already booked on this job." };
    }
    return { ok: false, formError: friendly(error.message, "Could not book that in. Try again.") };
  }

  // Only worth moving a job that has not started yet. A job already under way,
  // finished or invoiced must not be dragged back to "Booked in" because
  // another day was added to it — which is exactly what happens on a long job.
  const { data: moved, error: statusError } = await supabase
    .from("jobs")
    .update({ status: "scheduled" })
    .eq("id", parsed.data.job_id)
    .in("status", ["new", "quoted", "accepted"])
    .select("id");

  // Reported rather than swallowed. A day that saves while the job silently
  // stays on "New request" is the kind of half-done state that has already
  // bitten this app more than once today.
  if (statusError) {
    console.error("[schedule] could not move the job to scheduled", statusError.message);
  } else if ((moved ?? []).length === 0) {
    console.info("[schedule] job left on its current status — already past booking");
  }

  // Tell the customer — but only once for the job, not once per day.
  //
  // A refurbishment booked across twenty days would otherwise send twenty
  // emails, each promising a two-hour arrival window, which is how a useful
  // notification becomes something a customer filters out. They are told when
  // the work starts and roughly how long it runs; the individual days are on
  // their job page for whenever they want to look.
  const { data: booked } = await supabase
    .from("jobs")
    .select(
      `title, expected_days, expected_days_max, property:properties(address_line1, address_line2, city, postcode)`,
    )
    .eq("id", parsed.data.job_id)
    .maybeSingle();

  if (booked && isFirstDay) {
    const address = booked.property
      ? [
          booked.property.address_line1,
          booked.property.address_line2,
          booked.property.city,
          booked.property.postcode,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    await notifyClientBooked(
      parsed.data.job_id,
      booked.title,
      startsAt,
      parsed.data.duration_minutes,
      address,
      booked.expected_days,
    );
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);
  revalidatePath("/app", "layout");

  return {
    ok: true,
    warning: isFirstDay
      ? undefined
      : "Added. The customer was told when the job starts, so this day has not been emailed to them separately.",
  };
}

/** Takes a day back off a job. */
export async function removeVisit(formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const visitId = String(formData.get("visit_id") ?? "");
  const jobId = String(formData.get("job_id") ?? "");

  if (!visitId || !jobId) return { ok: false, formError: "Missing that day." };

  const supabase = await createClient();

  const { data: removed, error } = await supabase
    .from("job_visits")
    .delete()
    .eq("id", visitId)
    .select("starts_at, job:jobs(title, client:clients(full_name, email))")
    .maybeSingle();

  if (error) {
    return { ok: false, formError: "Could not remove that day. Try again." };
  }

  // The customer was told to expect you; tell them you are not coming, if
  // the owner ticked the box and the day has not already happened.
  const client = removed?.job?.client;
  if (
    formData.get("notify") === "on" &&
    removed &&
    new Date(removed.starts_at).getTime() > Date.now() &&
    client?.email
  ) {
    const notice = await sendDocumentNotice(
      client.email,
      client.full_name,
      `Change to your booking: ${formatDateTime(removed.starts_at)}`,
      "A change to your booking",
      [
        `We have taken ${formatDateTime(removed.starts_at)} out of the booking for ${removed.job?.title ?? "your job"}, so please do not expect us then.`,
        "We will be in touch about another day if one is needed.",
      ],
    );
    if (!notice.sent) console.error("[visit] removal notice did not send", notice.error);
  }

  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app", "layout");

  return { ok: true };
}

/**
 * How long the whole job is expected to run.
 *
 * Separate from the days themselves, because it is a different kind of fact: a
 * customer wants "about three weeks" up front, long before anybody knows which
 * Tuesdays that will be.
 */
export async function setExpectedDays(formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const jobId = String(formData.get("job_id") ?? "");
  const raw = String(formData.get("expected_amount") ?? "").trim();
  const unitRaw = String(formData.get("expected_unit") ?? "days");

  if (!jobId) return { ok: false, formError: "Missing job." };

  const unit: "days" | "weeks" | "months" =
    unitRaw === "weeks" || unitRaw === "months" ? unitRaw : "days";

  const rawMax = String(formData.get("expected_amount_max") ?? "").trim();

  const amount = raw === "" ? null : Number(raw);
  const amountMax = rawMax === "" ? null : Number(rawMax);

  if (amount !== null && (!Number.isInteger(amount) || amount < 1)) {
    return { ok: false, errors: { expected_days: "Give it a whole number." } };
  }

  if (amountMax !== null && (!Number.isInteger(amountMax) || amountMax < 1)) {
    return { ok: false, errors: { expected_days: "Give it a whole number." } };
  }

  // An upper bound on its own says nothing — "up to three weeks" from what?
  if (amountMax !== null && amount === null) {
    return {
      ok: false,
      errors: { expected_days: "Fill in the first box too, or clear them both." },
    };
  }

  if (amount !== null && amountMax !== null && amountMax < amount) {
    return {
      ok: false,
      errors: { expected_days: "The second number needs to be the longer one." },
    };
  }

  // Kept in working days whatever the owner typed, so there is one unit in the
  // database and the reading-back is a display decision rather than a stored
  // one. Five days to the week, twenty to the month. Both ends use the same
  // unit, so a range can never straddle two.
  const days = amount === null ? null : workingDaysFrom(amount, unit);
  const daysMax = amountMax === null ? null : workingDaysFrom(amountMax, unit);

  if ((days !== null && days > 260) || (daysMax !== null && daysMax > 260)) {
    return {
      ok: false,
      errors: { expected_days: "That is over a year of work — check the number." },
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({ expected_days: days, expected_days_max: daysMax })
    .eq("id", jobId);

  if (error) return { ok: false, formError: "Could not save that. Try again." };

  revalidatePath(`/app/jobs/${jobId}`);

  return { ok: true };
}

export async function addJobNote(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();

  const parsed = jobNoteSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    body: formData.get("body") ?? "",
    visible_to_client: formData.get("visible_to_client") === "on",
    client_key: formData.get("client_key") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase.from("job_notes").insert({
    job_id: parsed.data.job_id,
    author_id: user.id,
    body: parsed.data.body,
    visible_to_client: parsed.data.visible_to_client,
    client_key: parsed.data.client_key || null,
  });

  // A replayed note from the offline outbox hits the unique index on
  // client_key. That is success, not failure — the note is already saved.
  if (error && !error.message.includes("duplicate key")) {
    return { ok: false, formError: "Could not save that note. Try again." };
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);

  return { ok: true };
}

/**
 * Removes a job that should never have existed.
 *
 * Distinct from cancelling, and the distinction is the point. A job that was
 * quoted and then fell through is part of the history — it gets `cancelled`
 * and stays in the record. A duplicate, a typo, or a job taken down against
 * the wrong customer is not history, and leaving it in the list for ever as
 * "cancelled" is just clutter that has to be read past every time.
 *
 * Soft, never hard, exactly like `deleteDraftInvoice` — nothing financial is
 * erased from this database (spec FR-58 / NFR-24).
 *
 * The guard is "has the customer seen anything?", not "is it new". A job with
 * a draft quote nobody has read is still a mistake that can be swept up; a job
 * with a sent quote or any invoice is a conversation that already happened,
 * and it has to be cancelled instead so the trail stays intact.
 */
export async function deleteJob(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) return { ok: false, formError: "Missing job." };

  const supabase = await createClient();

  const [{ data: liveQuotes }, { data: anyInvoices }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status")
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .limit(1),
    supabase
      .from("invoices")
      .select("id, status")
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .limit(1),
  ]);

  if ((liveQuotes ?? []).length > 0) {
    return {
      ok: false,
      formError:
        "This job has a quote the customer has already been sent, so it cannot be deleted. Cancel it instead and the history stays intact.",
    };
  }

  if ((anyInvoices ?? []).length > 0) {
    return {
      ok: false,
      formError:
        "This job has an invoice the customer has been sent (even one since cancelled), so it stays on file. Cancel the job instead.",
    };
  }

  // Draft invoices go with it, as never-sent paperwork.
  await supabase
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "draft")
    .is("deleted_at", null);

  // Draft quotes go with it. Left behind they would be orphans with no job to
  // open, still counted on the quotes screen.
  await supabase
    .from("quotes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "draft")
    .is("deleted_at", null);

  const { data, error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", jobId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[job] delete failed", error?.message);
    return { ok: false, formError: "Could not delete that job. Try again." };
  }

  revalidatePath("/app", "layout");

  redirect("/app/jobs");
}

/**
 * Corrects a note.
 *
 * The `author edits own note` policy has permitted this since the first
 * migration and nothing ever called it — so a note typed one-handed under a
 * sink was permanent. There is no good reason for that: the immutable record
 * is `job_events` and `audit_log`, not this.
 *
 * Authorisation is left to RLS, which restricts it to the note's own author.
 * No author id is accepted from the form, so this cannot be aimed at somebody
 * else's note; a mismatched one simply updates nothing.
 *
 * Whether the note is visible to the customer is deliberately NOT editable
 * here. Making a private note public is a different decision from fixing a
 * typo, and quietly folding the two together is how something meant for
 * yourself ends up on a customer's screen.
 */
export async function updateJobNote(formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const noteId = String(formData.get("note_id") ?? "");
  const jobId = String(formData.get("job_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!noteId || !jobId) return { ok: false, formError: "Missing note." };

  if (body.length < 1 || body.length > 5000) {
    return { ok: false, errors: { body: "A note needs some words, and fewer than 5000." } };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_notes")
    .update({ body })
    .eq("id", noteId)
    .select("id");

  if (error) {
    console.error("[note] update failed", error.message);
    return { ok: false, formError: "Could not save that change. Try again." };
  }

  // RLS filtered it out rather than erroring: somebody else wrote this note.
  if (!data || data.length === 0) {
    return { ok: false, formError: "That note was written by somebody else, so it cannot be changed here." };
  }

  revalidatePath(`/app/jobs/${jobId}`);

  return { ok: true };
}

/** Removes a note. Owner-only, per the `owner deletes notes` policy. */
export async function deleteJobNote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const noteId = String(formData.get("note_id") ?? "");
  const jobId = String(formData.get("job_id") ?? "");

  if (!noteId || !jobId) return { ok: false, formError: "Missing note." };

  const supabase = await createClient();

  const { error } = await supabase.from("job_notes").delete().eq("id", noteId);

  if (error) {
    console.error("[note] delete failed", error.message);
    return { ok: false, formError: "Could not remove that note. Try again." };
  }

  revalidatePath(`/app/jobs/${jobId}`);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Invites a customer to see their own jobs online.
 *
 * This exists because of a gap that has no other fix: `handle_new_user()` links
 * a `clients` row to a `profiles` row **by email**. A job taken over the phone
 * from someone who only gave a mobile number therefore has no route to an
 * account at all — that customer could sign up and see nothing, for ever.
 *
 * So the owner sets the email, and this sends a sign-in link to it. When they
 * follow it the auth trigger fires, matches on that email, and adopts the
 * existing customer record — jobs, quotes, invoices and history intact.
 *
 * Uses the admin client because minting a sign-in link is a service-role
 * operation, and because the owner cannot read `auth.users` any other way.
 */
export async function inviteClientToPortal(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();

  const clientId = String(formData.get("client_id") ?? "");
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!clientId) return { ok: false, formError: "Missing customer." };

  const parsedEmail = emailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    return { ok: false, errors: { email: "Check the email address — it needs an @ and a domain" } };
  }

  const email = parsedEmail.data;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, email, profile_id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!client) return { ok: false, formError: "That customer no longer exists." };

  // The email on file is what the auth trigger matches on, so it has to be the
  // one being invited. Saving it first means a retry cannot drift the two apart.
  if (client.email !== email) {
    const { error: updateError } = await supabase
      .from("clients")
      .update({ email })
      .eq("id", clientId);

    if (updateError) {
      console.error("[invite] could not save email", updateError.message);
      return { ok: false, formError: "Could not save that email address. Try again." };
    }
  }

  const admin = createAdminClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // `magiclink` only works for an account that already exists; a first-time
  // customer needs `invite`. Try the cheap case, fall back.
  let generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (generated.error && /not found/i.test(generated.error.message)) {
    generated = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
  }

  if (generated.error || !generated.data?.properties?.hashed_token) {
    console.error("[invite] link generation failed", generated.error?.message);
    return { ok: false, formError: "Could not create the sign-in link. Try again." };
  }

  // Routed through our own callback with the token hash rather than Supabase's
  // action_link, which answers with tokens in a URL fragment the server cannot
  // read — see the comment in src/app/auth/callback/route.ts.
  const link =
    `${siteUrl}/auth/callback` +
    `?token_hash=${encodeURIComponent(generated.data.properties.hashed_token)}` +
    `&type=${encodeURIComponent(generated.data.properties.verification_type ?? "magiclink")}` +
    `&next=${encodeURIComponent("/portal")}`;

  const sent = await sendPortalInvite(email, client.full_name, link);

  if (!sent.sent) {
    // Report what actually went wrong. This used to say "check the address",
    // which was a confident wrong answer — the address is almost never the
    // problem, and it sent the owner hunting for a typo that was not there.
    return {
      ok: false,
      formError: `The email address is saved, but the invitation did not send. ${explainSendFailure(sent.error)}`,
    };
  }

  await supabase.rpc("record_audit_entry", {
    p_action: "client.invited",
    p_entity: "client",
    p_entity_id: clientId,
    p_detail: { email, by: owner.id },
  });

  revalidatePath(`/app/clients/${clientId}`);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/**
 * Creates a quote and its line items.
 *
 * Note what is not sent: any total. The database recalculates subtotal, tax
 * and total from the line items by trigger, so the figure the customer sees
 * is always derived from the lines and never from the browser (spec FR-40).
 */
export async function createQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: unknown;
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { ok: false, formError: "Could not read the quote lines. Try again." };
  }

  const parsed = quoteSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    intro_note: formData.get("intro_note") ?? "",
    terms: formData.get("terms") ?? "",
    valid_until: formData.get("valid_until") ?? "",
    items,
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("client_id")
    .eq("id", parsed.data.job_id)
    .maybeSingle();

  if (!job) return { ok: false, formError: "That job no longer exists." };

  const { data: settings } = await supabase
    .from("settings")
    .select("quote_valid_days")
    .maybeSingle();

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      job_id: parsed.data.job_id,
      client_id: job.client_id,
      status: "draft",
      intro_note: parsed.data.intro_note || null,
      terms: parsed.data.terms || null,
      valid_until: parsed.data.valid_until || addDaysToToday(settings?.quote_valid_days ?? 30),
    })
    .select("id")
    .single();

  if (error || !quote) {
    console.error("[quote] insert failed", error);
    return { ok: false, formError: "Could not create the quote. Try again." };
  }

  const { error: itemsError } = await supabase.from("quote_items").insert(
    parsed.data.items.map((item, index) => ({
      quote_id: quote.id,
      description: item.description,
      kind: item.kind,
      quantity_milli: item.quantity_milli,
      unit_price_pence: item.unit_price_pence,
      vat_rate_bp: item.vat_rate_bp,
      sort_order: index,
    })),
  );

  if (itemsError) {
    console.error("[quote] items failed", itemsError);
    return { ok: false, formError: "The quote saved but its lines did not. Open it and try again." };
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);

  return { ok: true, id: quote.id };
}

/**
 * Rewrites a draft quote.
 *
 * There was no way to change one. A quote could be created and sent, and
 * nothing in between — so a wrong price, a typo in front of a customer, or a
 * line you thought better of meant starting the whole thing again. On a quote
 * with thirty lines that is not a small ask.
 *
 * Drafts only, enforced here rather than trusted from the page. Once a quote
 * has been sent it is a document the customer holds a copy of, and quietly
 * editing it underneath them would be worse than useless — it would be
 * dishonest. Changing a sent quote means issuing a new one.
 */
export async function updateQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  if (!quoteId) return { ok: false, formError: "Missing quote." };

  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: unknown;
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { ok: false, formError: "Could not read the quote lines. Try again." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("quotes")
    .select("id, status, job_id")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { ok: false, formError: "That quote no longer exists." };

  if (existing.status !== "draft") {
    return {
      ok: false,
      formError:
        "This quote has already gone to the customer, so it cannot be changed. Raise a new one instead.",
    };
  }

  const parsed = quoteSchema.safeParse({
    job_id: existing.job_id,
    intro_note: formData.get("intro_note") ?? "",
    terms: formData.get("terms") ?? "",
    valid_until: formData.get("valid_until") ?? "",
    items,
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const { error } = await supabase
    .from("quotes")
    .update({
      intro_note: parsed.data.intro_note || null,
      terms: parsed.data.terms || null,
      valid_until: parsed.data.valid_until || null,
    })
    .eq("id", quoteId);

  if (error) {
    console.error("[quote] update failed", error);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  // Lines are replaced wholesale rather than reconciled one by one. Working
  // out which of thirty lines moved, changed or went is a lot of machinery to
  // arrive at the same place, and the totals are recalculated from whatever
  // ends up in the table.
  const { error: clearError } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", quoteId);

  if (clearError) {
    console.error("[quote] could not clear lines", clearError);
    return { ok: false, formError: "Could not save the lines. Try again." };
  }

  const { error: itemsError } = await supabase.from("quote_items").insert(
    parsed.data.items.map((item, index) => ({
      quote_id: quoteId,
      description: item.description,
      kind: item.kind,
      quantity_milli: item.quantity_milli,
      unit_price_pence: item.unit_price_pence,
      vat_rate_bp: item.vat_rate_bp,
      sort_order: index,
    })),
  );

  if (itemsError) {
    console.error("[quote] items failed", itemsError);
    return {
      ok: false,
      formError: "The quote saved but its lines did not. Open it and try again.",
    };
  }

  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath(`/app/jobs/${existing.job_id}`);

  return { ok: true, id: quoteId };
}

/**
 * Deletes a draft quote. Never sent, so nobody has seen it, and it goes the
 * same way as a draft invoice: soft-deleted, out of every list.
 */
export async function deleteDraftQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  if (!quoteId) return { ok: false, formError: "Missing quote." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("id, job_id")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[quote] delete failed", error);
    return {
      ok: false,
      formError: "Only a draft can be deleted. A sent quote can be withdrawn instead.",
    };
  }

  revalidatePath(`/app/jobs/${data.job_id}`);
  revalidatePath("/app/quotes");
  revalidatePath("/app", "layout");

  return { ok: true, id: data.job_id };
}

/**
 * Withdraws a sent quote that has not been answered: the price was wrong, or
 * the customer wants a different option. It stays on file as Withdrawn and can
 * no longer be accepted anywhere, since acceptance only takes a quote that is
 * still "sent". If it was the job's only open quote, the job goes back to
 * New, ready for the replacement.
 */
export async function withdrawQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  if (!quoteId) return { ok: false, formError: "Missing quote." };

  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("id", quoteId)
    .eq("status", "sent")
    .is("deleted_at", null)
    .select("id, job_id, reference, client:clients(full_name, email)")
    .maybeSingle();

  if (error || !quote) {
    if (error) console.error("[quote] withdraw failed", error);
    return {
      ok: false,
      formError: error?.message.includes("withdrawn")
        ? "The database has not been updated for this yet. Apply the latest migration, then try again."
        : "Only a quote still waiting on an answer can be withdrawn. It may have just been accepted or declined, so reload the page.",
    };
  }

  const { data: stillOpen } = await supabase
    .from("quotes")
    .select("id")
    .eq("job_id", quote.job_id)
    .eq("status", "sent")
    .is("deleted_at", null)
    .limit(1);

  if (!stillOpen?.length) {
    await supabase
      .from("jobs")
      .update({ status: "new" })
      .eq("id", quote.job_id)
      .eq("status", "quoted");
  }

  if (formData.get("notify") === "on" && quote.client?.email) {
    const notice = await sendDocumentNotice(
      quote.client.email,
      quote.client.full_name,
      `Quote ${quote.reference} withdrawn`,
      "Quote withdrawn",
      [
        `We have withdrawn quote ${quote.reference}, so it can no longer be accepted.`,
        "If a revised quote is due, it will come separately.",
      ],
    );
    if (!notice.sent) console.error("[quote] withdraw notice did not send", notice.error);
  }

  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath(`/app/jobs/${quote.job_id}`);
  revalidatePath("/app/quotes");
  revalidatePath(`/quotes/view/${quoteId}`);
  revalidatePath("/app", "layout");

  return { ok: true, id: quoteId };
}

/**
 * Records the customer's answer for them — they rang, texted or said so on
 * site. Goes through the same accept_quote / decline_quote as the portal, on
 * the owner channel, so the quote, the job and the audit log end up exactly
 * as if the customer had tapped the button. The owner channel may also answer
 * a quote whose date has passed, for a customer whose price is being honoured.
 */
export async function recordQuoteAnswer(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  const answer = String(formData.get("answer") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);

  if (!quoteId || (answer !== "accept" && answer !== "decline")) {
    return { ok: false, formError: "Missing quote or answer." };
  }

  const supabase = await createClient();

  const { error } =
    answer === "accept"
      ? await supabase.rpc("accept_quote", { p_quote_id: quoteId })
      : await supabase.rpc("decline_quote", { p_quote_id: quoteId, p_reason: reason || null });

  if (error) {
    console.error("[quote] owner answer failed", error.message);
    return {
      ok: false,
      formError: error.message.includes("no longer open")
        ? "This quote has already been answered or withdrawn. Reload the page."
        : "Could not record that. Try again.",
    };
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("job_id")
    .eq("id", quoteId)
    .maybeSingle();

  revalidatePath(`/app/quotes/${quoteId}`);
  if (quote?.job_id) revalidatePath(`/app/jobs/${quote.job_id}`);
  revalidatePath("/app/quotes");
  revalidatePath("/app", "layout");

  return { ok: true, id: quoteId };
}

/** Sends a draft quote to the customer. */
export async function sendQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  if (!quoteId) return { ok: false, formError: "Missing quote." };

  const supabase = await createClient();

  // A draft whose "open until" date has already gone would arrive expired:
  // the customer could read it but not accept it. Catch it before it leaves.
  const { data: pending } = await supabase
    .from("quotes")
    .select("valid_until")
    .eq("id", quoteId)
    .maybeSingle();

  if (pending && isPast(pending.valid_until)) {
    return {
      ok: false,
      formError:
        "This quote's 'open until' date has already passed, so the customer could not accept it. Change the date, then send it.",
    };
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "draft")
    .select("id, reference, total_pence, valid_until, job_id, client_id, client:clients(full_name, email)")
    .single();

  if (error || !quote) {
    return { ok: false, formError: friendly(error?.message, "Could not send that quote. Try again.") };
  }

  await supabase.from("jobs").update({ status: "quoted" }).eq("id", quote.job_id);

  let warning: string | undefined;

  // Everyone on the account, not just the named customer — an office manager
  // who can see the quote but is never told it arrived is no use to anybody.
  const recipients = await recipientsForClient(quote.client_id);

  if (recipients.length > 0) {
    // Best-effort. A PDF that fails to render must not stop the quote being
    // sent — the link in the email is the thing that actually wins the job,
    // and the attachment is a convenience for people who forward it on.
    const pdf = await buildQuotePdf(supabase, quoteId).catch((pdfError) => {
      console.error("[quote] pdf render failed", pdfError);
      return undefined;
    });

    const results = await Promise.all(
      recipients.map((recipient) =>
        sendQuoteToClient(
          recipient.email,
          quote.client?.full_name ?? "there",
          quote.reference,
          formatPence(quote.total_pence),
          quote.id,
          quote.valid_until ? formatDate(quote.valid_until) : null,
          pdf,
        ),
      ),
    );

    // The quote is sent either way — the status is already updated. The owner
    // just needs to know to pick up the phone (spec E-15).
    const failed = results.filter((result) => !result.sent);

    if (failed.length === results.length) {
      warning = `The quote is marked as sent, but the email did not go out. ${explainSendFailure(failed[0]?.error)} Ring them, or copy the link.`;
    } else if (failed.length > 0) {
      warning = `The quote went to ${results.length - failed.length} of ${results.length} people on this account. ${explainSendFailure(failed[0]?.error)}`;
    }
  } else {
    warning = "Nobody on this account has an email address, so nothing was sent. Ring them or add one.";
  }

  revalidatePath(`/app/jobs/${quote.job_id}`);
  revalidatePath("/app", "layout");

  return { ok: true, warning };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: unknown;
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { ok: false, formError: "Could not read the invoice lines. Try again." };
  }

  const parsed = invoiceSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    client_id: formData.get("client_id") ?? "",
    full_name: formData.get("full_name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    quote_id: formData.get("quote_id") ?? "",
    issue_date: formData.get("issue_date") ?? "",
    due_date: formData.get("due_date") ?? "",
    notes: formData.get("notes") ?? "",
    reverse_charge: formData.get("reverse_charge") === "on",
    items,
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // One quote, one invoice. A second "Invoice this quote" tap (or the same
  // page opened twice) would otherwise bill the customer for the work again.
  // A cancelled invoice does not count, so a corrected one can be raised.
  if (parsed.data.quote_id) {
    const { data: already } = await supabase
      .from("invoices")
      .select("reference")
      .eq("quote_id", parsed.data.quote_id)
      .is("deleted_at", null)
      .neq("status", "void")
      .limit(1)
      .maybeSingle();

    if (already) {
      return {
        ok: false,
        formError: `This quote has already been invoiced as ${already.reference}. Open that one instead, or cancel it first if it needs replacing.`,
      };
    }
  }

  // A standalone invoice may be the first record of this customer — work done
  // before the app existed, or a one-off that never became a job.
  let clientId = parsed.data.client_id || null;

  if (!clientId) {
    const { data: created, error: createError } = await supabase
      .from("clients")
      .insert({
        full_name: parsed.data.full_name!,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
      })
      .select("id")
      .single();

    if (createError || !created) {
      console.error("[invoice] client insert failed", createError);
      return { ok: false, formError: "Could not save the customer. Try again." };
    }

    clientId = created.id;
  }

  // Snapshot the business and the customer as they are today. An invoice is a
  // legal record; it must not silently change because someone later corrected
  // an address.
  const [{ data: settings }, { data: client }] = await Promise.all([
    supabase.from("settings").select("*").maybeSingle(),
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
  ]);

  if (!client) return { ok: false, formError: "That customer no longer exists." };

  const { data: property } = parsed.data.job_id
    ? await supabase
        .from("jobs")
        .select("property:properties(address_line1, address_line2, city, postcode)")
        .eq("id", parsed.data.job_id)
        .maybeSingle()
    : { data: null };

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      job_id: parsed.data.job_id || null,
      client_id: clientId,
      quote_id: parsed.data.quote_id || null,
      status: "draft",
      issue_date: parsed.data.issue_date,
      due_date:
        parsed.data.due_date || addDaysToToday(settings?.payment_terms_days ?? 14),
      notes: parsed.data.notes || null,
      reverse_charge: parsed.data.reverse_charge,
      business_snapshot: settings ? businessSnapshot(settings) : null,
      client_snapshot: {
        full_name: client.full_name,
        company_name: client.company_name,
        email: client.email,
        phone: client.phone,
        address: property?.property ?? null,
      },
    })
    .select("id")
    .single();

  if (error || !invoice) {
    console.error("[invoice] insert failed", error);
    return { ok: false, formError: "Could not create the invoice. Try again." };
  }

  const { error: itemsError } = await supabase.from("invoice_items").insert(
    parsed.data.items.map((item, index) => ({
      invoice_id: invoice.id,
      description: item.description,
      kind: item.kind,
      quantity_milli: item.quantity_milli,
      unit_price_pence: item.unit_price_pence,
      vat_rate_bp: item.vat_rate_bp,
      sort_order: index,
    })),
  );

  if (itemsError) {
    console.error("[invoice] items failed", itemsError);
    return {
      ok: false,
      formError: "The invoice saved but its lines did not. Open it and try again.",
    };
  }

  revalidatePath("/app/invoices");

  return { ok: true, id: invoice.id };
}

/**
 * Changes a draft invoice before it goes out: its lines, dates, note and
 * reverse-charge flag. The customer, job and quote stay as raised — moving an
 * invoice to a different customer is a different invoice.
 *
 * Drafts only, checked here and again by the database trigger that refuses
 * line changes on anything issued.
 */
export async function updateInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { ok: false, formError: "Could not read the invoice lines. Try again." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, status, job_id, client_id, quote_id")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return { ok: false, formError: "That invoice no longer exists." };

  if (existing.status !== "draft") {
    return {
      ok: false,
      formError: "This invoice has already been sent, so its figures are fixed.",
    };
  }

  const parsed = invoiceSchema.safeParse({
    job_id: existing.job_id ?? "",
    client_id: existing.client_id ?? "",
    quote_id: existing.quote_id ?? "",
    issue_date: formData.get("issue_date") ?? "",
    due_date: formData.get("due_date") ?? "",
    notes: formData.get("notes") ?? "",
    reverse_charge: formData.get("reverse_charge") === "on",
    items,
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const { data: settings } = await supabase
    .from("settings")
    .select("payment_terms_days")
    .maybeSingle();

  // Status re-checked in the write itself, so a send that lands between the
  // read above and this update cannot be overwritten.
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({
      issue_date: parsed.data.issue_date,
      due_date: parsed.data.due_date || addDaysToToday(settings?.payment_terms_days ?? 14),
      notes: parsed.data.notes || null,
      reverse_charge: parsed.data.reverse_charge,
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[invoice] update failed", error);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  // Replaced wholesale, as quotes are. The totals trigger recalculates from
  // whatever ends up in the table.
  const { error: clearError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);

  if (clearError) {
    console.error("[invoice] could not clear lines", clearError);
    return { ok: false, formError: "Could not save the lines. Try again." };
  }

  const { error: itemsError } = await supabase.from("invoice_items").insert(
    parsed.data.items.map((item, index) => ({
      invoice_id: invoiceId,
      description: item.description,
      kind: item.kind,
      quantity_milli: item.quantity_milli,
      unit_price_pence: item.unit_price_pence,
      vat_rate_bp: item.vat_rate_bp,
      sort_order: index,
    })),
  );

  if (itemsError) {
    console.error("[invoice] items failed", itemsError);
    return {
      ok: false,
      formError: "The invoice saved but its lines did not. Open it and try again.",
    };
  }

  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app/invoices");

  return { ok: true, id: invoiceId };
}

export async function sendInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  const supabase = await createClient();

  // The details are frozen now, at sending, not when the draft was started:
  // anything changed in Settings while it sat as a draft must be on the copy
  // the customer receives.
  const [{ data: settings }, { data: draft }] = await Promise.all([
    supabase.from("settings").select("*").maybeSingle(),
    supabase
      .from("invoices")
      .select(
        "client_snapshot, client:clients(full_name, company_name, email, phone), job:jobs(property:properties(address_line1, address_line2, city, postcode))",
      )
      .eq("id", invoiceId)
      .maybeSingle(),
  ]);

  // The customer too: a name, phone or address corrected while this sat as a
  // draft belongs on the invoice they get. The address is the job's address
  // (where the work was done), read fresh in case it was fixed meanwhile.
  const jobAddress = draft?.job?.property ?? null;
  const clientSnapshot = draft?.client
    ? {
        ...((draft.client_snapshot ?? {}) as Record<string, unknown>),
        ...(jobAddress ? { address: jobAddress } : {}),
        full_name: draft.client.full_name,
        company_name: draft.client.company_name,
        email: draft.client.email,
        phone: draft.client.phone,
      }
    : undefined;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      ...(settings ? { business_snapshot: businessSnapshot(settings) } : {}),
      ...(clientSnapshot ? { client_snapshot: clientSnapshot } : {}),
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id, reference, total_pence, due_date, job_id, client_id, client:clients(full_name, email)")
    .single();

  if (error || !invoice) {
    return {
      ok: false,
      formError: friendly(error?.message, "Could not send that invoice. Try again."),
    };
  }

  if (invoice.job_id) {
    // Logged rather than ignored: a refused status change here once left jobs
    // reading "New request" with a paid invoice on them, and nobody knew.
    const { error: jobError } = await supabase
      .from("jobs")
      .update({ status: "invoiced" })
      .eq("id", invoice.job_id);
    if (jobError) console.error("[invoice] job status not moved to invoiced", jobError.message);
  }

  let warning: string | undefined;

  // Everyone on the account. A landlord's bookkeeper who cannot see the
  // invoice arrive cannot pay it.
  const recipients = await recipientsForClient(invoice.client_id);

  if (recipients.length > 0) {
    const pdf = await buildInvoicePdf(supabase, invoice.id);

    const results = await Promise.all(
      recipients.map((recipient) =>
        sendInvoiceToClient(
          recipient.email,
          invoice.client?.full_name ?? "there",
          invoice.reference,
          formatPence(invoice.total_pence),
          invoice.id,
          invoice.due_date ? formatDate(invoice.due_date) : null,
          pdf ?? undefined,
        ),
      ),
    );

    const failed = results.filter((result) => !result.sent);

    if (failed.length === results.length) {
      warning = `The invoice is marked as sent, but the email did not go out. ${explainSendFailure(failed[0]?.error)} Print it or ring them.`;
    } else if (failed.length > 0) {
      warning = `The invoice went to ${results.length - failed.length} of ${results.length} people on this account. ${explainSendFailure(failed[0]?.error)}`;
    }
  } else {
    warning = "Nobody on this account has an email address, so nothing was sent. Print it or add one.";
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app", "layout");

  return { ok: true, warning };
}

/**
 * Resends an already-sent invoice — for when it turns out the first one went
 * to the wrong address. Uses the client's current email, not whatever was on
 * file at the original send, so fixing the record first (on their customer
 * page) is what makes this land correctly.
 */
export async function resendInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, reference, total_pence, due_date, sent_at, client:clients(full_name, email)")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !invoice || !invoice.sent_at) {
    return { ok: false, formError: "Could not resend that invoice. Try again." };
  }

  if (!invoice.client?.email) {
    return { ok: false, formError: "This customer still has no email address on file." };
  }

  const pdf = await buildInvoicePdf(supabase, invoice.id);
  const sent = await sendInvoiceToClient(
    invoice.client.email,
    invoice.client.full_name,
    invoice.reference,
    formatPence(invoice.total_pence),
    invoice.id,
    invoice.due_date ? formatDate(invoice.due_date) : null,
    pdf ?? undefined,
  );

  if (!sent.sent) {
    return { ok: false, formError: "The email did not go out. Try again." };
  }

  return { ok: true };
}

/**
 * A draft has never been seen by a customer, so removing it from view is
 * enough — it is soft-deleted like everything else financial, never
 * hard-deleted (spec FR-58 / NFR-24). The `status = "draft"` guard means a
 * sent invoice can never be made to disappear this way; that needs a credit
 * note instead.
 */
export async function deleteDraftInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, formError: "Could not delete that draft. Try again." };
  }

  revalidatePath("/app/invoices");
  revalidatePath("/app", "layout");

  return { ok: true };
}

/**
 * Records a payment (spec FR-53).
 *
 * Only inserts the payment row. The invoice's paid total, its status, and the
 * parent job's status are all recalculated by trigger, so a part payment
 * cannot leave the three disagreeing (spec FR-54, FR-55, AC-8, AC-9).
 */
/**
 * Cancels a sent invoice that should never have gone out: wrong customer,
 * wrong job, raised twice. It stays on file marked Cancelled — an issued
 * invoice number is never reused or deleted — but stops asking for money:
 * no bank details, no reminders, no "still to pay".
 *
 * Only while nothing has been paid on it. Once money has come in, cancelling
 * would leave a payment attached to an invoice that says nothing is owed.
 */
export async function voidInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId)
    .in("status", ["sent", "overdue"])
    .eq("paid_pence", 0)
    .is("deleted_at", null)
    .select("id, reference, job_id, client:clients(full_name, email)")
    .maybeSingle();

  if (error || !invoice) {
    if (error) console.error("[invoice] void failed", error);
    return {
      ok: false,
      formError:
        "Only a sent invoice with nothing paid on it can be cancelled. A draft can simply be deleted.",
    };
  }

  // The job said "invoice sent". With this one cancelled and no other live
  // invoice on it, it is back to done-but-not-billed, ready for a new one.
  if (invoice.job_id) {
    const { data: others } = await supabase
      .from("invoices")
      .select("id")
      .eq("job_id", invoice.job_id)
      .is("deleted_at", null)
      .not("status", "in", "(draft,void)")
      .limit(1);

    if (!others?.length) {
      await supabase
        .from("jobs")
        .update({ status: "completed" })
        .eq("id", invoice.job_id)
        .eq("status", "invoiced");
    }

    revalidatePath(`/app/jobs/${invoice.job_id}`);
  }

  if (formData.get("notify") === "on" && invoice.client?.email) {
    const notice = await sendDocumentNotice(
      invoice.client.email,
      invoice.client.full_name,
      `Invoice ${invoice.reference} cancelled`,
      "Invoice cancelled",
      [
        `We have cancelled invoice ${invoice.reference}, so there is nothing to pay on it.`,
        "If a corrected invoice is due, it will come separately.",
      ],
      { href: `/invoices/view/${invoiceId}`, label: "See the invoice" },
    );
    if (!notice.sent) console.error("[invoice] cancel notice did not send", notice.error);
  }

  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app/invoices");
  revalidatePath(`/invoices/view/${invoiceId}`);
  revalidatePath("/app", "layout");

  return { ok: true, id: invoiceId };
}

export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();

  const parsed = paymentSchema.safeParse({
    invoice_id: formData.get("invoice_id") ?? "",
    amount_pence: formData.get("amount_pence") ?? "",
    method: formData.get("method") ?? "bank_transfer",
    paid_on: formData.get("paid_on") ?? "",
    reference: formData.get("reference") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // Money only lands on an invoice the customer has actually been sent. A
  // payment on a draft or a cancelled one would be invisible in every total.
  const { data: target } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", parsed.data.invoice_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!target) return { ok: false, formError: "That invoice no longer exists." };
  if (target.status === "draft") {
    return { ok: false, formError: "Send the invoice before recording a payment against it." };
  }
  if (target.status === "void") {
    return { ok: false, formError: "This invoice was cancelled, so it cannot take a payment." };
  }

  const { error } = await supabase.from("payments").insert({
    invoice_id: parsed.data.invoice_id,
    amount_pence: parsed.data.amount_pence,
    method: parsed.data.method,
    paid_on: parsed.data.paid_on,
    reference: parsed.data.reference || null,
    note: parsed.data.note || null,
    recorded_by: user.id,
  });

  if (error) {
    return { ok: false, formError: "Could not record that payment. Try again." };
  }

  // Move the job to paid if the invoice is now settled in full.
  //
  // `paid_pence` is maintained by a trigger, so this read happens after the
  // insert above and reflects it — including any earlier part payments.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("reference, status, job_id, total_pence, paid_pence, client:clients(full_name, email)")
    .eq("id", parsed.data.invoice_id)
    .maybeSingle();

  if (invoice?.status === "paid" && invoice.job_id) {
    const { error: jobError } = await supabase
      .from("jobs")
      .update({ status: "paid" })
      .eq("id", invoice.job_id);
    if (jobError) console.error("[payment] job status not moved to paid", jobError.message);
  }

  // Tell the customer their money arrived.
  //
  // Bank transfer is the only method here, and it gives the payer no receipt
  // from anyone — they push the money into the void and hear nothing back.
  // Until now this app knew the payment had landed and never said so.
  //
  // A failure here is logged, never surfaced: the payment is recorded, which is
  // what the owner asked for, and an email that did not send is not a reason to
  // make them think it wasn't.
  // The owner can untick "Email them a receipt" (a payment recorded to tidy
  // up, a cash job where the customer was handed a paper one). Absent means
  // send, so older forms and the offline queue behave as before.
  const sendReceipt = formData.get("receipt") !== "skip";

  if (sendReceipt && invoice?.client?.email) {
    const receipt = await sendPaymentReceipt(
      invoice.client.email,
      invoice.client.full_name,
      invoice.reference,
      parsed.data.amount_pence,
      invoice.total_pence - invoice.paid_pence,
      parsed.data.invoice_id,
    );

    if (!receipt.sent) {
      console.error("[payment] receipt did not send:", receipt.error);
    }
  }

  // Through the RPC, not a direct insert. `audit_log` has no INSERT policy for
  // `authenticated` by design, so writing to it straight from here failed
  // silently — the payment saved and the audit entry did not.
  const { error: auditError } = await supabase.rpc("record_audit_entry", {
    p_action: "payment.recorded",
    p_entity: "invoice",
    p_entity_id: parsed.data.invoice_id,
    p_detail: { amount_pence: parsed.data.amount_pence, method: parsed.data.method },
  });

  // Logged, not surfaced: the payment is recorded, which is what was asked for.
  if (auditError) console.error("[payment] audit entry failed", auditError.message);

  revalidatePath(`/app/invoices/${parsed.data.invoice_id}`);
  revalidatePath("/app", "layout");

  return { ok: true };
}

/**
 * Takes back a payment entered by mistake: wrong amount, wrong invoice, or
 * money that never actually arrived. The totals trigger recalculates what is
 * owed and the invoice's status (paid back to part paid or sent), and the
 * removal is written to the audit log with what was removed, so a payment
 * never disappears without trace.
 */
export async function deletePayment(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const paymentId = String(formData.get("payment_id") ?? "");
  if (!paymentId) return { ok: false, formError: "Missing payment." };

  const supabase = await createClient();

  const { data: payment, error } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId)
    .select("invoice_id, amount_pence, method, paid_on, reference")
    .maybeSingle();

  if (error || !payment) {
    if (error) console.error("[payment] delete failed", error);
    return { ok: false, formError: "Could not remove that payment. Try again." };
  }

  const { error: auditError } = await supabase.rpc("record_audit_entry", {
    p_action: "payment.removed",
    p_entity: "invoice",
    p_entity_id: payment.invoice_id,
    p_detail: {
      amount_pence: payment.amount_pence,
      method: payment.method,
      paid_on: payment.paid_on,
      reference: payment.reference,
    },
  });
  if (auditError) console.error("[payment] audit entry failed", auditError.message);

  // The trigger puts an unpaid invoice back to "sent"; if it is past its due
  // date it should read overdue straight away, not on the next list visit.
  await supabase.rpc("mark_overdue_invoices");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, job_id, reference, total_pence, paid_pence, client:clients(full_name, email)")
    .eq("id", payment.invoice_id)
    .maybeSingle();

  if (formData.get("notify") === "on" && invoice?.client?.email) {
    const notice = await sendDocumentNotice(
      invoice.client.email,
      invoice.client.full_name,
      `Correction to invoice ${invoice.reference}`,
      "A correction to your invoice",
      [
        `A payment of ${formatPence(payment.amount_pence)} was recorded against invoice ${invoice.reference} by mistake, and we have removed it.`,
        invoice.total_pence - invoice.paid_pence > 0
          ? `The invoice now shows ${formatPence(invoice.total_pence - invoice.paid_pence)} still to pay. Sorry for any confusion.`
          : "Sorry for any confusion.",
      ],
      { href: `/invoices/view/${payment.invoice_id}`, label: "See the invoice" },
    );
    if (!notice.sent) console.error("[payment] correction notice did not send", notice.error);
  }

  // A job marked paid because of this payment is not paid any more.
  if (invoice?.job_id && invoice.status !== "paid") {
    await supabase
      .from("jobs")
      .update({ status: "invoiced" })
      .eq("id", invoice.job_id)
      .eq("status", "paid");
    revalidatePath(`/app/jobs/${invoice.job_id}`);
  }

  revalidatePath(`/app/invoices/${payment.invoice_id}`);
  revalidatePath("/app/invoices");
  revalidatePath("/app", "layout");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Carries new payment and contact details onto invoices still waiting to be
 * paid. Without this, changing bank account in Settings left every unpaid
 * invoice telling the customer to pay the old one. Names, addresses and tax
 * numbers stay as issued; paid and void invoices are left alone entirely.
 */
async function refreshUnpaidInvoicePaymentDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  const [{ data: settings }, { data: invoices, error }] = await Promise.all([
    supabase.from("settings").select("*").maybeSingle(),
    supabase
      .from("invoices")
      .select("id, business_snapshot")
      .in("status", [...UNPAID_ISSUED_STATUSES])
      .is("deleted_at", null),
  ]);

  if (error || !settings || !invoices) {
    if (error) console.error("[settings] unpaid invoice lookup failed", error);
    return;
  }

  const live = businessSnapshot(settings);

  for (const invoice of invoices) {
    const snapshot = { ...((invoice.business_snapshot ?? live) as Record<string, unknown>) };
    let changed = false;
    for (const field of LIVE_PAYMENT_FIELDS) {
      if (snapshot[field] !== live[field]) {
        snapshot[field] = live[field];
        changed = true;
      }
    }
    if (!changed) continue;

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ business_snapshot: snapshot })
      .eq("id", invoice.id);
    if (updateError) console.error("[settings] invoice refresh failed", invoice.id, updateError);
  }
}

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = settingsSchema.safeParse({
    trading_name: formData.get("trading_name") ?? "",
    legal_name: formData.get("legal_name") ?? "",
    address_line1: formData.get("address_line1") ?? "",
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city") ?? "",
    postcode: formData.get("postcode") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    vat_registered: formData.get("vat_registered") === "on",
    vat_number: formData.get("vat_number") ?? "",
    default_vat_rate_bp: formData.get("default_vat_rate_bp") ?? "2000",
    cis_enabled: formData.get("cis_enabled") === "on",
    cis_deduction_rate_bp: formData.get("cis_deduction_rate_bp") ?? "2000",
    utr: formData.get("utr") ?? "",
    bank_account_name: formData.get("bank_account_name") ?? "",
    bank_sort_code: formData.get("bank_sort_code") ?? "",
    bank_account_number: formData.get("bank_account_number") ?? "",
    payment_terms_days: formData.get("payment_terms_days") ?? "14",
    quote_valid_days: formData.get("quote_valid_days") ?? "30",
    invoice_footer_note: formData.get("invoice_footer_note") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("settings")
    .select("vat_registered, cis_enabled, cis_deduction_rate_bp")
    .maybeSingle();

  const { error } = await supabase
    .from("settings")
    .update({
      ...parsed.data,
      legal_name: parsed.data.legal_name || null,
      vat_number: parsed.data.vat_number || null,
      utr: parsed.data.utr || null,
      bank_sort_code: parsed.data.bank_sort_code || null,
      bank_account_number: parsed.data.bank_account_number || null,
    })
    .eq("id", true);

  if (error) {
    console.error("[settings] update failed", error);
    return {
      ok: false,
      formError:
        error.message.includes("vat_number_required")
          ? "A VAT number is required once you mark the business VAT-registered."
          : error.message.includes("utr_required")
            ? "Your UTR is required once CIS is switched on."
            : "Could not save those settings. Try again.",
    };
  }

  await refreshUnpaidInvoicePaymentDetails(supabase);

  // Drafts were priced under the old tax rules; bring them up to date.
  if (
    before &&
    (before.vat_registered !== parsed.data.vat_registered ||
      before.cis_enabled !== parsed.data.cis_enabled ||
      before.cis_deduction_rate_bp !== parsed.data.cis_deduction_rate_bp)
  ) {
    const { error: recalcError } = await supabase.rpc("recalc_draft_totals");
    if (recalcError) console.error("[settings] draft totals not recalculated", recalcError.message);
    revalidatePath("/app/quotes");
    revalidatePath("/app/invoices");
  }

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  revalidatePath("/invoices/view/[id]", "page");

  // The public site reads the phone number and email from this same row, so a
  // change here has to reach the marketing pages too. Without this the owner
  // would update their number, see it correct in the app, and the website would
  // keep showing the old one until the hourly revalidate happened to fire —
  // which is precisely the sort of "it didn't work" that erodes trust in the
  // whole tool. The layout scope covers the header and footer on every page.
  revalidatePath("/", "layout");
  revalidatePath("/request");
  revalidatePath("/sign-in");

  return { ok: true };
}
