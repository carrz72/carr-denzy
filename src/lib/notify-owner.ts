import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { pushToStaff } from "@/lib/push";
import { sendQuoteResponseToOwner } from "@/lib/email";

/**
 * Telling the owner a customer answered a quote.
 *
 * One place, because there are two ways to answer one — signed into the portal,
 * or straight from the link in the email — and they were each carrying their
 * own near-identical copy of this. Two copies of a notification is how one of
 * them silently stops matching the other.
 *
 * It also fixes what those copies both got wrong: they sent an email and
 * nothing else. An accepted quote is the moment a maybe becomes work, and it is
 * the one message worth interrupting somebody for — it decides what they do
 * next week. It now buzzes the phone as well, like a new enquiry does.
 *
 * Best-effort throughout, and it never throws. The customer's answer is already
 * recorded by the time this runs, and losing a notification must never undo a
 * decision they have made.
 */
export async function notifyOwnerOfQuoteResponse(
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

    const who = quote.client?.full_name ?? "A customer";

    await Promise.all([
      sendQuoteResponseToOwner(quote.reference, who, accepted, reason, quote.job_id),

      pushToStaff({
        title: accepted ? `${who} accepted your quote` : `${who} turned down a quote`,
        body: accepted
          ? `${quote.reference} — go ahead and book it in.`
          : reason
            ? `${quote.reference} — "${reason}"`
            : `${quote.reference} — no reason given.`,
        url: quote.job_id ? `/app/jobs/${quote.job_id}` : `/app/quotes/${quoteId}`,
        tag: "quote-response",
        // An accepted quote is work won and usually wants scheduling around
        // other jobs, so it is worth the screen. A decline is worth knowing and
        // not worth stopping for.
        urgent: accepted,
      }),
    ]);
  } catch (error) {
    console.error("[notify-owner] quote response failed", error);
  }
}
