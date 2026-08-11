# Carr Denzy — Trade Site + Job Management App

**Status:** Approved for build
**Date:** 2026-08-10
**Owner decisions locked:** Next.js + Tailwind on Vercel · not VAT-registered, no CIS · bank transfer only · single owner, team-ready schema

---

## 1. Overview and user value

Carr Denzy Plumbing & Gas currently has a four-section static brochure page. It advertises, but it does nothing. Every enquiry arrives by phone, every quote is written by hand, and every invoice is a Word document.

This project replaces it with one installable web app that serves three audiences from one codebase:

| Audience | What they get | Value |
| --- | --- | --- |
| **Prospect** (never met the business) | A fast, credible marketing site with a guided "describe your problem" request form that takes photos | More enquiries, better-qualified, with photos attached before anyone drives anywhere |
| **Client** (job in progress) | A portal showing exactly where their job is, quotes to accept or decline, invoices, and the photo record | Fewer "any update?" phone calls; written approval trail |
| **Owner** (the plumber) | A phone-first job manager: enquiry inbox → quote → scheduled job → invoice → paid, plus a client history | Stops losing quotes; gets invoices out the same day; sees what is owed |

### Why this is not just a website

The owner is not a strong technical user. That single fact drives every design decision in this spec:

- **One primary action per screen.** No screen asks the owner to decide between five equally-weighted buttons.
- **The app never shows an empty grid.** Every list has a composed empty state that says what to do next.
- **Money is never entered twice.** A quote becomes an invoice with one tap, carrying its line items across.
- **It works with no signal.** Plumbers work in basements and plant rooms. Writing a job note or taking a photo must never fail because of a dropped connection.
- **Nothing is destructive without a confirmation naming the thing being destroyed.**

### Non-goals for v1

Payroll, stock/parts inventory, supplier purchase orders, multi-branch, accounting-package sync (Xero/QuickBooks), route optimisation, and SMS sending. Each is a defensible later addition; none is needed to replace the current paper process.

---

## 2. Personas

**Denzy — owner, 40s, Gas Safe registered.** Uses an Android phone, one laptop at home he rarely opens. Bills by hand on Sunday evenings. Wants: to stop doing Sunday evenings. Cannot be asked to learn a "workflow builder".

**Marcus — client, homeowner, 60s.** Found the business on Google after a leak. Comfortable with a phone but distrusts anything asking him to "create an account". Wants: to know when someone is coming, and what it will cost.

**Priya — client, landlord with four properties.** Wants a written record per property, and invoices she can forward to her accountant.

---

## 3. Domain model

```
profile (1) ──< client (many)          a profile is an auth user; role = owner | staff | client
client  (1) ──< property (many)        one client can own several addresses
client  (1) ──< enquiry  (many)
enquiry (0..1) ──> job                 an enquiry converts to a job, or is declined
job     (1) ──< job_event (many)       immutable status/audit timeline
job     (1) ──< job_photo (many)
job     (1) ──< quote (many)           re-quoting keeps history; one quote is 'accepted'
quote   (1) ──< quote_item (many)
job     (1) ──< invoice (many)         deposit + final invoice both allowed
invoice (1) ──< invoice_item (many)
invoice (1) ──< payment (many)         part-payments supported
job     (1) ──< message (many)         owner ↔ client thread, scoped to the job
settings (singleton)                   business details, bank details, VAT/CIS flags
```

**Job status machine** — the owner only ever moves forward or cancels:

```
new → quoted → accepted → scheduled → in_progress → completed → invoiced → paid
                   ↓                      ↓
              declined                cancelled
```

---

## 4. Functional requirements (EARS)

### 4.1 Public marketing site

