import "server-only";

import { Resend } from "resend";

import { getBusiness } from "@/lib/business";

/**
 * Email.
 *
 * Two rules hold everywhere this is used:
 *
 *  1. A failed send NEVER fails the surrounding transaction. If a quote saves
 *     but the email bounces, the owner gets a copyable link instead of losing
 *     the quote (spec E-15). Every function here returns a result rather than
 *     throwing.
 *  2. With no RESEND_API_KEY set, mail is logged to the terminal instead of
 *     sent, so local development works out of the box and nobody has to wire
 *     up a mail provider before they can see the app run.
 */

export interface SendResult {
  sent: boolean;
  error?: string;
}

const from = process.env.EMAIL_FROM ?? "Carr Denzy <onboarding@resend.dev>";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

async function send(
  /** One address, or several — Resend takes an array and sends once. */
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  attachments?: EmailAttachment[],
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.info(
      [
        "",
        "──────────── email (not sent: RESEND_API_KEY is unset) ────────────",
        `To:      ${Array.isArray(to) ? to.join(", ") : to}`,
        `Subject: ${subject}`,
        attachments?.length ? `Attachments: ${attachments.map((a) => a.filename).join(", ")}` : "",
        "",
        text,
        "───────────────────────────────────────────────────────────────────",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const resend = new Resend(apiKey);
    // Resend's API takes attachment content as base64 over JSON — a raw
    // Buffer serialises to `{type:"Buffer",data:[...]}` instead, which is
    // silently useless, so the attachment never lands.
    const encodedAttachments = attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      attachments: encodedAttachments,
    });

    if (error) {
      console.error("[email] send failed", error);
      return { sent: false, error: error.message };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.error("[email] send threw", error);
    return { sent: false, error: message };
  }
}

/**
 * The business phone number, from Settings.
 *
 * Emails outlive the moment they are sent — a customer digs one out six months
 * later to ring about a boiler. Baking the number in at write time means every
 * old email points at a dead line the day it changes.
 */
async function businessPhone(): Promise<string> {
  const contact = await getBusiness();
  return contact.phone;
}

/** Escapes user-supplied text before it goes anywhere near an HTML email. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function layout(heading: string, bodyHtml: string): Promise<string> {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1714;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:24px 28px;border-bottom:3px solid #be4a33;">
          <span style="font-size:15px;font-weight:700;letter-spacing:-0.01em;">Carr Denzy Plumbing &amp; Gas</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;">${esc(heading)}</h1>
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;background:#f9f7f4;font-size:12px;color:#6b6055;">
          Carr Denzy Plumbing &amp; Gas · ${esc(await businessPhone())}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:#be4a33;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600;font-size:15px;">${esc(label)}</a>
  </p>`;
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export interface EnquiryEmailData {
  reference: string;
  fullName: string;
  description: string;
  urgency: "emergency" | "soon" | "flexible";
  phone?: string | null;
  email?: string | null;
  postcode?: string | null;
  enquiryId: string;
}

const urgencyWords: Record<EnquiryEmailData["urgency"], string> = {
  emergency: "Emergency — needs attention today",
  soon: "Soon — within the next few days",
  flexible: "Flexible — no particular rush",
};

/**
 * Everyone who should be told about a new enquiry.
 *
 * Read from Settings so the owner can add a partner, an office number or a
 * second engineer without a developer. The environment variable stays as the
 * fallback: an empty list must never mean silence — it means "nobody has
 * customised this yet", and a missed enquiry is a lost job.
 */
async function notificationRecipients(): Promise<string[]> {
  const fallback = process.env.OWNER_NOTIFICATION_EMAIL;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data } = await admin.from("settings").select("notification_emails").maybeSingle();

    const configured = (data?.notification_emails ?? [])
      .map((address) => address.trim())
      .filter(Boolean);

    if (configured.length > 0) return configured;
  } catch (error) {
    console.error("[email] could not read notification recipients", error);
  }

  return fallback ? [fallback] : [];
}

