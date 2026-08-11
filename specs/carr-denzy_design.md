# Technical design — Carr Denzy

Companion to `carr-denzy.spec.md`. Three perspectives: Frontend, Backend, Security.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
   Prospect ───────▶│  Next.js 15 App Router (Vercel)     │
   Client   ───────▶│  ├── (marketing)  public, static    │
   Owner    ───────▶│  ├── (portal)     client, RSC       │
                    │  ├── (app)        owner, RSC        │
                    │  └── server actions + route handlers│
                    └──────────────┬──────────────────────┘
                                   │  @supabase/ssr, cookie session
                    ┌──────────────▼──────────────────────┐
                    │  Supabase                            │
                    │  ├── Postgres + RLS (the real gate)  │
                    │  ├── Auth (magic link)               │
                    │  └── Storage (job/enquiry photos)    │
                    └──────────────────────────────────────┘
   Service worker + IndexedDB outbox sit in front of every owner write.
```

**Why RLS is the authorisation boundary, not the route group.** Route groups (`(app)` vs `(portal)`) control *navigation*. They are convenience. Authorisation lives in Postgres policies, so a forged request straight to PostgREST fails identically to a forged request through the app. The middleware redirect is UX; the policy is the gate.

---

## Frontend

**Rendering.** Marketing pages are static. Portal and owner pages are React Server Components that read through the user's own Supabase session, so RLS filters the query rather than the component filtering the result. Mutations are server actions — no hand-written fetch layer, no API surface to forget to protect.

**State.** Deliberately thin. Server components hold server state. `useOptimistic` covers the two places latency is felt (adding a job note, changing job status). The only genuinely client-side store is the offline outbox.

**Money in the UI.** Integer pence everywhere, formatted once at the render edge via `Intl.NumberFormat('en-GB', { currency: 'GBP' })`. No component receives a float. Figures render in a tabular-figures font so columns align.

**Forms.** Every field carries a persistent `<label>`, a `describedby` hint where the ask is non-obvious, and inline errors wired to `aria-live="polite"`. The owner's forms are single-column at every breakpoint — multi-column forms are where non-technical users lose their place.

**Design language.** Warm off-white base (`#FAF7F2`), ink text, a single desaturated brick accent derived from the old `#fc2020` but taken from 97% to 62% saturation so it stops shouting. Bricolage Grotesque for display, Geist for body, Geist Mono with tabular figures for money. No three-equal-card feature row; the services block is an asymmetric grid with variable-height cards and bottom-pinned actions.

**Accessibility baseline.** 44 px minimum targets, visible focus rings at 3:1, skip link, `prefers-reduced-motion` honoured, `min-height: 100dvh` rather than `100vh` so iOS Safari doesn't jump.

---

## Backend

**Data.** Postgres. Money as `integer` pence. Timestamps as `timestamptz`. Enums for statuses so an invalid value cannot be stored at all.

**Reference numbers.** Allocated by a `BEFORE INSERT` trigger reading a dedicated sequence, inside the insert transaction. Generating them in application code with `SELECT max(...) + 1` is the classic way to hand two invoices the same number under concurrency; this avoids it structurally (NFR-21, AC-7).

**Totals.** Recalculated by trigger on every change to a line item — subtotal, tax, deduction, total. The application never writes a total, and a client-supplied total is discarded before it reaches the database (NFR-15, AC-5).

**Status transitions.** A `job_status_transition_allowed(from, to)` function encodes the state machine from spec §3. The trigger refuses illegal moves and writes a `job_event` on every legal one, giving an immutable audit timeline for free.

**Soft deletes.** `deleted_at` on jobs, quotes and invoices. Financial records are retained six years (NFR-24, FR-58); nothing user-facing offers a hard delete.

**VAT/CIS.** Built and dormant. `settings.vat_registered` is `false` and `settings.cis_enabled` is `false` for this business, and the invoice renderer branches on those flags. Turning VAT on later is a settings change plus a rate on each line, not a schema migration — which is why the columns exist now.

**Email.** Resend, called from server actions. A send failure never fails the transaction: the record persists and the UI offers a copyable link instead (E-15).

---

## Security

Checklist walked before implementation, per the fullstack-guardian workflow.

| Control | Decision |
| --- | --- |
| **Authentication** | Supabase magic link. No passwords stored, so no password to leak, and nothing for a non-technical owner to reset. Sessions in httpOnly cookies via `@supabase/ssr`. |
| **Authorisation** | RLS on every `public` table. Role read from `app_metadata` in the JWT, not from a table, so policy evaluation costs no extra query. `is_owner()` is a `SECURITY DEFINER` helper marked `STABLE`. |
| **Role escalation** | `profiles.role` is not writable by any client-reachable policy. Only the `service_role` key, server-side, can set `owner` or `staff`. A client cannot promote themselves (FR-18). |
| **Policy hygiene** | No `USING (true)` for `authenticated`. Every `INSERT`/`UPDATE` policy carries `WITH CHECK`. Identity always via `auth.uid()` (NFR-11, NFR-12, NFR-14). |
| **Input validation** | Zod schema on every server action. Client-side validation is UX only and is re-run on the server. |
| **Injection** | PostgREST parameterises everything. No raw SQL string interpolation anywhere in application code. |
| **Output encoding** | React escapes by default. `dangerouslySetInnerHTML` is used in exactly one place — the `LocalBusiness` JSON-LD block — with a hard-coded object, never user content. |
| **File upload** | MIME and size checked client-side and again server-side. Stored in private Supabase Storage buckets with RLS keyed to job ownership. Served only through short-lived signed URLs; no public bucket. |
| **Existence leaks** | Cross-tenant access returns 404, not 403, so a client cannot enumerate which job ids exist (E-6, AC-3). |
| **Rate limiting** | Enquiry submission capped per IP per hour, plus a honeypot field. Sign-in throttling is Supabase's own. |
| **Secrets** | `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are server-only env vars, never prefixed `NEXT_PUBLIC_`. A grep for `SERVICE_ROLE` in `app/**` returning a client component is a build-blocking error. |
| **Headers** | CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`. |
| **Audit** | `audit_log` written on sign-in, role change, quote send/accept, invoice issue, and payment recording (NFR-18). |
| **Offline data at rest** | The IndexedDB outbox holds job notes and photo blobs on the owner's device. It stores no card data — there is none — and is cleared on sign-out. |

### Residual risks accepted

- **iOS storage eviction.** Safari may evict IndexedDB after ~7 days of inactivity. Mitigated by requesting persistent storage on install (FR-68) and by the outbox being short-lived by design; not fully solvable on iOS.
- **Background Sync support.** Chromium only. Safari and Firefox fall back to replay on the `online` event, which requires the app to be open. Documented behaviour, not a silent failure.
- **Single owner account.** No 2FA beyond email possession. Acceptable for a business of this size; the magic-link inbox is the security boundary, and that is stated in the handover README.