- **FR-1** — The system shall serve the marketing pages as server-rendered HTML with a Largest Contentful Paint under 2.5 s on a 4G connection.
- **FR-2** — Where a visitor has JavaScript disabled, the system shall still render all marketing content and the phone number as a `tel:` link.
- **FR-3** — The system shall publish `LocalBusiness` structured data including trading name, telephone, address, service area and opening hours.
- **FR-4** — When a visitor requests a page that does not exist, the system shall render a branded 404 offering the home page, the services list and the phone number.

### 4.2 Enquiry capture

- **FR-5** — The system shall allow a visitor to submit an enquiry without creating an account.
- **FR-6** — When a visitor submits an enquiry, the system shall require a name, a contact method (telephone or email), a service category, and a description of at least 10 characters.
- **FR-7** — The system shall allow a visitor to attach up to 6 photographs of at most 10 MB each, of type JPEG, PNG, WebP or HEIC.
- **FR-8** — When a visitor attaches a photograph, the system shall downscale it client-side to a maximum edge of 1600 px before upload.
- **FR-9** — The system shall require the visitor to select an urgency of `emergency`, `soon` or `flexible`.
- **FR-10** — Where urgency is `emergency`, the system shall display the business telephone number prominently and advise the visitor to call rather than wait for a reply.
- **FR-11** — When an enquiry is submitted, the system shall create the enquiry record and return a reference of the form `ENQ-0001` within 3 seconds.
- **FR-12** — The system shall reject more than 5 enquiry submissions from one IP address within 60 minutes, returning a clear message rather than a silent failure.
- **FR-13** — When an enquiry is submitted, the system shall send the owner a notification email containing the reference, the description and a direct link to the enquiry.
- **FR-14** — Where the enquirer supplied an email address, the system shall send them a confirmation containing the reference and the expected response time.

### 4.3 Authentication

- **FR-15** — The system shall authenticate all users by emailed one-time link (magic link), with no password to remember.
- **FR-16** — When a user authenticates for the first time, the system shall create a profile with role `client` by default.
- **FR-17** — Where a user's role is `owner`, the system shall route them to the owner dashboard on sign-in; where the role is `client`, to the client portal.
- **FR-18** — The system shall never allow a client to assign or change any role, including their own.
- **FR-19** — When an unauthenticated user requests a protected route, the system shall redirect to sign-in and return them to the requested route after authentication.

### 4.4 Client portal

- **FR-20** — The system shall display to a client only the jobs, quotes, invoices, photographs and messages belonging to their own client record.
- **FR-21** — The system shall display each job's progress as a labelled timeline in plain English, not as a status code.
- **FR-22** — When a client views a quote with status `sent`, the system shall present an Accept and a Decline action.
- **FR-23** — When a client accepts a quote, the system shall record the acceptance with a timestamp, set the quote to `accepted`, move the job to `accepted`, and expire every other open quote on that job.
- **FR-24** — When a client declines a quote, the system shall require an optional reason and set the quote to `declined`.
- **FR-25** — The system shall not allow a client to modify a quote's line items or totals.
- **FR-26** — The system shall allow a client to download any of their invoices as a PDF.
- **FR-27** — The system shall allow a client to post a message on a job and shall show the owner's replies in the same thread.

### 4.5 Owner — enquiries and jobs

- **FR-28** — The system shall present new enquiries in an inbox ordered by urgency then by age, with unread enquiries visually distinct.
- **FR-29** — When the owner converts an enquiry, the system shall create or match a client by email or telephone, create a property from the supplied address, create a job in status `new`, and link the enquiry to that job.
- **FR-30** — The system shall allow the owner to decline an enquiry with a reason, which is recorded but not sent automatically.
- **FR-31** — The system shall allow the owner to change a job's status only to a state permitted by the status machine in section 3.
- **FR-32** — When a job's status changes, the system shall append an immutable `job_event` recording the previous status, the new status, the actor and the timestamp.
- **FR-33** — The system shall allow the owner to schedule a job by setting a start date, a start time and an estimated duration in minutes.
- **FR-34** — The system shall display scheduled jobs in a day view and a week view, and shall highlight jobs scheduled for today.
- **FR-35** — When two jobs are scheduled to overlap, the system shall warn the owner but shall not block the save.
- **FR-36** — The system shall allow the owner to attach photographs and private notes to a job, and shall let them mark each photograph as visible or hidden from the client.
- **FR-37** — Where a job has an address, the system shall offer a one-tap link that opens the device's map application with that address.

