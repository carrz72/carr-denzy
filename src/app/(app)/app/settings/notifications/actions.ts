"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { fieldErrors } from "@/lib/validation";

/**
 * Who gets told about a new enquiry.
 *
 * Accepts a free-text list because that is how somebody will actually type it —
 * one per line, or comma separated, or both. Rejecting a valid address because
 * of a stray comma would be the app being difficult about the exact thing it
 * exists to make easy.
 */

const recipientsSchema = z.object({
  emails: z
    .string()
    .trim()
    .max(2000, "That is more addresses than this can hold")
    .transform((raw) =>
      raw
        .split(/[\n,;]+/)
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean),
    )
    .refine(
      (list) => list.every((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)),
      "One of those does not look like an email address — check for a typo",
    )
    .refine((list) => list.length <= 10, "Ten addresses is the limit"),
});

export interface NotificationResult {
  ok: boolean;
  errors?: Record<string, string>;
  formError?: string;
  savedCount?: number;
}

export async function updateNotificationEmails(formData: FormData): Promise<NotificationResult> {
  await requireOwner();

  const parsed = recipientsSchema.safeParse({ emails: formData.get("emails") ?? "" });

  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  // Duplicates would mean the same inbox gets the same enquiry twice.
  const unique = Array.from(new Set(parsed.data.emails));

  const supabase = await createClient();

  const { error } = await supabase
    .from("settings")
    .update({ notification_emails: unique })
    .eq("id", true);

  if (error) {
    console.error("[notifications] save failed", error);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidatePath("/app/settings/notifications");

  return { ok: true, savedCount: unique.length };
}

/**
 * Sends a test notification to whoever is configured, and to this device.
 *
 * The single most valuable thing on the page. Every part of this chain fails
 * silently by design — a missing API key, an unverified sending domain, a
 * revoked push permission — so without a way to prove it works, the owner only
 * discovers it is broken by losing a job.
 */
export async function sendTestNotification(): Promise<NotificationResult> {
  await requireOwner();

  try {
    const { sendOwnerEnquiryNotification } = await import("@/lib/email");
    const { pushToStaff, isPushConfigured } = await import("@/lib/push");

    const [emailResult, pushResult] = await Promise.all([
      sendOwnerEnquiryNotification({
        reference: "TEST",
        fullName: "Test — not a real customer",
        description:
          "This is a test of your notifications. If you are reading it, new enquiries will reach you here. Nothing has been added to your enquiry list.",
        urgency: "soon",
        phone: null,
        email: null,
        postcode: null,
        enquiryId: "test",
      }),
      isPushConfigured()
        ? pushToStaff({
            title: "Test notification",
            body: "If you can see this, new enquiries will buzz your phone.",
            url: "/app/settings/notifications",
            tag: "carr-denzy-test",
          })
        : Promise.resolve({ sent: 0, failed: 0, removed: 0 }),
    ]);

    const parts: string[] = [];

    parts.push(
      emailResult.sent
        ? "Email sent."
        : `Email did NOT send — ${emailResult.error ?? "unknown reason"}.`,
    );

    if (!isPushConfigured()) {
      parts.push("Push is not configured on the server.");
    } else if (pushResult.sent > 0) {
      parts.push(`Push sent to ${pushResult.sent} device${pushResult.sent === 1 ? "" : "s"}.`);
    } else {
      parts.push("No devices are set up for push yet.");
    }

    return { ok: emailResult.sent || pushResult.sent > 0, formError: parts.join(" ") };
  } catch (error) {
    console.error("[notifications] test failed", error);
    return { ok: false, formError: "The test could not run. Check the server logs." };
  }
}
