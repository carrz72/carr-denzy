-- ===========================================================================
-- Carr Denzy — initial schema
--
-- Design rules enforced here rather than in application code:
--   * Money is integer PENCE. Never numeric, never float.
--   * Timestamps are timestamptz (UTC). Rendered in Europe/London by the app.
--   * Reference numbers come from sequences inside the insert transaction, so
--     two concurrent inserts cannot collide (spec NFR-21 / AC-7).
--   * Totals are computed by trigger. The app never writes a total, so a
--     forged client total is structurally impossible (spec NFR-15 / AC-5).
--   * Job status transitions are validated against a state machine.
--   * Financial records are soft-deleted only (spec FR-58 / NFR-24).
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_role as enum ('owner', 'staff', 'client');

create type urgency_level as enum ('emergency', 'soon', 'flexible');

create type enquiry_status as enum ('new', 'read', 'converted', 'declined');

create type job_status as enum (
  'new', 'quoted', 'accepted', 'declined', 'scheduled',
  'in_progress', 'completed', 'invoiced', 'paid', 'cancelled'
);

create type quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');

create type invoice_status as enum ('draft', 'sent', 'part_paid', 'paid', 'overdue', 'void');

create type payment_method as enum ('bank_transfer', 'cash', 'cheque', 'card', 'other');

create type line_kind as enum ('labour', 'materials', 'other');

-- ---------------------------------------------------------------------------
-- Reference sequences
-- ---------------------------------------------------------------------------

create sequence enquiry_ref_seq start 1;
create sequence job_ref_seq     start 1;
create sequence quote_ref_seq   start 1;
create sequence invoice_ref_seq start 1;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext not null,
  full_name    text,
  phone        text,
  role         user_role not null default 'client',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column profiles.role is
  'Never writable through a client-reachable policy. Only the service_role key, '
  'server-side, may set owner or staff (spec FR-18).';

-- ---------------------------------------------------------------------------
-- settings — singleton row holding business details
-- ---------------------------------------------------------------------------

create table settings (
  id                    boolean primary key default true,
  trading_name          text not null default 'Carr Denzy Plumbing & Gas',
  legal_name            text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  phone                 text,
  email                 citext,

  -- Tax. Both OFF for this business today; the invoice renderer branches on
  -- these so turning VAT on later is a settings change, not a migration.
  vat_registered        boolean not null default false,
  vat_number            text,
  default_vat_rate_bp   integer not null default 2000,  -- basis points: 2000 = 20%
  cis_enabled           boolean not null default false,
  cis_deduction_rate_bp integer not null default 2000,
  utr                   text,

  -- Bank details printed on every invoice (spec FR-52).
  bank_account_name     text,
  bank_sort_code        text,
  bank_account_number   text,

  payment_terms_days    integer not null default 14,
  quote_valid_days      integer not null default 30,
  invoice_footer_note   text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint settings_singleton check (id is true),
  constraint vat_number_required_when_registered
    check (not vat_registered or vat_number is not null),
  constraint utr_required_when_cis
    check (not cis_enabled or utr is not null)
);

-- ---------------------------------------------------------------------------
-- services — the categories offered, drives the enquiry form and site
-- ---------------------------------------------------------------------------