export async function sendOwnerEnquiryNotification(data: EnquiryEmailData): Promise<SendResult> {
  const recipients = await notificationRecipients();

  if (recipients.length === 0) {
    return { sent: false, error: "No notification recipients configured" };
  }

  // Resend accepts an array; one call, one send, everyone gets it.
  const to = recipients.length === 1 ? recipients[0]! : recipients;

  const link = `${siteUrl()}/app/enquiries/${data.enquiryId}`;

  const contactLines = [
    data.phone ? `Phone: ${data.phone}` : null,
    data.email ? `Email: ${data.email}` : null,
    data.postcode ? `Postcode: ${data.postcode}` : null,
  ].filter(Boolean) as string[];

  const html = await layout(
    `New enquiry ${data.reference}`,
    `<p style="margin:0 0 8px;font-size:15px;"><strong>${esc(data.fullName)}</strong></p>
     <p style="margin:0 0 16px;font-size:14px;color:#6b6055;">${esc(urgencyWords[data.urgency])}</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(data.description)}</p>
     ${contactLines.map((line) => `<p style="margin:0 0 4px;font-size:14px;">${esc(line)}</p>`).join("")}
     ${button(link, "Open this enquiry")}`,
  );

  const text = [
    `New enquiry ${data.reference}`,
    "",
    data.fullName,
    urgencyWords[data.urgency],
    "",
    data.description,
    "",
    ...contactLines,
    "",
    link,
  ].join("\n");

  return send(to, `New enquiry ${data.reference} — ${data.fullName}`, html, text);
}

export async function sendEnquiryConfirmation(
  to: string,
  reference: string,
  fullName: string,
  urgency: EnquiryEmailData["urgency"],
): Promise<SendResult> {
  // Sunday is closed, so the standing "within the hour" promise cannot hold.
  // Saying so plainly is better than a promise that quietly breaks — somebody
  // with water coming in needs to know to stop waiting and start ringing round.
  // Computed in Europe/London, because the server is not necessarily there.
  const isSunday =
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" }).format(
      new Date(),
    ) === "Sunday";

  const phone = await businessPhone();

  const when =
    urgency === "emergency"
      ? isSunday
        ? `We are closed on Sundays and will pick this up first thing on Monday. If it cannot wait, please ring ${phone} — and if you can smell gas, call 0800 111 999 straight away.`
        : `We treat emergencies as a priority. If you have not heard from us within the hour, please call ${phone}.`
      : isSunday
        ? "We are closed on Sundays. We will come back to you on Monday morning."
        : "We usually reply the same working day, and always within one working day.";

  const html = await layout(
    "We have your request",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(fullName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Thanks for getting in touch. Your reference is <strong>${esc(reference)}</strong> — quote it if you call us.</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(when)}</p>`,
  );

  const text = [
    `Hello ${fullName},`,
    "",
    `Thanks for getting in touch. Your reference is ${reference} — quote it if you call us.`,
    "",
    when,
    "",
    `Carr Denzy Plumbing & Gas · ${await businessPhone()}`,
  ].join("\n");

  return send(to, `We have your request — ${reference}`, html, text);
}

// ---------------------------------------------------------------------------
// Quotes and invoices
// ---------------------------------------------------------------------------

/**
 * Invites a customer to see their jobs online.
 *
 * Sent through Resend rather than Supabase's own mailer so it looks like the
 * business rather than a login system — this lands with somebody who rang up
 * about a boiler and has never heard of any of this.
 *
 * The link is a one-time sign-in link. Deliberately not described as a
 * "password" or an "account to set up", because there is neither.
 */
export async function sendPortalInvite(
  to: string,
  clientName: string,
  signInLink: string,
): Promise<SendResult> {
  const firstName = clientName.split(" ")[0] ?? clientName;

  const html = await layout(
    "See your jobs online",
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hello ${esc(firstName)},</p>
     <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
       We have set up a page where you can see the work we are doing for you — what is
       booked, any prices we have sent you, and your invoices.
     </p>
     ${button(signInLink, "Open my jobs")}
     <p style="margin:0;font-size:14px;line-height:1.6;color:#6b6055;">
       There is no password to remember. This link signs you in, and afterwards you can
       always get back in from the website. The link works once and lasts an hour — if it
       has expired, use <a href="${siteUrl()}/sign-in" style="color:#be4a33;">Sign in</a>
       on the website and we will send you a fresh one.
     </p>`,
  );

  const text = [
    `Hello ${firstName},`,
    "",
    "We have set up a page where you can see the work we are doing for you — what is booked, any prices we have sent you, and your invoices.",
    "",
    signInLink,
    "",
    "There is no password. The link works once and lasts an hour.",
    "",
    `Carr Denzy Plumbing & Gas · ${await businessPhone()}`,
  ].join("\n");

  return send(to, "See your jobs with Carr Denzy online", html, text);
}