### 4.6 Owner — quotes

- **FR-38** — The system shall allow the owner to build a quote from free-text line items, each with a description, quantity and unit price.
- **FR-39** — The system shall allow the owner to save any line item to a reusable price list and to insert items from that list.
- **FR-40** — The system shall calculate a quote's subtotal, tax and total on the server, and shall ignore any totals supplied by the client.
- **FR-41** — The system shall assign each quote a unique sequential reference of the form `QUO-0001`.
- **FR-42** — When the owner sends a quote, the system shall set its status to `sent`, record the sent timestamp, and email the client a link to view it.
- **FR-43** — The system shall allow the owner to set a quote expiry date, and shall mark quotes past that date as `expired`.
- **FR-44** — The system shall not allow a quote in status `accepted` to be edited.

### 4.7 Owner — invoices

- **FR-45** — The system shall assign each invoice a unique sequential reference of the form `INV-0001`, with no gaps.
- **FR-46** — The system shall include on every invoice: the business trading name and address, the client's name and address, the invoice reference, the issue date, the payment due date, a description of the work, and the total due.
- **FR-47** — Where the business is marked VAT-registered in settings, the system shall additionally show the VAT registration number, the net amount, the VAT rate and VAT amount per rate, and the gross total.
- **FR-48** — Where the business is not marked VAT-registered, the system shall show no VAT lines and no VAT number anywhere on the invoice.
- **FR-49** — Where CIS is enabled in settings, the system shall separate labour from materials, apply the configured deduction rate to labour only, show the deduction as a distinct line, and print the Unique Taxpayer Reference.
- **FR-50** — Where the domestic reverse charge is enabled on an invoice, the system shall charge no VAT and shall print the statement "Reverse charge: customer to account for VAT to HMRC".
- **FR-51** — The system shall allow the owner to create an invoice from an accepted quote, carrying every line item across unchanged.
- **FR-52** — The system shall print the business bank account name, sort code, account number and the invoice reference as the payment reference on every invoice.
- **FR-53** — The system shall allow the owner to record a payment against an invoice with an amount, a date and a method.
- **FR-54** — When recorded payments equal or exceed an invoice total, the system shall set the invoice to `paid` and the parent job to `paid`.
- **FR-55** — Where recorded payments are greater than zero but less than the total, the system shall show the invoice as `part paid` with the outstanding balance.
- **FR-56** — The system shall mark an unpaid invoice as `overdue` once its due date has passed.
- **FR-57** — The system shall not allow an invoice with status `sent`, `part_paid` or `paid` to have its line items edited; corrections shall be made by issuing a credit note.
- **FR-58** — The system shall retain every invoice and its line items for at least six years and shall not hard-delete them.

### 4.8 Owner — dashboard and clients

- **FR-59** — The system shall show on the dashboard: today's scheduled jobs, unread enquiries, quotes awaiting a client response, and the total value of unpaid invoices.
- **FR-60** — The system shall provide a single search that matches clients by name, telephone, email or address.
- **FR-61** — The system shall show, for each client, every property, job, quote and invoice associated with them.

### 4.9 PWA and offline

