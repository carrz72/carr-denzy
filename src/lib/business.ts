import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { business as fallback } from "@/lib/site";

/**
 * The business's contact details, from the database, with the values in
 * `site.ts` as a fallback.
 *
 * Why this exists: the phone number and email were hard-coded, so changing the
 * one on the website meant a code change and a redeploy — while `settings`
 * held a SEPARATE copy used on invoices. The two had already drifted to
 * different phone numbers without anyone noticing, which is exactly the
 * failure two sources of truth always produce eventually.
 *
 * `settings` is now the single source. The owner edits it at /app/settings and
 * it changes everywhere: website, emails, quotes, invoices.
 *
 * Three deliberate properties:
 *
 *   * **It falls back rather than failing.** If Supabase is unreachable, the
 *     marketing pages still render with the values from `site.ts`. A plumber's
 *     website showing a slightly stale phone number is a minor problem; one
 *     showing an error page is a lost customer.
 *   * **It reads with the admin client.** Contact details are public
 *     information printed on every page, and the marketing site has no session
 *     to read them with.
 *   * **It is `cache`d per request**, so a page rendering the header, the
 *     footer and a call-to-action makes one query, not three.
 */

export interface BusinessContact {
  name: string;
  shortName: string;
  phone: string;
  /** `tel:` href, derived from the phone number. */
  phoneHref: string;
  /**
   * A wa.me chat link for the same number, or null when the owner has the
   * WhatsApp button switched off in Settings, or the number is not a mobile
   * (a landline cannot have WhatsApp, and a dead chat link is worse than none).
   */
  whatsappHref: string | null;
  email: string;
}

/**
 * Turns a number a human typed into something a phone can dial.
 *
 * "07934 633583" and "+44 7938 463358" and "(01159) 123 456" all have to work,
 * because this is typed into a settings form by someone who is not thinking
 * about E.164.
 */
/**
 * Cleans up what actually arrives from a settings form.
 *
 * Pasting a phone number from a website or a document commonly brings
 * non-breaking spaces (U+00A0) with it — the live record does exactly this.
 * They are invisible, so nobody notices, and dialling still works because the
 * `tel:` href strips non-digits. What breaks is everything textual: searching
 * for the number fails, and comparing it against another copy fails.
 *
 * Collapsed to ordinary spaces on the way out rather than rejected on the way
 * in — a settings form that refuses a pasted number for reasons it cannot
 * explain is worse than one that quietly tidies it.
 */
function tidy(value: string): string {
  return value.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

export function toTelHref(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) return `tel:${digits}`;

  // A UK national number starting 0 becomes +44 without the 0.
  if (digits.startsWith("0")) return `tel:+44${digits.slice(1)}`;

  return `tel:${digits}`;
}

/**
 * The text a WhatsApp chat opens with, ready for the customer to finish.
 * Starting them off means the first message already says it came from the
 * website, and they rarely send an empty "hi".
 */
const WHATSAPP_GREETING = "Hi, I found you on your website and I would like some help with ";

/**
 * Turns a phone number into a WhatsApp click-to-chat link. Only UK mobiles
 * (07…, +447…) qualify; anything else returns null so no button is shown.
 */
export function toWhatsAppHref(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let international: string;
  if (digits.startsWith("+")) international = digits.slice(1);
  else if (digits.startsWith("0")) international = `44${digits.slice(1)}`;
  else international = digits;
  if (!/^447\d{9}$/.test(international)) return null;
  return `https://wa.me/${international}?text=${encodeURIComponent(WHATSAPP_GREETING)}`;
}

export const getBusiness = cache(async (): Promise<BusinessContact> => {
  const base: BusinessContact = {
    name: fallback.name,
    shortName: fallback.shortName,
    phone: fallback.phone,
    phoneHref: fallback.phoneHref,
    // Off unless Settings says otherwise, so a failed lookup never shows it.
    whatsappHref: null,
    email: fallback.email,
  };

  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("settings")
      .select("trading_name, phone, email, show_whatsapp")
      .maybeSingle();

    if (!data) return base;

    const phone = data.phone ? tidy(data.phone) : "";
    const email = data.email ? tidy(data.email) : "";
    const name = data.trading_name ? tidy(data.trading_name) : "";

    return {
      name: name || base.name,
      shortName: base.shortName,
      phone: phone || base.phone,
      phoneHref: phone ? toTelHref(phone) : base.phoneHref,
      whatsappHref: data.show_whatsapp ? toWhatsAppHref(phone || base.phone) : null,
      email: email || base.email,
    };
  } catch (error) {
    // Never let a contact-details lookup take down a public page.
    console.error("[business] falling back to static contact details", error);
    return base;
  }
});
