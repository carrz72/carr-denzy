# Supabase auth email templates

These are the emails **Supabase** sends. They are separate from the emails the
app sends itself (quotes, invoices, enquiry confirmations) — those live in
`src/lib/email.ts` and go out through Resend. Both use the same layout on
purpose, so a customer sees one business rather than two.

## How to install them

Supabase has no way to load these from the repo, so they are pasted in by hand.

1. Supabase Dashboard → **Authentication** → **Emails** → **Templates**
2. Pick the template, paste the file contents into the message body, and save:

   | Template in Supabase | File | When it fires |
   | --- | --- | --- |
   | **Confirm signup** | `confirm-signup.html` | The **first** time an address signs in |
   | **Magic Link** | `magic-link.html` | Every sign-in after that |
   | **Change Email Address** | `change-email.html` | Someone changes their email in the portal |
   | Reset Password | *(leave as-is)* | Never — this app has no passwords |
   | Invite user | *(leave as-is)* | Never — nobody is invited |
   | Reauthentication | *(leave as-is)* | Never |

3. Set the subject lines too — they are a separate field above the body:

   - Confirm signup → `Your sign-in link for Carr Denzy`
   - Magic Link → `Your sign-in link for Carr Denzy`
   - Change Email Address → `Confirm your new email address`

**Do not skip "Confirm signup".** It is tempting to think only Magic Link
matters, because the app only ever calls `signInWithOtp`. But the first time an
address is used Supabase treats it as a signup and sends *that* template
instead. Leaving it on the default means every brand-new customer's first
impression is an unbranded email about confirming an account they never
knowingly created.

## Before going live: replace the built-in email service

Supabase's built-in SMTP is for development. It is **rate limited to a handful
of emails per hour** and sends from a shared Supabase domain, which lands in
spam more often than not.

On a Saturday morning with four customers trying to sign in, the fourth simply
will not get an email, and there is nothing in the app that can tell them why.

Fix it in Dashboard → **Project Settings** → **Authentication** → **SMTP
Settings**. The project already uses Resend for its own email, so the same
account works:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | an address on a domain verified with Resend |
| Sender name | `Carr Denzy Plumbing & Gas` |

Then raise the rate limit under Authentication → Rate Limits, which stays low
while the built-in service is in use.

## Also check the URL configuration

Dashboard → **Authentication** → **URL Configuration**:

- **Site URL** — the live domain, e.g. `https://carrdenzy.co.uk`
- **Redirect URLs** — must include `https://carrdenzy.co.uk/auth/callback`, and
  `http://localhost:3000/auth/callback` for local work

If the production callback is missing, sign-in links silently redirect to
`localhost` and every customer sees a broken page. It is the single most common
thing to forget at launch.

## A note on the code in the email

Each template shows the 6-digit `{{ .Token }}` as well as the button. That is
not decoration: some corporate mail scanners — Outlook on a work laptop
especially — pre-open links to check them, which consumes a one-time link before
the human ever clicks it. The person then gets "that link has expired" for no
reason they can see. Typing the code is the way out of that.

## Testing a change

Save the template, then use the real form at `/sign-in` rather than Supabase's
preview — the preview does not render `{{ .Token }}` or the confirmation URL, so
it will not show you the thing most likely to be broken. Check it on a phone as
well as a desktop; these templates are single-column and should hold up, but the
one that matters is the one your customers actually open.
