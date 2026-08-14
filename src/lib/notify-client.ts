import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { pushToClient } from "@/lib/push";
import {
  sendBookingConfirmation,
  sendJobCompleted,
  sendJobMessageToClient,
} from "@/lib/email";
import { formatDateTime, formatTime } from "@/lib/dates";

/**
 * Telling a customer something happened.
 *
 * One place, so every trigger answers the same three questions the same way:
 * do they want this, do we have an email, and should their phone buzz too.
 * Scattering that logic across the schedule, message and status actions is how
 * the three quietly drift into behaving differently.
 *
 * Everything here is best-effort and never throws. A customer not hearing
 * about a booking is bad; a booking failing to save because an email bounced
 * is worse.
 */

type Preference = "notify_booking" | "notify_messages" | "notify_completion";

interface Recipient {
  clientId: string;
  email: string | null;
  fullName: string;
  wants: boolean;
}

async function recipientFor(jobId: string, preference: Preference): Promise<Recipient | null> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("jobs")
      .select(
        `client:clients(id, full_name, email, notify_booking, notify_messages, notify_completion)`,
      )
      .eq("id", jobId)
      .maybeSingle();

    const client = data?.client;
    if (!client) return null;

    return {
      clientId: client.id,
      email: client.email,
      fullName: client.full_name,
      wants: client[preference] !== false,
    };
  } catch (error) {
    console.error("[notify-client] lookup failed", error);
    return null;
  }
}

/** Job booked in, or the date moved. */
export async function notifyClientBooked(
  jobId: string,
  jobTitle: string,
  scheduledStart: string,
  durationMinutes: number | null,
  address: string | null,
): Promise<void> {
  const recipient = await recipientFor(jobId, "notify_booking");
  if (!recipient?.wants) return;

  const whenLabel = formatDateTime(scheduledStart);

  // An arrival window, not a promise of an exact minute. A plumber cannot
  // guarantee 09:00 and a customer told "09:00" reads it as a promise; a
  // two-hour window is honest and still useful for planning a morning.
  const arrivalWindow = (() => {
    const start = new Date(scheduledStart);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return `between ${formatTime(start)} and ${formatTime(end)}`;
  })();

  await Promise.all([
    recipient.email
      ? sendBookingConfirmation(
          recipient.email,
          recipient.fullName,
          jobTitle,
          whenLabel,
          arrivalWindow,
          address,
          jobId,
        )
      : Promise.resolve(),

    pushToClient(recipient.clientId, {
      title: "You are booked in",
      body: `${jobTitle} — ${whenLabel}`,
      url: `/portal/jobs/${jobId}`,
      tag: `job-${jobId}`,
    }),
  ]).catch((error) => console.error("[notify-client] booking failed", error));

  // `durationMinutes` is deliberately unused in the customer's message: how
  // long the owner has blocked out is a diary detail, and quoting it invites
  // "you said an hour" when a job runs over.
  void durationMinutes;
}

/** The owner posted on the job thread. */
export async function notifyClientMessage(
  jobId: string,
  jobTitle: string,
  messageBody: string,
): Promise<void> {
  const recipient = await recipientFor(jobId, "notify_messages");
  if (!recipient?.wants) return;

  await Promise.all([
    recipient.email
      ? sendJobMessageToClient(
          recipient.email,
          recipient.fullName,
          jobTitle,
          messageBody,
          jobId,
        )
      : Promise.resolve(),

    pushToClient(recipient.clientId, {
      title: "Message about your job",
      body: messageBody.length > 120 ? `${messageBody.slice(0, 117).trimEnd()}…` : messageBody,
      url: `/portal/jobs/${jobId}`,
      tag: `job-${jobId}`,
    }),
  ]).catch((error) => console.error("[notify-client] message failed", error));
}

/** Work marked finished. `summary` is the owner's note on what was done. */
export async function notifyClientCompleted(
  jobId: string,
  jobTitle: string,
  summary: string | null = null,
): Promise<void> {
  const recipient = await recipientFor(jobId, "notify_completion");
  if (!recipient?.wants) return;

  await Promise.all([
    recipient.email
      ? sendJobCompleted(recipient.email, recipient.fullName, jobTitle, jobId, summary)
      : Promise.resolve(),

    pushToClient(recipient.clientId, {
      title: "That is finished",
      body: `${jobTitle} — your invoice will follow.`,
      url: `/portal/jobs/${jobId}`,
      tag: `job-${jobId}`,
    }),
  ]).catch((error) => console.error("[notify-client] completion failed", error));
}
