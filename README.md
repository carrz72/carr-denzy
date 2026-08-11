# Carr Denzy Plumbing & Gas

A marketing site, customer portal and job-management app for a single-owner
plumbing and gas business. Built as one Next.js application on Supabase, and
installable to a phone home screen as a PWA.

The shape of it:

| Area | Routes | Who |
| --- | --- | --- |
| Marketing site | `/`, `/services`, `/work`, `/about`, `/contact` | Anyone |
| Enquiry | `/request` | Anyone, no account |
| Customer portal | `/portal/**` | Signed-in customer |
| Owner app | `/app/**` | Owner (and staff, where allowed) |

The working loop is: enquiry → job → quote → customer accepts → booked in →
work done → invoice → payment recorded.

---

## Running it

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill it in — every variable is
documented in that file. Then:

```bash
npm run dev
```

Other scripts:

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run db:push    # apply migrations to the linked Supabase project
```

### Database

Migrations live in `supabase/migrations` and are applied in filename order:

| File | What it sets up |
| --- | --- |
| `…_init.sql` | Tables, enums, reference sequences |
| `…_functions.sql` | Triggers: totals, references, the job status machine |
| `…_rls.sql` | Row Level Security on every table, plus storage buckets |
| `…_seed.sql` | Services, the settings singleton, a starter price list |
| `…_rate_limit.sql` | Enquiry-form rate limiting |

```bash
npx supabase link --project-ref <your-ref>
npm run db:push
```

### Becoming the owner

Set `OWNER_EMAIL` in `.env.local` **before** signing in for the first time.
Everyone is created as a `client`; the auth callback promotes that one address
to `owner` using the service key. A role is never writable by the user it
belongs to.

---

## Things that will bite you

These are the conventions that look like details and are not. Breaking one
produces a bug that is quiet and expensive.

### Money is integer pence. Always.

There is no float anywhere in the pipeline. Quantities are integers multiplied
by 1000, so 2.5 hours is `2500`. `src/lib/money.ts` mirrors the SQL functions in
`…_functions.sql` — **if you change the rounding in one, change it in the
other.**

### The app never writes a total

Subtotals, VAT, CIS and totals are computed by database trigger from the line
items. Server actions send lines and nothing else, so there is no total in any
request payload for a crafted one to overwrite. If a total looks wrong, the
lines are wrong.

### Row types must stay `type`, not `interface`

In `src/types/database.ts`, every row type is a `type` alias. postgrest-js needs
them to satisfy `Record<string, unknown>`, and an `interface` silently degrades
the inferred schema to `never` — the code still compiles, it just stops
type-checking your queries.

The `Relationships` entries in the same file are load-bearing too: an empty
array makes every joined `select` collapse to `SelectQueryError`.

### Issued documents are immutable

A `sent`, `part_paid` or `paid` invoice refuses edits to its line items, and an
`accepted` quote does the same. Both are enforced by trigger, not by the UI. The
correct response to a mistake is a credit note or a new quote.

### RLS does the filtering, not the query

Portal pages deliberately contain no `.eq("client_id", …)`. Row Level Security
scopes every read to the caller at the database, so a mistake in a component
cannot leak another customer's work. Do not add the filter back "to be safe" —
it hides whether the policy is actually doing its job.

### Times are stored UTC, displayed Europe/London

Always format through `src/lib/dates.ts`. A job booked for 09:00 on the day the
clocks change must still read 09:00.

---

## Offline

The owner works in basements and plant rooms. Job notes written with no signal
are queued in IndexedDB (`src/lib/outbox.ts`) and replayed:

1. **Background Sync** via `public/sw.js`, where the browser supports it
   (Chromium). Replays even if the app was closed.
2. **The `online` event**, everywhere else. Safari and Firefox have no
   Background Sync, so the app must be open for the queue to drain. That is a
   documented limitation, not a silent failure.

Every queued item carries a `client_key` covered by a unique index, so a replay
that overlaps with the page draining the same queue is discarded rather than
duplicated.

`<OfflineIndicator />` in the app shell is what starts the watcher and registers
the worker. If it stops being mounted, the queue stops draining.

The service worker **never caches HTML** — every page behind `/app` and
`/portal` is specific to who is signed in, and a cached page served to the next
person on a shared device would be a data leak. Only hashed assets and
`public/offline.html` come from the cache.

---

## Layout

```
src/
  app/
    (marketing)/      Public site
    (portal)/portal/  Customer portal      — actions.ts holds its server actions
    (app)/app/        Owner app            — actions.ts holds its server actions
    api/outbox/       Offline replay endpoint
    auth/             Magic-link callback and sign-out
    manifest.ts       PWA manifest
  components/
    ui/               Button, field, badge, surface, states
    owner/            Line editor, builders, settings, job controls
    portal/           Quote response, details form
    money-document.tsx  Read-only quote/invoice rendering, shared by both sides
  lib/
    money.ts dates.ts validation.ts auth.ts supabase/ outbox.ts
  types/database.ts   Generated-shape schema types
supabase/migrations/
specs/                The written spec and the design system
public/icons/         Generated PWA icons
```

Server actions are grouped by audience, not by entity: `(app)/app/actions.ts`
requires owner or staff on every export, `(portal)/portal/actions.ts` requires a
signed-in user. Keeping the authorisation check uniform per file is what makes
a missing one obvious.

---

## Decisions already made

Recorded so they are not relitigated:

- **Next.js 15 + Tailwind v4 on Vercel.** Not a separate API.
- **Not VAT registered, no CIS.** Both engines are built and switched off in
  settings. Turning either on is a settings change, not a migration.
- **Bank transfer only.** No Stripe, no card fees.
- **Single-owner UI on a team-ready schema.** `assigned_to`, the `staff` role
  and its RLS policies all exist; the assignment UI is simply not shown while
  there is one person.
- **No `asChild` / Slot.** Links that look like buttons use `buttonClasses()` on
  a real `<Link>`, so middle-click and "open in new tab" keep working.