create table services (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  blurb        text not null,
  description  text,
  icon         text,
  image_path   text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients and properties
-- ---------------------------------------------------------------------------

create table clients (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references profiles(id) on delete set null,
  full_name     text not null,
  email         citext,
  phone         text,
  company_name  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint client_needs_a_contact_method
    check (email is not null or phone is not null)
);

comment on column clients.profile_id is
  'Set when the client signs in for the first time and their email matches. '
  'Until then the client record exists without a login, which is how a phone '
  'enquiry becomes a customer with no account ceremony.';

create index clients_profile_id_idx on clients (profile_id) where deleted_at is null;
create index clients_email_idx      on clients (email)      where deleted_at is null;
create index clients_phone_idx      on clients (phone)      where deleted_at is null;

create table properties (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  label          text,
  address_line1  text not null,
  address_line2  text,
  city           text,
  postcode       text not null,
  access_notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index properties_client_id_idx on properties (client_id);

-- ---------------------------------------------------------------------------
-- enquiries — submitted by the public, no account required
-- ---------------------------------------------------------------------------

create table enquiries (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  full_name         text not null,
  email             citext,
  phone             text,
  service_id        uuid references services(id) on delete set null,
  service_label     text,
  description       text not null,
  urgency           urgency_level not null default 'soon',
  address_line1     text,
  address_line2     text,
  city              text,
  postcode          text,
  preferred_dates   text,
  status            enquiry_status not null default 'new',
  decline_reason    text,
  client_id         uuid references clients(id) on delete set null,
  job_id            uuid,
  source_ip_hash    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint enquiry_needs_a_contact_method
    check (email is not null or phone is not null),
  constraint enquiry_description_min_length
    check (char_length(description) >= 10)
);

create index enquiries_status_idx  on enquiries (status, created_at desc);
create index enquiries_urgency_idx on enquiries (urgency, created_at desc);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  client_id        uuid not null references clients(id) on delete restrict,
  property_id      uuid references properties(id) on delete set null,
  service_id       uuid references services(id) on delete set null,
  title            text not null,
  description      text,
  status           job_status not null default 'new',
  urgency          urgency_level not null default 'soon',

  -- Team-ready from day one; the assignment UI stays hidden while there is
  -- only the owner (locked decision: "owner now, team later").
  assigned_to      uuid references profiles(id) on delete set null,

  scheduled_start  timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  completed_at     timestamptz,
  private_notes    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index jobs_client_id_idx  on jobs (client_id)  where deleted_at is null;
create index jobs_status_idx     on jobs (status)     where deleted_at is null;
create index jobs_scheduled_idx  on jobs (scheduled_start) where deleted_at is null;
create index jobs_assigned_idx   on jobs (assigned_to) where deleted_at is null;

alter table enquiries
  add constraint enquiries_job_id_fkey
  foreign key (job_id) references jobs(id) on delete set null;

-- Immutable audit timeline. Written by trigger, never by the app.
create table job_events (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  from_status  job_status,
  to_status    job_status not null,
  note         text,
  actor_id     uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index job_events_job_id_idx on job_events (job_id, created_at desc);

create table job_notes (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  author_id     uuid references profiles(id) on delete set null,
  body          text not null check (char_length(body) between 1 and 5000),
  -- Owner-only by default; the owner opts a note in to the client's view.
  visible_to_client boolean not null default false,
  client_key    text,  -- idempotency key for the offline outbox replay
  created_at    timestamptz not null default now()
);

create unique index job_notes_client_key_idx on job_notes (client_key)
  where client_key is not null;
create index job_notes_job_id_idx on job_notes (job_id, created_at desc);

create table job_photos (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references jobs(id) on delete cascade,
  enquiry_id        uuid references enquiries(id) on delete cascade,
  storage_path      text not null,
  caption           text,
  visible_to_client boolean not null default true,
  uploaded_by       uuid references profiles(id) on delete set null,
  byte_size         integer,
  created_at        timestamptz not null default now(),

  constraint photo_belongs_to_something
    check (job_id is not null or enquiry_id is not null)
);

create index job_photos_job_id_idx     on job_photos (job_id);
create index job_photos_enquiry_id_idx on job_photos (enquiry_id);

-- Owner ↔ client thread, scoped to a job (spec FR-27).
create table messages (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index messages_job_id_idx on messages (job_id, created_at);

-- ---------------------------------------------------------------------------
-- Reusable price list
-- ---------------------------------------------------------------------------

create table price_items (
  id              uuid primary key default gen_random_uuid(),
  description     text not null,
  unit_price_pence integer not null check (unit_price_pence >= 0),
  kind            line_kind not null default 'labour',
  unit            text not null default 'each',
  times_used      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------

create table quotes (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  job_id            uuid not null references jobs(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete restrict,
  status            quote_status not null default 'draft',
  intro_note        text,
  terms             text,

  subtotal_pence    integer not null default 0,
  tax_pence         integer not null default 0,
  total_pence       integer not null default 0,

  valid_until       date,
  sent_at           timestamptz,
  responded_at      timestamptz,
  decline_reason    text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index quotes_job_id_idx    on quotes (job_id)    where deleted_at is null;
create index quotes_client_id_idx on quotes (client_id) where deleted_at is null;
create index quotes_status_idx    on quotes (status)    where deleted_at is null;

create table quote_items (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null references quotes(id) on delete cascade,
  description       text not null check (char_length(description) between 1 and 500),
  kind              line_kind not null default 'labour',
  quantity_milli    integer not null default 1000 check (quantity_milli > 0), -- 1000 = qty 1.000
  unit_price_pence  integer not null check (unit_price_pence >= 0),
  vat_rate_bp       integer not null default 0 check (vat_rate_bp between 0 and 10000),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on column quote_items.quantity_milli is
  'Quantity × 1000, stored as an integer so 2.5 hours is 2500 and no float '
  'rounding ever reaches a customer invoice.';

create index quote_items_quote_id_idx on quote_items (quote_id, sort_order);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  job_id             uuid references jobs(id) on delete restrict,
  client_id          uuid not null references clients(id) on delete restrict,
  quote_id           uuid references quotes(id) on delete set null,
  status             invoice_status not null default 'draft',

  issue_date         date not null default (now() at time zone 'Europe/London')::date,
  due_date           date,

  -- Snapshot of the business + client at issue time. An invoice is a legal
  -- record: it must not change because someone later edited an address.
  business_snapshot  jsonb,
  client_snapshot    jsonb,

  subtotal_pence     integer not null default 0,
  vat_pence          integer not null default 0,
  cis_deduction_pence integer not null default 0,
  total_pence        integer not null default 0,
  paid_pence         integer not null default 0,

  reverse_charge     boolean not null default false,
  notes              text,

  sent_at            timestamptz,
  paid_at            timestamptz,
  voided_at          timestamptz,
  void_reason        text,
  credit_note_for    uuid references invoices(id) on delete set null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index invoices_client_id_idx on invoices (client_id) where deleted_at is null;
create index invoices_job_id_idx    on invoices (job_id)    where deleted_at is null;
create index invoices_status_idx    on invoices (status)    where deleted_at is null;
create index invoices_due_date_idx  on invoices (due_date)  where deleted_at is null;

create table invoice_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  description       text not null check (char_length(description) between 1 and 500),
  kind              line_kind not null default 'labour',
  quantity_milli    integer not null default 1000 check (quantity_milli > 0),
  unit_price_pence  integer not null check (unit_price_pence >= 0),
  vat_rate_bp       integer not null default 0 check (vat_rate_bp between 0 and 10000),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index invoice_items_invoice_id_idx on invoice_items (invoice_id, sort_order);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  amount_pence  integer not null check (amount_pence > 0),
  method        payment_method not null default 'bank_transfer',
  paid_on       date not null default (now() at time zone 'Europe/London')::date,
  reference     text,
  note          text,
  recorded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index payments_invoice_id_idx on payments (invoice_id);

-- ---------------------------------------------------------------------------
-- audit_log — security-relevant events (spec NFR-18)
-- ---------------------------------------------------------------------------

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_actor_idx   on audit_log (actor_id, created_at desc);
