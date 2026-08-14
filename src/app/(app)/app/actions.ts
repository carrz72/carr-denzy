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
import {
  explainSendFailure,
  sendInvoiceToClient,
  sendPortalInvite,
  sendQuoteToClient,
} from "@/lib/email";
import { renderInvoicePdf, renderQuotePdf } from "@/lib/invoice-pdf";
import { notifyClientBooked, notifyClientCompleted } from "@/lib/notify-client";
import { formatPence } from "@/lib/money";
import { addDaysToToday, formatDate } from "@/lib/dates";

export interface ActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
  warning?: string;
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

  if (!enquiryId) return { ok: false, formError: "Missing enquiry." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("enquiries")
    .update({ status: "declined", decline_reason: reason || null })
    .eq("id", enquiryId);

  if (error) {
    return { ok: false, formError: "Could not update that enquiry. Try again." };
  }

  revalidatePath("/app/enquiries");
  revalidatePath("/app", "layout");

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
      scheduled_start: booked ? `${parsed.data.date}T${parsed.data.time}:00` : null,
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
  await requireStaff();

  const parsed = jobStatusSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    status: formData.get("status") ?? "",
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

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

    if (job) await notifyClientCompleted(parsed.data.job_id, job.title);
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);
  revalidatePath("/app", "layout");

  return { ok: true };
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

  // Times are entered in local London time. Storing the naive string lets
  // Postgres apply the zone, so a 09:00 booking stays 09:00 across the clock
  // change rather than sliding to 08:00.
  const startsAt = `${parsed.data.date}T${parsed.data.time}:00`;
  const endsAt = new Date(
    new Date(startsAt).getTime() + parsed.data.duration_minutes * 60_000,
  ).toISOString();

  if (!parsed.data.confirm_overlap) {
    const { data: clashes } = await supabase
      .from("jobs")
      .select("id, title, scheduled_start")
      .is("deleted_at", null)
      .neq("id", parsed.data.job_id)
      .not("scheduled_start", "is", null)
      .gte("scheduled_start", `${parsed.data.date}T00:00:00`)
      .lte("scheduled_start", `${parsed.data.date}T23:59:59`);

    const overlap = (clashes ?? []).find((job) => {
      if (!job.scheduled_start) return false;
      const otherStart = new Date(job.scheduled_start).getTime();
      return otherStart >= new Date(startsAt).getTime() && otherStart < new Date(endsAt).getTime();
    });

    if (overlap) {
      return {
        ok: false,
        warning: `You already have "${overlap.title}" booked around then. Save anyway?`,
      };
    }
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      scheduled_start: startsAt,
      duration_minutes: parsed.data.duration_minutes,
      status: "scheduled",
    })
    .eq("id", parsed.data.job_id);

  if (error) {
    return { ok: false, formError: friendly(error.message, "Could not book that in. Try again.") };
  }

  // Tell the customer. "When are you coming?" is the question they ring about
  // most, and until now the app knew the answer and never volunteered it.
  const { data: booked } = await supabase
    .from("jobs")
    .select(`title, property:properties(address_line1, address_line2, city, postcode)`)
    .eq("id", parsed.data.job_id)
    .maybeSingle();

  if (booked) {
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
    );
  }

  revalidatePath(`/app/jobs/${parsed.data.job_id}`);
  revalidatePath("/app", "layout");

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

/** Sends a draft quote to the customer. */
export async function sendQuote(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const quoteId = String(formData.get("quote_id") ?? "");
  if (!quoteId) return { ok: false, formError: "Missing quote." };

  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "draft")
    .select("id, reference, total_pence, valid_until, job_id, client:clients(full_name, email)")
    .single();

  if (error || !quote) {
    return { ok: false, formError: friendly(error?.message, "Could not send that quote. Try again.") };
  }

  await supabase.from("jobs").update({ status: "quoted" }).eq("id", quote.job_id);

  let warning: string | undefined;

  if (quote.client?.email) {
    // Best-effort. A PDF that fails to render must not stop the quote being
    // sent — the link in the email is the thing that actually wins the job,
    // and the attachment is a convenience for people who forward it on.
    const pdf = await buildQuotePdf(quoteId).catch((pdfError) => {
      console.error("[quote] pdf render failed", pdfError);
      return undefined;
    });

    const sent = await sendQuoteToClient(
      quote.client.email,
      quote.client.full_name,
      quote.reference,
      formatPence(quote.total_pence),
      quote.id,
      quote.valid_until ? formatDate(quote.valid_until) : null,
      pdf,
    );

    // The quote is sent either way — the status is already updated. The owner
    // just needs to know to pick up the phone (spec E-15).
    if (!sent.sent) {
      warning = `The quote is marked as sent, but the email did not go out. ${explainSendFailure(sent.error)} Ring them, or copy the link.`;
    }
  } else {
    warning = "This customer has no email address, so nothing was sent. Ring them or add an email.";
  }

  revalidatePath(`/app/jobs/${quote.job_id}`);
  revalidatePath("/app", "layout");

  return { ok: true, warning };
}

/**
 * Renders a quote as a PDF, using the same document as invoices.
 *
 * Reads the business details live from `settings` rather than from a snapshot,
 * because unlike an invoice a quote is not a permanent financial record — it is
 * an offer, and if the phone number changed between quoting and the customer
 * opening the PDF, the newer one is the more useful of the two.
 */