- **FR-62** — The system shall be installable to the home screen on iOS and Android with `display: standalone`.
- **FR-63** — Where the device is offline, the system shall serve the app shell and any previously viewed job from local storage.
- **FR-64** — When the owner creates a job note or photograph while offline, the system shall queue it in IndexedDB and shall confirm to the owner that it is saved and will send.
- **FR-65** — When connectivity returns, the system shall replay the queue in submission order, using the Background Sync API where available and the `online` event elsewhere.
- **FR-66** — Where a queued item fails to replay three times, the system shall surface it to the owner with a Retry action rather than discarding it.
- **FR-67** — The system shall display a persistent, non-blocking indicator whenever the device is offline or the queue is non-empty.
- **FR-68** — The system shall request persistent storage on first install to reduce the risk of iOS evicting cached data after seven days of inactivity.

---

## 5. Non-functional requirements

### Performance
- **NFR-1** — Marketing pages shall score at least 90 on Lighthouse Performance on a simulated Moto G4 / 4G.
- **NFR-2** — Any owner list view shall render its first paint within 1.5 s on 4G.
- **NFR-3** — Images shall be served as WebP or AVIF at the size actually displayed, never larger.

### Accessibility
- **NFR-4** — The application shall meet WCAG 2.2 level AA.
- **NFR-5** — Every interactive target shall be at least 44 × 44 CSS pixels.
- **NFR-6** — Body text shall be at least 16 px with a contrast ratio of at least 4.5:1; large text at least 3:1.
- **NFR-7** — Every interactive element shall have a visible focus indicator with at least 3:1 contrast against its surroundings.
- **NFR-8** — Every form field shall have a persistently visible label; placeholder text shall never be the only label.
- **NFR-9** — Every error shall be announced to assistive technology and shall state both the problem and the fix.
- **NFR-10** — Where the user has requested reduced motion, the system shall disable non-essential animation.

### Security
- **NFR-11** — Row Level Security shall be enabled on every table in the `public` schema, with no policy using `USING (true)` for a client-reachable role.
- **NFR-12** — Every `UPDATE` and `INSERT` policy shall carry a `WITH CHECK` clause.
- **NFR-13** — The `service_role` key shall exist only in server-side environment variables and shall never be referenced in client code.
- **NFR-14** — Every policy shall derive identity from `auth.uid()`, never from a client-supplied identifier.
- **NFR-15** — All monetary totals shall be computed server-side; any client-supplied total shall be discarded.
- **NFR-16** — All input shall be validated against a schema on the server, irrespective of client-side validation.
- **NFR-17** — Uploaded files shall be validated by MIME type and size server-side, stored outside the web root in Supabase Storage, and served via time-limited signed URLs.
- **NFR-18** — Security-relevant events — sign-in, role change, quote acceptance, invoice issue, payment recording — shall be written to an audit log.
- **NFR-19** — The application shall send `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` and `Strict-Transport-Security` headers.
- **NFR-20** — Enquiry submission shall be rate-limited per IP address and shall carry a honeypot field.

### Reliability and data
- **NFR-21** — Invoice and quote reference numbers shall be allocated by a database sequence inside the insert transaction, so no two records can share a number under concurrency.
- **NFR-22** — Money shall be stored as integer pence, never as a floating-point number.
- **NFR-23** — All timestamps shall be stored as `timestamptz` in UTC and rendered in `Europe/London`.
- **NFR-24** — Invoices, quotes and jobs shall be soft-deleted only.

---

## 6. Acceptance criteria

**AC-1 — Enquiry with photos**
Given a visitor is on the request page and has selected the Leaks & repairs category,
When they enter a name, a mobile number, a 40-character description, attach two photographs and submit,
Then an enquiry is created with both photographs attached, the reference `ENQ-0001` is shown on screen, and the owner receives a notification email within one minute.

**AC-2 — Enquiry validation**
Given a visitor submits the request form with an empty description,
When the form is submitted,
Then submission is blocked, focus moves to the description field, and the message "Please describe the problem in a sentence or two" is shown and announced to screen readers.

**AC-3 — Client isolation**
Given client Priya is signed in and client Marcus has a job with id `J`,
When Priya requests the job page for `J` directly by URL,
Then the server returns 404 and no field of job `J` appears in the response body.

