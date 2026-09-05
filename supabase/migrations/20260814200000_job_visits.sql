-- ===========================================================================
-- Jobs that take more than a day.
--
-- The app assumed one job meant one appointment: `jobs.scheduled_start` plus a
-- duration capped at 24 hours, and a validation message telling the owner to
-- "split it into separate visits" with nowhere to put them. For a boiler
-- service that is exactly right. For a house refurbishment it is not — the
-- work runs for weeks, the owner is on site on particular days, and there was
-- no way to say either thing.
--
-- The shape chosen, deliberately, is: a start date and an expected length for
-- the job as a whole, plus a row per day actually being worked. It matches how
-- the work runs — "we start on the 6th, expect about three weeks, and I'll be
-- with you Monday, Tuesday and Friday this week" — and it means the customer
-- can be told the shape of the job once instead of getting an email for every
-- day of it.
--
-- `jobs.scheduled_start` stays, and stays authoritative for "what is next".
-- Every screen that answers "where am I going today" reads it, and rewriting
-- all of them to aggregate a child table would be a large change for no gain.
-- It is now maintained by trigger from the visits rather than written directly,
-- so there is still exactly one source of truth — the visits — and one derived
-- convenience column that cannot drift from them.
-- ===========================================================================

create table if not exists job_visits (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id) on delete cascade,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 480
                     check (duration_minutes between 15 and 1440),
  -- "First fix", "plasterer in", "second coat". Optional, and shown to the
  -- customer, so it earns its place only when it says something useful.
  note             text check (note is null or char_length(note) between 1 and 200),
  created_at       timestamptz not null default now()
);

create index if not exists job_visits_job_id_idx on job_visits (job_id, starts_at);
create index if not exists job_visits_starts_at_idx on job_visits (starts_at);

-- Two visits cannot start at the same minute on the same job — that is a
-- double tap, not a plan.
create unique index if not exists job_visits_no_duplicates_idx
  on job_visits (job_id, starts_at);

-- How long the whole job is expected to take, in working days. Null means a
-- single visit, which is the overwhelming majority of jobs.
alter table jobs
  add column if not exists expected_days integer
    check (expected_days is null or expected_days between 1 and 260);

comment on column jobs.expected_days is
  'Working days the whole job is expected to take. Null for a single-visit job. Told to the customer once, rather than implied by a stream of booking emails.';

comment on column jobs.scheduled_start is
  'The next day the owner is due on site. DERIVED from job_visits by trigger — do not write to it directly.';

-- ---------------------------------------------------------------------------
-- Keeping `jobs.scheduled_start` in step with the visits.
--
-- "Next" means the earliest visit that has not happened yet. Once every visit
-- is in the past the last one is kept rather than nulling the column, because
-- a finished job showing no date at all reads as though it was never booked.
-- ---------------------------------------------------------------------------

create or replace function public.sync_job_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid := coalesce(new.job_id, old.job_id);
  v_start timestamptz;
  v_duration integer;
begin
  select starts_at, duration_minutes
    into v_start, v_duration
    from job_visits
   where job_id = v_job
     and starts_at >= now()
   order by starts_at
   limit 1;

  if v_start is null then
    select starts_at, duration_minutes
      into v_start, v_duration
      from job_visits
     where job_id = v_job
     order by starts_at desc
     limit 1;
  end if;

  update jobs
     set scheduled_start = v_start,
         duration_minutes = v_duration
   where id = v_job;

  return null;
end;
$$;

drop trigger if exists job_visits_sync on job_visits;

create trigger job_visits_sync
  after insert or update or delete on job_visits
  for each row execute function public.sync_job_schedule();

-- ---------------------------------------------------------------------------
-- Row Level Security. Same shape as job_notes: staff manage, customers read
-- their own — a customer being able to see which days you are coming is the
-- entire point of telling them.
-- ---------------------------------------------------------------------------

alter table job_visits enable row level security;

drop policy if exists "staff manages visits" on job_visits;
create policy "staff manages visits"
  on job_visits for all to authenticated
  using (is_staff_or_owner())
  with check (is_staff_or_owner());

drop policy if exists "client reads visits on own jobs" on job_visits;
create policy "client reads visits on own jobs"
  on job_visits for select to authenticated
  using (
    job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: every job already booked in becomes a job with one visit, so the
-- diary and the Today screen carry on showing exactly what they showed before.
-- ---------------------------------------------------------------------------

insert into job_visits (job_id, starts_at, duration_minutes)
select id, scheduled_start, coalesce(duration_minutes, 60)
  from jobs
 where scheduled_start is not null
   and deleted_at is null
   and not exists (select 1 from job_visits v where v.job_id = jobs.id)
on conflict do nothing;
