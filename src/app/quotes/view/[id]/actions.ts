"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendQuoteResponseToOwner } from "@/lib/email";
import { fieldErrors } from "@/lib/validation";

/**
 * Accepting or declining a quote from the emailed link, with no account.
 *
 * The caller is anonymous by design, so everything that would normally be
 * carried by a session has to be established here instead:
 *
 *   * The quote id IS the credential. It is a 128-bit UUID that appears
 *     nowhere except the email it was sent in. Same model as the invoice view
 *     link already in production.
 *   * The database functions this calls are granted to nobody — not `anon`,
 *     not `authenticated`. They are reachable only through the service-role
 *     key used below, which means the rate limit in front of them cannot be
 *     routed around by hitting PostgREST directly with the publishable key.
 *   * Only a quote in `sent` status can be answered, enforced in SQL with a
 *     row lock, so a double tap on a flaky mobile connection cannot accept
 *     twice or accept something already declined.
 *   * The responder's IP is hashed and stored as evidence of the agreement.
 *     Never the raw address.
 */

const responseSchema = z.object({
  quote_id: z.string().uuid("That link does not look right"),
  reason: z.string().trim().max(1000).optional(),
});

export interface LinkResponseResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
}

/**
 * Shared guard: rate limit, then validate.
 *
 * An explicit discriminated union on `ok` rather than an `in` check — the
 * latter does not narrow reliably when one arm has optional properties, and
 * the compiler was letting `undefined` through as a valid result.
 */
type Prepared =
  | { ok: false; failure: LinkResponseResult }
  | { ok: true; input: { quote_id: string; reason?: string }; ipHash: string };

async function prepare(formData: FormData): Promise<Prepared> {
  // Twelve an hour per connection. Generous for a household where two people
  // open the same email, tight enough that the link is not a useful target.
  const { allowed, subject } = await checkRateLimit("quote-response", 12, 60);

  if (!allowed) {
    return {
      ok: false,
      failure: {
        ok: false,
        formError:
          "That has been tried several times from this connection. Please ring 07934 633583 and we will sort it out on the phone.",
      },
    };
  }

  const parsed = responseSchema.safeParse({
    quote_id: formData.get("quote_id") ?? "",
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, failure: { ok: false, errors: fieldErrors(parsed.error) } };
  }

  return { ok: true, input: parsed.data, ipHash: subject };
}

export async function acceptQuoteViaLink(formData: FormData): Promise<LinkResponseResult> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared.failure;

  const { input, ipHash } = prepared;
  const admin = createAdminClient();

  const { error } = await admin.rpc("accept_quote_via_link" as never, {
    p_quote_id: input.quote_id,
    p_ip_hash: ipHash,
  } as never);

  if (error) {
    console.error("[quote-link] accept failed", error.message);

    return {
      ok: false,
      formError: error.message.includes("no longer open")
        ? "This quote has already been answered. If that was not you, please ring 07934 633583."
        : "We could not record that just now. Try again, or ring 07934 633583.",
    };
  }

  await notifyOwner(input.quote_id, true, null);

  revalidatePath(`/quotes/view/${input.quote_id}`);
  revalidatePath("/app", "layout");

  return { ok: true };
}

export async function declineQuoteViaLink(formData: FormData): Promise<LinkResponseResult> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared.failure;

  const { input, ipHash } = prepared;
  const admin = createAdminClient();

  const { error } = await admin.rpc("decline_quote_via_link" as never, {
    p_quote_id: input.quote_id,
    p_reason: input.reason || null,
    p_ip_hash: ipHash,
  } as never);

  if (error) {
    console.error("[quote-link] decline failed", error.message);

    return {
      ok: false,
      formError: error.message.includes("no longer open")
        ? "This quote has already been answered."
        : "We could not record that just now. Try again, or ring 07934 633583.",
    };
  }

  await notifyOwner(input.quote_id, false, input.reason ?? null);

  revalidatePath(`/quotes/view/${input.quote_id}`);
  revalidatePath("/app", "layout");

  return { ok: true };
}

/**
 * Tells the owner the quote was answered.
 *
 * Swallows its own failures: the response is already recorded in the database,
 * and losing a notification email must never undo a customer's decision. The
 * owner still sees it on the dashboard either way.
 */
async function notifyOwner(
  quoteId: string,
  accepted: boolean,
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: quote } = await admin
      .from("quotes")
      .select("reference, job_id, client:clients(full_name)")
      .eq("id", quoteId)
      .maybeSingle();

    if (!quote) return;

    await sendQuoteResponseToOwner(
      quote.reference,
      quote.client?.full_name ?? "A customer",
      accepted,
      reason,
      quote.job_id,
    );
  } catch (error) {
    console.error("[quote-link] owner notification failed", error);
  }
}