**AC-4 — Quote acceptance**
Given a job has a quote in status `sent` for £480.00 and a second quote in status `sent` for £610.00,
When the client accepts the £480.00 quote,
Then that quote becomes `accepted` with an acceptance timestamp, the £610.00 quote becomes `expired`, the job moves to `accepted`, and a `job_event` records the transition.

**AC-5 — Client cannot alter money**
Given a client is viewing a quote for £480.00,
When a crafted request is sent setting the quote total to £1.00,
Then the request is rejected, the stored total remains £480.00, and the attempt is written to the audit log.

**AC-6 — Non-VAT invoice**
Given settings has `vat_registered = false`,
When the owner issues an invoice for two line items totalling £342.00,
Then the PDF shows the trading name and address, the client address, `INV-0001`, the issue and due dates, both line items, and `Total due £342.00`, and contains no VAT number, no VAT rate and no VAT amount.

**AC-7 — Sequential numbering under concurrency**
Given two invoices are created in the same second,
When both inserts complete,
Then they hold distinct references `INV-0002` and `INV-0003` with no gap and no duplicate.

**AC-8 — Part payment**
Given invoice `INV-0004` totals £600.00 and is in status `sent`,
When the owner records a payment of £200.00 by bank transfer,
Then the invoice shows `part paid` with a £400.00 balance and the job remains `invoiced`.

**AC-9 — Payment completes the job**
Given invoice `INV-0004` has £400.00 outstanding,
When the owner records a further £400.00,
Then the invoice becomes `paid`, the job becomes `paid`, and the dashboard's unpaid total decreases by £400.00.

**AC-10 — Offline note**
Given the owner is on a job page and the device goes offline,
When they add the note "Isolated the supply, part needed" and save,
Then the note appears immediately with a "Waiting to send" marker, the offline indicator is visible, and within ten seconds of connectivity returning the note is persisted and the marker clears.

**AC-11 — Installability**
Given the owner opens the site in Chrome on Android,
When they choose Install,
Then the app launches from the home screen with no browser chrome, its own icon, and the brand theme colour in the status bar.

**AC-12 — Immutable issued invoice**
Given invoice `INV-0005` is in status `sent`,
When the owner attempts to change a line item,
Then the edit is refused with the message "Issued invoices can't be edited. Issue a credit note instead", and a credit note action is offered.

**AC-13 — Keyboard and screen reader**
Given a keyboard-only user is on the owner dashboard,
When they tab through the page,
Then a skip link appears first, every control shows a visible focus ring, focus order follows visual order, and no control is reachable but unlabelled.

---

## 7. Error handling