async function buildQuotePdf(quoteId: string): Promise<Buffer | undefined> {
  const supabase = await createClient();

  const [{ data: quote }, { data: business }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        `reference, sent_at, valid_until, subtotal_pence, tax_pence, total_pence, intro_note,
         client:clients(full_name, company_name),
         job:jobs(property:properties(address_line1, address_line2, city, postcode)),
         items:quote_items(description, kind, quantity_milli, unit_price_pence, vat_rate_bp, sort_order)`,
      )
      .eq("id", quoteId)
      .maybeSingle(),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  if (!quote) return undefined;

  const address = quote.job?.property;

  return renderQuotePdf({
    reference: quote.reference,
    issueDate: quote.sent_at,
    dueDate: quote.valid_until,
    business: business as Record<string, unknown> | null,
    customerName: quote.client?.full_name ?? "your customer",
    customerCompany: quote.client?.company_name ?? null,
    customerAddress: address
      ? [address.address_line1, address.address_line2, address.city, address.postcode]
          .filter(Boolean)
          .join(", ")
      : null,
    items: [...(quote.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    subtotalPence: quote.subtotal_pence,
    vatPence: quote.tax_pence,
    cisDeductionPence: 0,
    cisDeductionRateBp: business?.cis_deduction_rate_bp ?? 0,
    totalPence: quote.total_pence,
    vatRegistered: business?.vat_registered ?? false,
    // CIS is deducted when an invoice is paid, never on a quote — the customer
    // is being shown the price of the work, not a subcontractor settlement.
    cisEnabled: false,
    reverseCharge: false,
    notes: quote.intro_note,
    footerNote: null,
  });
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
      business_snapshot: settings
        ? {
            trading_name: settings.trading_name,
            legal_name: settings.legal_name,
            address_line1: settings.address_line1,
            address_line2: settings.address_line2,
            city: settings.city,
            postcode: settings.postcode,
            phone: settings.phone,
            email: settings.email,
            vat_registered: settings.vat_registered,
            vat_number: settings.vat_number,
            cis_enabled: settings.cis_enabled,
            utr: settings.utr,
            bank_account_name: settings.bank_account_name,
            bank_sort_code: settings.bank_sort_code,
            bank_account_number: settings.bank_account_number,
            invoice_footer_note: settings.invoice_footer_note,
          }
        : null,
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
 * Builds the PDF copy attached to an invoice email. Reads back everything
 * needed for `money-document.tsx`'s figures — the same source the portal and
 * print pages use — so the attachment can never disagree with what the
 * customer sees on the invoice page. Returns null rather than throwing: a
 * missing attachment is not worth losing the whole send over.
 */
async function buildInvoicePdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<Buffer | null> {
  const [{ data: invoice, error: invoiceError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          `reference, issue_date, due_date, business_snapshot, client_snapshot,
           subtotal_pence, vat_pence, cis_deduction_pence, total_pence, paid_pence,
           reverse_charge, notes, status, client:clients(full_name)`,
        )
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("settings")
        .select("vat_registered, cis_enabled, cis_deduction_rate_bp")
        .maybeSingle(),
    ]);

  if (!invoice || !settings) {
    console.error("[invoice] pdf skipped: missing data", {
      invoiceError: invoiceError?.message,
      settingsError: settingsError?.message,
      hasInvoice: !!invoice,
      hasSettings: !!settings,
    });
    return null;
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description, kind, quantity_milli, unit_price_pence, vat_rate_bp")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  const business = (invoice.business_snapshot ?? {}) as Record<string, unknown>;
  const clientSnapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const snapshotAddress = clientSnapshot.address as Record<string, string | null> | null;
  const footerNote =
    typeof business.invoice_footer_note === "string" ? business.invoice_footer_note : null;

  try {
    return await renderInvoicePdf({
      reference: invoice.reference,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      business,
      customerName:
        (clientSnapshot.full_name as string | null) ?? invoice.client?.full_name ?? "your customer",
      customerCompany: (clientSnapshot.company_name as string | null) ?? null,
      customerAddress: snapshotAddress
        ? [
            snapshotAddress.address_line1,
            snapshotAddress.address_line2,
            snapshotAddress.city,
            snapshotAddress.postcode,
          ]
            .filter(Boolean)
            .join(", ")
        : null,
      items: items ?? [],
      subtotalPence: invoice.subtotal_pence,
      vatPence: invoice.vat_pence,
      cisDeductionPence: invoice.cis_deduction_pence,
      cisDeductionRateBp: settings.cis_deduction_rate_bp,
      totalPence: invoice.total_pence,
      paidPence: invoice.paid_pence,
      vatRegistered: settings.vat_registered,
      cisEnabled: settings.cis_enabled,
      reverseCharge: invoice.reverse_charge,
      notes: invoice.notes,
      footerNote,
      settled: invoice.status === "paid" || invoice.status === "void",
    });
  } catch (pdfError) {
    console.error("[invoice] pdf generation failed", pdfError);
    return null;
  }
}

export async function sendInvoice(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return { ok: false, formError: "Missing invoice." };

  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id, reference, total_pence, due_date, job_id, client:clients(full_name, email)")
    .single();

  if (error || !invoice) {
    return {
      ok: false,
      formError: friendly(error?.message, "Could not send that invoice. Try again."),
    };
  }

  if (invoice.job_id) {
    await supabase.from("jobs").update({ status: "invoiced" }).eq("id", invoice.job_id);
  }

  let warning: string | undefined;

  if (invoice.client?.email) {
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
      warning = `The invoice is marked as sent, but the email did not go out. ${explainSendFailure(sent.error)} Print it or ring them.`;
    }
  } else {
    warning = "This customer has no email address, so nothing was sent. Print it or add an email.";
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
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, job_id")
    .eq("id", parsed.data.invoice_id)
    .maybeSingle();

  if (invoice?.status === "paid" && invoice.job_id) {
    await supabase.from("jobs").update({ status: "paid" }).eq("id", invoice.job_id);
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

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

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

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");

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
