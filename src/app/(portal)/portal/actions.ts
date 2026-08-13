"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import {
  fieldErrors,
  messageSchema,
  myDetailsSchema,
  quoteResponseSchema,
} from "@/lib/validation";
import { sendQuoteResponseToOwner } from "@/lib/email";

export interface ActionResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

/**
 * Accept a quote.
 *
 * Delegates to the `accept_quote` database function rather than doing the work
 * here. That function is SECURITY DEFINER and re-checks ownership itself, so
 * the atomic part — accept this quote, expire its siblings, move the job — all
 * happens in one transaction that cannot half-succeed (spec FR-23, AC-4).
 *
 * Note what is absent: no total, no price, no line items. There is nothing in
 * this payload for a crafted request to tamper with (spec AC-5).
 */
export async function acceptQuote(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const parsed = quoteResponseSchema.safeParse({
    quote_id: formData.get("quote_id") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_quote", { p_quote_id: parsed.data.quote_id });

  if (error) {
    console.error("[portal] accept quote failed", error.message);
    return {
      ok: false,
      formError:
        error.message.includes("no longer open")
          ? "This quote is no longer open for a response. Give us a ring and we will sort it out."
          : "We could not record that just now. Try again, or ring us on 07934 633583.",
    };
  }

  await notifyOwnerOfResponse(parsed.data.quote_id, true, null);

  revalidatePath("/portal", "layout");

  return { ok: true };
}

/** Decline a quote, with an optional reason. */
export async function declineQuote(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const parsed = quoteResponseSchema.safeParse({
    quote_id: formData.get("quote_id") ?? "",
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("decline_quote", {
    p_quote_id: parsed.data.quote_id,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    console.error("[portal] decline quote failed", error.message);
    return {
      ok: false,
      formError:
        error.message.includes("no longer open")
          ? "This quote is no longer open for a response."
          : "We could not record that just now. Try again, or ring us on 07934 633583.",
    };
  }

  await notifyOwnerOfResponse(parsed.data.quote_id, false, parsed.data.reason ?? null);

  revalidatePath("/portal", "layout");

  return { ok: true };
}

/**
 * Tells the owner a quote was answered.
 *
 * Uses the admin client because the client's own session cannot read the
 * owner's notification address, and reads only the four fields the email
 * needs. A failure here is logged and swallowed — the response is already
 * recorded, and losing an email must never undo it.
 */
async function notifyOwnerOfResponse(
  quoteId: string,
  accepted: boolean,
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: quote } = await admin
      .from("quotes")
      .select("reference, job_id, client_id")
      .eq("id", quoteId)
      .maybeSingle();

    if (!quote) return;

    const { data: client } = await admin
      .from("clients")
      .select("full_name")
      .eq("id", quote.client_id)
      .maybeSingle();

    await sendQuoteResponseToOwner(
      quote.reference,
      client?.full_name ?? "A customer",
      accepted,
      reason,
      quote.job_id,
    );
  } catch (error) {
    console.error("[portal] owner notification failed", error);
  }
}

/**
 * Lets a customer correct their own contact details.
 *
 * No client id is accepted from the form. The update is scoped by
 * `profile_id = auth.uid()` and the matching RLS policy re-applies that at the
 * database, so there is no id here for a crafted request to point at somebody
 * else's record.
 */
export async function updateMyDetails(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = myDetailsSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    company_name: formData.get("company_name") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      company_name: parsed.data.company_name || null,
    })
    .eq("profile_id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("[portal] details update failed", error.message);
    return {
      ok: false,
      formError: "We could not save that just now. Try again, or ring us on 07934 633583.",
    };
  }

  revalidatePath("/portal/details");

  return { ok: true };
}

/** Post a message on a job. Both sides read the same thread (spec FR-27). */
export async function postMessage(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = messageSchema.safeParse({
    job_id: formData.get("job_id") ?? "",
    body: formData.get("body") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();

  // RLS decides whether this job belongs to the caller. If it does not, the
  // insert simply fails — there is no ownership check to forget here.
  const { error } = await supabase.from("messages").insert({
    job_id: parsed.data.job_id,
    sender_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    console.error("[portal] message failed", error.message);
    return {
      ok: false,
      formError: "Your message did not send. Try again, or ring us on 07934 633583.",
    };
  }

  // Tell the OTHER side. This one action serves both the owner's job page and
  // the customer's portal — same component, same thread — so who to notify
  // depends on who sent it, not on which screen it came from.
  //
  // Without this the thread is silent in both directions: the owner writes
  // "move the car off the drive before Tuesday" and reasonably assumes it was
  // read, while the customer never knew it existed.
  try {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, reference, client:clients(full_name)")
      .eq("id", parsed.data.job_id)
      .maybeSingle();

    const jobTitle = job?.title ?? "your job";

    if (user.role === "owner" || user.role === "staff") {
      const { notifyClientMessage } = await import("@/lib/notify-client");
      await notifyClientMessage(parsed.data.job_id, jobTitle, parsed.data.body);
    } else {
      // Email AND push, matching the other direction. Push alone meant a
      // customer's reply reached nothing at all on any device where
      // notifications had not been switched on — the same silent failure the
      // enquiry alert already had. Email is the floor; push makes it immediate.
      const [{ sendOwnerMessageNotification }, { pushToStaff }] = await Promise.all([
        import("@/lib/email"),
        import("@/lib/push"),
      ]);

      const preview =
        parsed.data.body.length > 120
          ? `${parsed.data.body.slice(0, 117).trimEnd()}…`
          : parsed.data.body;

      const clientName = job?.client?.full_name ?? "A customer";

      await Promise.all([
        sendOwnerMessageNotification(
          clientName,
          jobTitle,
          job?.reference ?? "",
          parsed.data.body,
          parsed.data.job_id,
        ),
        pushToStaff({
          title: `${clientName} replied`,
          body: preview,
          url: `/app/jobs/${parsed.data.job_id}`,
          tag: `job-${parsed.data.job_id}`,
        }),
      ]);
    }
  } catch (notifyError) {
    // The message is already saved. Failing to announce it must not lose it.
    console.error("[portal] message notification failed", notifyError);
  }

  revalidatePath(`/portal/jobs/${parsed.data.job_id}`);

  return { ok: true };
}

/**
 * The customer's own notification preferences.
 *
 * Written with the caller's session client, so the "client updates own contact
 * details" RLS policy is what scopes it to their own row — there is no client
 * id in the payload for a crafted request to swap.
 */
export async function updateNotificationPreferences(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const supabase = await createClient();

  // An unchecked box submits nothing at all, so absence means false. Reading
  // them positively rather than trusting a hidden companion field keeps the
  // form honest even if the markup changes.
  const { error } = await supabase
    .from("clients")
    .update({
      notify_booking: formData.get("notify_booking") === "on",
      notify_messages: formData.get("notify_messages") === "on",
      notify_completion: formData.get("notify_completion") === "on",
    })
    // Scoped explicitly, not left to RLS alone. The policy would catch it, but
    // a filter that reads "every client with a login" is one policy change away
    // from rewriting everybody's preferences at once.
    .eq("profile_id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("[portal] preferences failed", error.message);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidatePath("/portal/details");

  return { ok: true };
}
