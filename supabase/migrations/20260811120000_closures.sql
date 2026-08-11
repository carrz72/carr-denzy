-- ===========================================================================
-- Carr Denzy — closures
--
-- Days the business is not working: a holiday, a family thing, a week on a big
-- job with no capacity for anything else.
--
-- Stored as ranges rather than one row per day. A fortnight away is one fact,
-- and recording it as fourteen rows makes cancelling it fourteen deletes.
--
-- The public site reads this, which is the point: somebody with a burst pipe
-- at 7am on a Saturday deserves to be told the emergency line is not being
-- answered, rather than ringing four times and giving up on the business.
-- ===========================================================================

create table closures (
  id            uuid primary key default gen_random_uuid(),

  starts_on     date not null,
  ends_on       date not null,

  -- Shown to customers, so it is written for them and not for the diary.
  -- Null falls back to neutral wording rather than exposing a blank.
  reason        text check (reason is null or char_length(reason) <= 120),

  -- Most time off still leaves the phone on for a genuine emergency. When this
  -- is false the public notice says so explicitly instead of implying nothing.
  emergencies_only boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint closure_ends_after_it_starts check (ends_on >= starts_on)
);

create index closures_range_idx on closures (starts_on, ends_on);

create trigger closures_updated_at
  before update on closures
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — anyone may read, only the owner may write.
-- ---------------------------------------------------------------------------

alter table closures enable row level security;

create policy "anyone reads closures"
  on closures for select to anon, authenticated
  using (true);

create policy "owner writes closures"
  on closures for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- The one question every surface asks: are we shut, and until when?
--
-- A function rather than a view so the London date is resolved server-side —
-- a browser in another timezone must not be able to shift what "today" means.
-- ---------------------------------------------------------------------------

create or replace function current_closure()
returns table (
  id uuid,
  starts_on date,
  ends_on date,
  reason text,
  emergencies_only boolean,
  is_active boolean
)
language sql
stable
as $$
  with today as (
    select (now() at time zone 'Europe/London')::date as d
  )
  select
    c.id,
    c.starts_on,
    c.ends_on,
    c.reason,
    c.emergencies_only,
    (t.d between c.starts_on and c.ends_on) as is_active
  from closures c, today t
  -- Whatever is on now, plus anything starting within a fortnight so the site
  -- can warn before it begins rather than only once it has.
  where c.ends_on >= t.d
    and c.starts_on <= t.d + 14
  order by c.starts_on
  limit 1;
$$;
