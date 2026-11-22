-- ===========================================================================
-- Reminders, and the owner's control over them.
--
-- Three parts:
--
--   1. Switches. Each kind of automatic email can be turned off for the whole
--      business (settings), for one customer (clients.auto_reminders), or for
--      one invoice, quote or job (chase_controls), including "they have said
--      they will pay by Friday" (paused_until).
--   2. Day-before visit reminders (job_visits.reminder_sent_at).
--   3. the owner's own to-do list (owner_reminders): things they asked to be
--      reminded about ("ring Mrs Patel back") and nudges the app adds itself
--      (a finished job with no invoice). A database schedule checks every
--      minute and calls the site, which pushes them to their phone.
-- ===========================================================================

-- --- 1. Switches -----------------------------------------------------------

alter table settings
  add column if not exists remind_invoices boolean not null default true,
  add column if not exists invoice_reminder_every_days integer not null default 7,
  add column if not exists remind_quotes boolean not null default true,
  add column if not exists remind_visits boolean not null default true,
  add column if not exists nudge_unbilled boolean not null default true,
  add column if not exists nudge_quotes boolean not null default true,
  add column if not exists nudge_promises boolean not null default true;

alter table settings drop constraint if exists settings_invoice_reminder_every_days_check;
alter table settings add constraint settings_invoice_reminder_every_days_check
  check (invoice_reminder_every_days between 3 and 30);

-- Owner's choice, never the customer's: they can edit their own row (name,
-- phone, notification preferences), so the guard below stops them changing this.
alter table clients add column if not exists auto_reminders boolean not null default true;

create or replace function public.guard_client_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_staff_or_owner() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.created_at is distinct from old.created_at
     or new.deleted_at is distinct from old.deleted_at
     or new.auto_reminders is distinct from old.auto_reminders then
    raise exception 'Those details cannot be changed here.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Per invoice, quote or job. Its own table because customers can read their
-- own invoice and quote rows, and the note ("rang Tues, paying Friday") is
-- the owner's, not theirs.
create table if not exists chase_controls (
  entity text not null check (entity in ('invoice', 'quote', 'job')),
  entity_id uuid not null,
  paused_until date,
  stopped boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  primary key (entity, entity_id)
);

alter table chase_controls enable row level security;

drop policy if exists "staff manage chase controls" on chase_controls;
create policy "staff manage chase controls"
  on chase_controls for all to authenticated
  using (is_staff_or_owner())
  with check (is_staff_or_owner());

revoke all on chase_controls from anon;

-- --- 2. Day-before visit reminders -----------------------------------------

alter table job_visits add column if not exists reminder_sent_at timestamptz;

-- --- 3. the owner's to-do list --------------------------------------------------

create table if not exists owner_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz not null,
  kind text not null default 'manual'
    check (kind in ('manual', 'unbilled_job', 'quote_lapsed', 'promise_due')),
  -- One automatic nudge per thing: "unbilled:<job id>", "quote:<quote id>"...
  auto_key text unique,
  job_id uuid references jobs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  enquiry_id uuid references enquiries(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  quote_id uuid references quotes(id) on delete cascade,
  done_at timestamptz,
  pushed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists owner_reminders_open_idx
  on owner_reminders (due_at) where done_at is null;

alter table owner_reminders enable row level security;

drop policy if exists "staff manage reminders" on owner_reminders;
create policy "staff manage reminders"
  on owner_reminders for all to authenticated
  using (is_staff_or_owner())
  with check (is_staff_or_owner());

revoke all on owner_reminders from anon;

-- --- The every-minute check --------------------------------------------------
--
-- The key that proves a call came from this database. Made here by the
-- database itself, so it is never typed or pasted anywhere; the site reads it
-- back with the service role to compare. No API role but the service role can
-- see it.
create table if not exists job_keys (
  name text primary key,
  key text not null default encode(extensions.gen_random_bytes(32), 'hex')
);

alter table job_keys enable row level security;
revoke all on job_keys from anon, authenticated;
grant select on job_keys to service_role;

insert into job_keys (name) values ('due-reminders') on conflict (name) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Calls the site only when something is actually due, so a quiet day costs
-- one cheap query a minute and no web requests.
do $$
begin
  perform cron.unschedule('owner-reminders')
    where exists (select 1 from cron.job where jobname = 'owner-reminders');
end;
$$;

select cron.schedule(
  'owner-reminders',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://www.carrdenzy.com/api/cron/due-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reminder-key', (select key from public.job_keys where name = 'due-reminders')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
    where exists (
      select 1 from public.owner_reminders
       where done_at is null and pushed_at is null and due_at <= now()
    );
  $job$
);