| # | Condition | HTTP | User-facing message | System action |
| --- | --- | --- | --- | --- |
| E-1 | Required field missing | 400 | "Please describe the problem in a sentence or two" (field-specific) | Return field-keyed errors; focus first invalid field |
| E-2 | Photo exceeds 10 MB after downscale | 413 | "That photo is too large. Try taking it again at a lower quality." | Reject file, keep others, do not clear the form |
| E-3 | Unsupported file type | 415 | "We can accept JPG, PNG, WebP or HEIC photos." | Reject file, keep form state |
| E-4 | Enquiry rate limit exceeded | 429 | "We've had several requests from this connection. Please call 07934 633583 and we'll help straight away." | Log IP and count; show phone number |
| E-5 | Magic link expired or reused | 401 | "That sign-in link has expired. We'll send you a new one." | Offer resend; do not reveal whether the email exists |
| E-6 | Client requests another client's record | 404 | "We couldn't find that page." | Return 404 not 403 (no existence leak); write to audit log |
| E-7 | Client attempts to modify a quote total | 403 | "You can accept or decline this quote, but not change it." | Discard payload; write to audit log |
| E-8 | Editing an issued invoice | 409 | "Issued invoices can't be edited. Issue a credit note instead." | Offer credit note action |
| E-9 | Invalid job status transition | 409 | "A job can't go from Completed back to Quoted." | Reject; show the permitted next steps |
| E-10 | Overlapping schedule | 200 | "You already have Boiler service at 10:00 that day. Save anyway?" | Warn only; allow save on confirm |
| E-11 | Supabase unreachable, read | 503 | "We can't reach the server. Showing your last saved copy." | Serve cached data; show offline banner |
| E-12 | Supabase unreachable, write | — | "Saved on this device. It'll send when you're back online." | Queue to IndexedDB outbox |
| E-13 | Queued item fails 3 times | — | "One note couldn't send. Retry?" | Keep item; surface Retry; never discard |
| E-14 | Photo upload fails mid-flight | 502 | "That photo didn't upload. Tap to try again." | Keep local copy; offer retry per file |
| E-15 | Email delivery fails | — | "Quote saved, but the email didn't send. Copy the link instead?" | Persist the record; expose a shareable link |
| E-16 | Duplicate client on conversion | 200 | "This looks like Marcus Adeyemi (07700 900412). Use that record?" | Offer match-or-create; never silently merge |
| E-17 | Unhandled server error | 500 | "Something went wrong at our end. Nothing you entered was lost." | Log with request id; preserve form state client-side |
| E-18 | Session expired mid-edit | 401 | "You've been signed out. Sign in and we'll bring you back here." | Preserve draft in local storage; return after auth |

---

## 8. Implementation checklist

### Foundation
- [ ] Next.js 15 App Router + TypeScript strict + Tailwind v4
- [ ] Repo restructure: `public/images`, legacy site preserved under `legacy/`
- [ ] Design tokens, fonts, and the shared UI primitives
- [ ] Supabase clients: browser, server component, route handler, middleware
- [ ] Auth middleware with role-based routing and return-to
- [ ] Security headers and CSP in `next.config.ts`

### Database
- [ ] Migration: enums, tables, indexes, sequences for references
- [ ] Migration: RLS enabled on every table, owner/staff/client policies with `WITH CHECK`
- [ ] Migration: triggers — reference allocation, total recalculation, `job_event` on status change, `updated_at`
- [ ] Migration: storage buckets `job-photos` and `enquiry-photos` with policies
- [ ] Seed: services, settings singleton, price-list starters

### Public site
- [ ] Home, Services, About, Work, Contact
- [ ] Privacy, Terms, custom 404
- [ ] SEO meta, OG image, sitemap, robots, `LocalBusiness` JSON-LD

### Enquiry
- [ ] Multi-step request form with client-side downscaling
- [ ] Server action with Zod validation, honeypot, rate limit
- [ ] Owner notification and client confirmation emails

### Client portal
- [ ] Magic-link sign-in and callback
- [ ] Job list, job detail with plain-English timeline
- [ ] Quote view with Accept / Decline
- [ ] Invoice list, invoice detail, PDF download
- [ ] Message thread

### Owner app
- [ ] Dashboard
- [ ] Enquiry inbox and conversion
- [ ] Job list, job detail, status control, scheduling
- [ ] Calendar day and week views
- [ ] Client list, client detail
- [ ] Quote builder and send
- [ ] Invoice builder, issue, PDF, record payment
- [ ] Settings: business details, bank details, VAT/CIS toggles, price list

### PWA
- [ ] Manifest, maskable icons, theme colour
- [ ] Service worker: precache shell, network-first data, cache-first assets
- [ ] IndexedDB outbox with Background Sync and `online` fallback
- [ ] Install prompt, offline indicator, safe-area insets

### Verification
- [ ] `tsc --noEmit` and `next build` clean
- [ ] Every acceptance criterion in section 6 exercised
- [ ] RLS verified by attempting cross-client reads as a real client session
- [ ] Lighthouse pass on marketing and owner routes
- [ ] README with Supabase setup and deploy steps written for a non-technical reader
