import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web push.
 *
 * The problem this solves: an emergency enquiry at eight in the evening used
 * to land in an inbox, and an inbox is not something you check under somebody
 * else's sink. A push notification buzzes the phone the same way a text does.
 *
 * Rules that hold throughout, matching how email already behaves here:
 *
 *   * A push failure NEVER fails the surrounding action. The enquiry is
 *     already saved; losing the alert must not lose the job.
 *   * Missing VAPID keys are a no-op with a log line, not a crash, so the app
 *     runs perfectly well before push has been configured.
 *   * A subscription is only deleted once the push service has told us twice
 *     that it is gone. One 410 can be a transient outage, and dropping it on
 *     the first would silently stop notifying somebody still carrying the
 *     phone.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

/** The `mailto:` the push services contact if this server misbehaves. */
const contactEmail = process.env.OWNER_NOTIFICATION_EMAIL ?? "carrdenz@gmail.com";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(publicKey && privateKey);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url: string;
  /** Collapses replacements — a second push with the same tag replaces the first. */
  tag?: string;
  /** True for genuine emergencies: bypasses the phone's notification grouping. */
  urgent?: boolean;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Pushes to every device belonging to the owner and staff.
 *
 * Deliberately not "to a user id" — the caller is reporting a business event,
 * not addressing a person, and who needs to know is a property of the business.
 */
export async function pushToStaff(message: PushMessage): Promise<PushResult> {
  const admin = createAdminClient();

  const { data: staff } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["owner", "staff"]);

  return pushToProfiles((staff ?? []).map((profile) => profile.id), message);
}

/**
 * Pushes to one customer, if they have installed the app.
 *
 * Most homeowners never will — they have one leak a decade. That is fine:
 * every notification sent this way is also sent by email, so push is a bonus
 * for the landlord with four properties who did install it, never the only
 * way something gets through.
 */
export async function pushToClient(
  clientId: string,
  message: PushMessage,
): Promise<PushResult> {
  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("profile_id")
    .eq("id", clientId)
    .maybeSingle();

  // A client record with no linked login is the normal case for somebody who
  // rang up and never signed in. Nothing to push to, and not an error.
  if (!client?.profile_id) return { sent: 0, failed: 0, removed: 0 };

  return pushToProfiles([client.profile_id], message);
}

export async function pushToProfiles(
  profileIds: string[],
  message: PushMessage,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };

  if (!ensureConfigured()) {
    console.info("[push] VAPID keys not set — skipping", message.title);
    return result;
  }

  if (profileIds.length === 0) return result;

  try {
    const admin = createAdminClient();

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("*")
      .in("profile_id", profileIds);

    if (!subscriptions?.length) return result;

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
      tag: message.tag,
      urgent: message.urgent ?? false,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            {
              // Emergencies wake the device; everything else waits politely for
              // the next time the screen comes on and saves the battery.
              urgency: message.urgent ? "high" : "normal",
              TTL: message.urgent ? 3600 : 86400,
            },
          );

          result.sent += 1;

          await admin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", subscription.id);
        } catch (error) {
          result.failed += 1;

          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? (error as { statusCode: number }).statusCode
              : 0;

          // 404 and 410 mean the browser threw the subscription away — the app
          // was uninstalled, or notifications were revoked. Two strikes before
          // we act on it.
          const gone = statusCode === 404 || statusCode === 410;
          const strikes = subscription.failure_count + 1;

          if (gone && strikes >= 2) {
            await admin.from("push_subscriptions").delete().eq("id", subscription.id);
            result.removed += 1;
          } else {
            await admin
              .from("push_subscriptions")
              .update({ failure_count: strikes })
              .eq("id", subscription.id);
          }
        }
      }),
    );

    return result;
  } catch (error) {
    console.error("[push] send failed", error);
    return result;
  }
}