export async function sendQuoteToClient(
  to: string,
  clientName: string,
  reference: string,
  totalFormatted: string,
  quoteId: string,
  validUntil: string | null,
  pdf?: Buffer,
): Promise<SendResult> {
  // Not the portal link. Most of this business's customers arrive by phone and
  // have no login, so a portal link put a sign-in wall at exactly the moment
  // they were about to agree to the work. This is a capability link — no
  // account, gated only by the quote's own unguessable id — matching how
  // invoices are already sent, and it survives being forwarded to a partner or
  // a landlord who will never have an account here.
  const link = `${siteUrl()}/quotes/view/${quoteId}`;

  const validLine = validUntil ? `This price is held until ${validUntil}.` : "";

  const html = await layout(
    `Your quote ${reference}`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(clientName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your quote is ready. The total is <strong>${esc(totalFormatted)}</strong>.</p>
     ${validLine ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(validLine)}</p>` : ""}
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Tap below to see what it covers. You can accept or decline it right there — there is nothing to sign up for.</p>
     ${button(link, "View and accept your quote")}
     ${pdf ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b6055;">A copy is attached as a PDF if you would rather keep one or pass it on.</p>` : ""}
     <p style="margin:0;font-size:14px;line-height:1.6;color:#6b6055;">This is a quote, not a bill. Nothing is payable until the work is done.</p>`,
  );

  const text = [
    `Hello ${clientName},`,
    "",
    `Your quote ${reference} is ready. The total is ${totalFormatted}.`,
    validLine,
    "",
    "See it, and accept or decline it, here — no account needed:",
    link,
    "",
    "This is a quote, not a bill. Nothing is payable until the work is done.",
  ]
    .filter(Boolean)
    .join("\n");

  return send(to, `Your quote ${reference} — ${totalFormatted}`, html, text, [
    ...(pdf ? [{ filename: `${reference}.pdf`, content: pdf }] : []),
  ]);
}

export async function sendInvoiceToClient(
  to: string,
  clientName: string,
  reference: string,
  totalFormatted: string,
  invoiceId: string,
  dueDate: string | null,
  pdf?: Buffer,
): Promise<SendResult> {
  // Not the portal link: that requires signing in, which locks out anyone in
  // a payments department who isn't the named account holder. This page is a
  // capability link — no login, gated only by the invoice's own unguessable
  // id — so whoever the customer forwards the email to can still open it.
  const link = `${siteUrl()}/invoices/view/${invoiceId}`;

  const dueLine = dueDate ? `Payment is due by ${dueDate}.` : "";
  const attachmentLine = pdf
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">A PDF copy is attached to this email.</p>`
    : "";

  const html = await layout(
    `Invoice ${reference}`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(clientName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your invoice for <strong>${esc(totalFormatted)}</strong> is attached to your account.</p>
     ${dueLine ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(dueLine)}</p>` : ""}
     ${attachmentLine}
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bank details and a printable copy are on the invoice page. Please use <strong>${esc(reference)}</strong> as your payment reference.</p>
     ${button(link, "View your invoice")}`,
  );

  const text = [
    `Hello ${clientName},`,
    "",
    `Invoice ${reference} for ${totalFormatted}.`,
    dueLine,
    pdf ? "A PDF copy is attached to this email." : "",
    "",
    `Please use ${reference} as your payment reference.`,
    "",
    `View it here: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const attachments = pdf ? [{ filename: `Invoice-${reference}.pdf`, content: pdf }] : undefined;

  return send(to, `Invoice ${reference} — ${totalFormatted}`, html, text, attachments);
}

export async function sendQuoteResponseToOwner(
  reference: string,
  clientName: string,
  accepted: boolean,
  reason: string | null,
  jobId: string,
): Promise<SendResult> {
  const to = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!to) return { sent: false, error: "OWNER_NOTIFICATION_EMAIL is not configured" };

  const link = `${siteUrl()}/app/jobs/${jobId}`;
  const verb = accepted ? "accepted" : "declined";

  const html = await layout(
    `${esc(clientName)} ${verb} quote ${esc(reference)}`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(clientName)} has ${verb} quote ${esc(reference)}.</p>
     ${reason ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Reason given: ${esc(reason)}</p>` : ""}
     ${button(link, "Open the job")}`,
  );

  const text = [
    `${clientName} has ${verb} quote ${reference}.`,
    reason ? `Reason given: ${reason}` : "",
    "",
    link,
  ]
    .filter(Boolean)
    .join("\n");

  return send(to, `Quote ${reference} ${verb}`, html, text);
}

// ---------------------------------------------------------------------------
// Keeping the customer informed
//
// These three cover the gap between "we have your request" and "here is your
// invoice", which was previously silent. All are transactional — they concern
// work the customer asked for — so they carry no unsubscribe footer, but each
// is gated on a per-customer preference they control in their account.
// ---------------------------------------------------------------------------

export async function sendBookingConfirmation(
  to: string,
  clientName: string,
  jobTitle: string,
  whenLabel: string,
  arrivalWindow: string | null,
  address: string | null,
  jobId: string,
): Promise<SendResult> {
  const link = `${siteUrl()}/portal/jobs/${jobId}`;
  const phone = await businessPhone();

  const html = await layout(
    "You are booked in",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(clientName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">We have you booked in for <strong>${esc(jobTitle)}</strong>.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f9f7f4;border-radius:8px;">
       <tr><td style="padding:18px 20px;">
         <p style="margin:0 0 4px;font-size:13px;color:#6b6055;">When</p>
         <p style="margin:0 0 14px;font-size:17px;font-weight:700;">${esc(whenLabel)}</p>
         ${arrivalWindow ? `<p style="margin:0 0 4px;font-size:13px;color:#6b6055;">Arriving</p><p style="margin:0 0 14px;font-size:15px;">${esc(arrivalWindow)}</p>` : ""}
         ${address ? `<p style="margin:0 0 4px;font-size:13px;color:#6b6055;">Where</p><p style="margin:0;font-size:15px;">${esc(address)}</p>` : ""}
       </td></tr>
     </table>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">If that no longer suits, ring us on <strong>${esc(phone)}</strong> and we will move it — the earlier the better for both of us.</p>
     ${button(link, "See the job")}`,
  );

  const text = [
    `Hello ${clientName},`,
    "",
    `We have you booked in for ${jobTitle}.`,
    "",
    `When: ${whenLabel}`,
    arrivalWindow ? `Arriving: ${arrivalWindow}` : "",
    address ? `Where: ${address}` : "",
    "",
    `If that no longer suits, ring us on ${phone}.`,
    "",
    link,
  ]
    .filter(Boolean)
    .join("\n");

  return send(to, `Booked in — ${whenLabel}`, html, text);
}

export async function sendJobMessageToClient(
  to: string,
  clientName: string,
  jobTitle: string,
  messageBody: string,
  jobId: string,
): Promise<SendResult> {
  const link = `${siteUrl()}/portal/jobs/${jobId}`;

  const html = await layout(
    "A message about your job",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(clientName)},</p>
     <p style="margin:0 0 8px;font-size:14px;color:#6b6055;">About ${esc(jobTitle)}:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f9f7f4;border-radius:8px;">
       <tr><td style="padding:18px 20px;">
         <p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(messageBody)}</p>
       </td></tr>
     </table>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">You can reply in your account — we see it against the job.</p>
     ${button(link, "Reply")}`,
  );

  const text = [
    `Hello ${clientName},`,
    "",
    `About ${jobTitle}:`,
    "",
    messageBody,
    "",
    `Reply here: ${link}`,
  ].join("\n");

  return send(to, `Message about ${jobTitle}`, html, text);
}

export async function sendJobCompleted(
  to: string,
  clientName: string,
  jobTitle: string,
  jobId: string,
): Promise<SendResult> {
  const link = `${siteUrl()}/portal/jobs/${jobId}`;
  const phone = await businessPhone();

  const html = await layout(
    "That is finished",
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(clientName)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">We have finished <strong>${esc(jobTitle)}</strong>. Your invoice will follow shortly — nothing is payable until then.</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Any photographs we took are on the job in your account, and they stay there for whenever you need them.</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">If anything is not right, ring us on <strong>${esc(phone)}</strong>. We would far rather come back and sort it than have you live with it.</p>
     ${button(link, "See the job")}`,
  );

  const text = [
    `Hello ${clientName},`,
    "",
    `We have finished ${jobTitle}. Your invoice will follow shortly — nothing is payable until then.`,
    "",
    `If anything is not right, ring us on ${phone}.`,
    "",
    link,
  ].join("\n");

  return send(to, `Finished — ${jobTitle}`, html, text);
}
