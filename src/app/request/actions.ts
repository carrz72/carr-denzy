"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEnquiryConfirmation, sendOwnerEnquiryNotification } from "@/lib/email";
import { enquirySchema, fieldErrors } from "@/lib/validation";
import { getMyClient } from "@/lib/auth";
import { getService } from "@/lib/site";

/**
 * Enquiry submission.
 *
 * Runs as a server action, so there is no public API route to protect
 * separately. The order of the checks below is deliberate: the honeypot and
 * the rate limit are cheap and run before validation, so a bot flood never
 * reaches the database.
 *
 * Uses the service-role client because the submitter is anonymous and the
 * enquiry has to be joined to photographs and to the owner's inbox. The
 * anon-insert RLS policy exists as well and constrains the same columns — this
 * path is validated in application code AND at the database, not either/or.
 */

export interface EnquiryResult {
  ok: boolean;
  reference?: string;
  errors?: Record<string, string>;
  formError?: string;
}

export async function submitEnquiry(formData: FormData): Promise<EnquiryResult> {
  // --- 1. Honeypot ------------------------------------------------------
  // A real person never sees this field. Anything in it is automated.
  // Returns a plausible success so the bot does not learn it was caught.
  const honeypot = String(formData.get("company_website") ?? "");
  if (honeypot.trim() !== "") {
    return { ok: true, reference: "ENQ-0000" };
  }

  // --- 2. Rate limit ----------------------------------------------------
  const { allowed, subject } = await checkRateLimit("enquiry", 5, 60);

  if (!allowed) {
    return {
      ok: false,
      formError:
        "We have had several requests from this connection in the last hour. Please call 07934 633583 and we will help you straight away.",
    };
  }

  // --- 3. Validate ------------------------------------------------------
  const photoPaths = formData
    .getAll("photo_paths")
    .map((value) => String(value))
    .filter(Boolean);

  const parsed = enquirySchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    service_slug: formData.get("service_slug") ?? "",
    service_label: formData.get("service_label") ?? "",
    description: formData.get("description") ?? "",
    urgency: formData.get("urgency") ?? "soon",
    address_line1: formData.get("address_line1") ?? "",
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city") ?? "",
    postcode: formData.get("postcode") ?? "",
    preferred_dates: formData.get("preferred_dates") ?? "",
    photo_paths: photoPaths,
    company_website: honeypot,
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const input = parsed.data;

  // --- 4. Persist -------------------------------------------------------
  try {
    const admin = createAdminClient();

    // Resolve the service slug to its row so the job inherits the category.
    // A slug that does not match is not an error — the free-text label still
    // tells the owner what the person thinks they need.
    let serviceId: string | null = null;

    if (input.service_slug) {
      const { data: service } = await admin
        .from("services")
        .select("id")
        .eq("slug", input.service_slug)
        .maybeSingle();

      serviceId = service?.id ?? null;
    }

    const serviceLabel =
      input.service_label?.trim() ||
      (input.service_slug ? getService(input.service_slug)?.name : undefined) ||
      null;

    const { data: enquiry, error } = await admin
      .from("enquiries")
      .insert({
        full_name: input.full_name,
        email: input.email || null,
        phone: input.phone || null,
        service_id: serviceId,
        service_label: serviceLabel,
        description: input.description,
        urgency: input.urgency,
        address_line1: input.address_line1 || null,
        address_line2: input.address_line2 || null,
        city: input.city || null,
        postcode: input.postcode || null,
        preferred_dates: input.preferred_dates || null,
        status: "new",
        source_ip_hash: subject,
      })
      .select("id, reference")
      .single();

    if (error || !enquiry) {
      console.error("[enquiry] insert failed", error);
      return {
        ok: false,
        formError:
          "Something went wrong at our end and your request was not saved. Nothing you typed has been lost — try again, or call 07934 633583.",
      };
    }

    // --- 4b. Attach it to the person's account, if they have one ---------
    //
    // The insert above goes through the admin client because a stranger with a
    // burst pipe has no session. But a signed-in customer — a landlord putting
    // in a third request this month — should not have their enquiry land as an
    // anonymous one. Linking it here means it appears in their portal straight
    // away, and converting it later reuses their existing customer record
    // rather than creating a duplicate.
    //
    // The client id comes from the session, never from the form, so this cannot
    // be used to file an enquiry against somebody else.
    try {
      const sessionClient = await getMyClient();

      if (sessionClient) {
        await admin
          .from("enquiries")
          .update({ client_id: sessionClient.id })
          .eq("id", enquiry.id);
      }
    } catch (linkError) {
      // A failure here costs the convenience, not the enquiry.
      console.error("[enquiry] could not link to account", linkError);
    }

    // --- 5. Attach photographs ------------------------------------------
    // The files are already in storage; this links them to the enquiry. A
    // failure here must not lose the enquiry itself, so it is logged and
    // swallowed rather than thrown.
    if (photoPaths.length > 0) {
      const { error: photoError } = await admin.from("job_photos").insert(
        photoPaths.slice(0, 6).map((path) => ({
          enquiry_id: enquiry.id,
          storage_path: path,
          visible_to_client: true,
        })),
      );

      if (photoError) {
        console.error("[enquiry] photo link failed", photoError);
      }
    }

    // --- 6. Notify ------------------------------------------------------
    // Email failure never fails the submission (spec E-15). The enquiry is
    // already saved and visible in the owner's inbox either way.
    await sendOwnerEnquiryNotification({
      reference: enquiry.reference,
      fullName: input.full_name,
      description: input.description,
      urgency: input.urgency,
      phone: input.phone || null,
      email: input.email || null,
      postcode: input.postcode || null,
      enquiryId: enquiry.id,
    });

    if (input.email) {
      await sendEnquiryConfirmation(
        input.email,
        enquiry.reference,
        input.full_name,
        input.urgency,
      );
    }

    return { ok: true, reference: enquiry.reference };
  } catch (error) {
    console.error("[enquiry] unhandled", error);
    return {
      ok: false,
      formError:
        "We could not reach our system just then. Nothing you typed has been lost — try again in a moment, or call 07934 633583.",
    };
  }
}
