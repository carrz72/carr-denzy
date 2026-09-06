-- ===========================================================================
-- Carr Denzy — more than one person on a customer account
--
-- Until now `clients.profile_id` was a single column: one customer record, one
-- login. That fails the cases this business actually has —
--
--   * a landlord whose office manager books the work,
--   * a couple where both want to see the quote,
--   * a letting agent with three staff covering the same properties.
--
-- and it failed them *silently*: the second person signs in with their own
-- email, `handle_new_user()` finds no customer with that address, and they get
-- a working account that shows nothing at all.
--
-- Two roles, not one:
--
--   manager  can do everything the named customer can, including accepting a
--            quote — which commits real money.
--   viewer   sees jobs, dates, quotes and invoices, and cannot respond.
--
-- Viewer is the default deliberately. An office manager should not be able to
-- commit their employer to £4,000 of work by tapping a button they were only
-- meant to be reading.
-- ===========================================================================

create type client_member_role as enum ('manager', 'viewer');

create table client_members (
  id          uuid primary key default gen_random_uuid(),

  client_id   uuid not null references clients(id) on delete cascade,

  -- Null until they first sign in. The email is what an invitation is sent to
  -- and what the auth trigger matches on, exactly as `clients.email` already
  -- works — so a member can be added long before they have an account.
  profile_id  uuid references profiles(id) on delete cascade,
  email       citext not null,

  role        client_member_role not null default 'viewer',

  invited_by  uuid references profiles(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per person per customer. Re-inviting updates the role rather than
  -- stacking duplicates.
  unique (client_id, email)
);

create index client_members_profile_idx on client_members (profile_id);
create index client_members_email_idx on client_members (email);

create trigger client_members_updated_at
  before update on client_members
  for each row execute function set_updated_at();

comment on table client_members is
  'People who can see a customer account. The named customer on clients.profile_id '
  'is implicitly a manager and does not need a row here, but gets one on backfill '
  'so the list is complete and they can be shown alongside everyone else.';

-- ---------------------------------------------------------------------------
-- Backfill: everyone who already has access keeps it, as a manager.
-- ---------------------------------------------------------------------------

insert into client_members (client_id, profile_id, email, role)
select c.id, c.profile_id, coalesce(c.email, p.email), 'manager'
  from clients c
  join profiles p on p.id = c.profile_id
 where c.profile_id is not null
   and c.deleted_at is null
   and coalesce(c.email, p.email) is not null
on conflict (client_id, email) do nothing;

-- ---------------------------------------------------------------------------
-- The chokepoint.
--
-- Every client-facing policy in this schema filters on `my_client_ids()` —
-- jobs, quotes, invoices, messages, photos, visits, events. Widening this one
-- function is what gives all of them multi-user access at once, which is the
-- whole reason it was written as a function rather than inlined.
--
-- `clients.profile_id` stays in the union rather than being replaced. It is
-- still the record of who the customer *is*, the backfill above may miss a row
-- with no email, and losing access to your own jobs because a backfill skipped
-- you would be the worst possible failure here.
-- ---------------------------------------------------------------------------

create or replace function my_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clients
   where profile_id = auth.uid()
     and deleted_at is null
  union
  select m.client_id
    from client_members m
    join clients c on c.id = m.client_id
   where m.profile_id = auth.uid()
     and c.deleted_at is null;
$$;

/**
 * May the caller act on this account, rather than only look at it?
 *
 * Accepting or declining a quote is the one thing in the portal that costs
 * money, so it asks this instead of `my_client_ids()`.
 */
create or replace function can_manage_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from clients c
     where c.id = p_client_id
       and c.profile_id = auth.uid()
       and c.deleted_at is null
  ) or exists (
    select 1 from client_members m
     where m.client_id = p_client_id
       and m.profile_id = auth.uid()
       and m.role = 'manager'
  );
$$;

-- ---------------------------------------------------------------------------
-- Adoption — the same symmetry `20260814190000_link_clients_to_logins.sql`
-- established for clients, applied to members.
--
-- A member can be invited before they have an account, or sign up before they
-- are invited. Whichever arrives second has to find the first, or the
-- invitation silently does nothing.
-- ---------------------------------------------------------------------------

create or replace function adopt_client_memberships(p_profile_id uuid, p_email citext)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update client_members
     set profile_id = p_profile_id
   where profile_id is null
     and email = p_email;
end;
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext := new.email;
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    v_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'client'
  )
  on conflict (id) do nothing;

  -- The named customer, as before.
  update clients
     set profile_id = new.id
   where profile_id is null
     and email = v_email
     and deleted_at is null;

  -- And any account they have been invited onto.
  perform adopt_client_memberships(new.id, v_email);

  return new;
end;
$$;

-- A membership added for somebody who already has an account is linked at once,
-- rather than waiting for a sign-in that has already happened.
create or replace function client_members_adopt_existing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null then
    select id into new.profile_id from profiles where email = new.email limit 1;
  end if;

  return new;
end;
$$;

create trigger client_members_adopt_existing_before_insert
  before insert on client_members
  for each row execute function client_members_adopt_existing();

-- ---------------------------------------------------------------------------
-- Quote responses now accept a manager, not only the named customer.
-- ---------------------------------------------------------------------------

create or replace function accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote quotes%rowtype;
begin
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  -- A viewer on this account reaches `my_client_ids()` and so can READ this
  -- quote, but must not be able to answer it.
  if not (can_manage_client(v_quote.client_id) or is_staff_or_owner()) then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status = 'accepted', responded_at = now()
   where id = p_quote_id;

  update quotes
     set status = 'expired', responded_at = now()
   where job_id = v_quote.job_id
     and id <> p_quote_id
     and status = 'sent';

  update jobs set status = 'accepted' where id = v_quote.job_id;
end;
$$;

create or replace function decline_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote quotes%rowtype;
begin
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  if not (can_manage_client(v_quote.client_id) or is_staff_or_owner()) then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status = 'declined',
         responded_at = now(),
         decline_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_quote_id;

  update jobs set status = 'declined' where id = v_quote.job_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- The customer may manage their own account's members — that was a deliberate
-- decision, so a landlord can add their own colleague without ringing up. Only
-- a manager may do it, so a viewer cannot promote themselves.
-- ---------------------------------------------------------------------------

alter table client_members enable row level security;

create policy "members read their own account's members"
  on client_members for select to authenticated
  using (client_id in (select my_client_ids()));

create policy "staff read all members"
  on client_members for select to authenticated
  using (is_staff_or_owner());

create policy "managers add members"
  on client_members for insert to authenticated
  with check (can_manage_client(client_id));

create policy "managers change members"
  on client_members for update to authenticated
  using (can_manage_client(client_id))
  with check (can_manage_client(client_id));

create policy "managers remove members"
  on client_members for delete to authenticated
  using (can_manage_client(client_id));

create policy "owner manages all members"
  on client_members for all to authenticated
  using (is_owner())
  with check (is_owner());
