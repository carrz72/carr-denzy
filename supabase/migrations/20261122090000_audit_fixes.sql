-- ---------------------------------------------------------------------------
-- Security audit fixes, 22 November 2026.
--
-- 1. Account linking trusted an editable email.
--    `profiles.email` could be changed by its owner through the API, and the
--    triggers that link a customer record to a login matched on it. Someone
--    could set their profile email to another person's address and be linked
--    to that person's jobs, quotes and invoices when the owner created the record.
--    Now: customers can only change their name and phone on `profiles`, the
--    triggers match on the VERIFIED address in auth.users, and any profile
--    email that had drifted from its login is put back.
--
-- 2. Customers could change hidden fields on their own customer record
--    (id, created date, link, deleted flag). Their row only, but there is no
--    reason to allow it. A guard now rejects those changes from anyone who is
--    not the owner or staff.
--
-- 3. Enquiry photos are no longer uploadable by anyone directly. The site
--    hands out one-time upload slots from a server action that is rate
--    limited per connection (see prepareEnquiryUploads).
--
-- 4. Every function of ours gets a fixed search_path (Supabase advisor).
-- ---------------------------------------------------------------------------

-- 1a. Profiles: name and phone only.
revoke update on profiles from authenticated, anon;
grant update (full_name, phone) on profiles to authenticated;

-- 1b. Put back any profile email that no longer matches its login.
update profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and u.email is not null
   and p.email is distinct from u.email::citext;

-- 1c. Link only through a verified login address.
create or replace function public.verified_profile_for_email(p_email citext)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(u.email) = lower(p_email::text)
     and u.email_confirmed_at is not null
   limit 1;
$$;

revoke all on function public.verified_profile_for_email(citext) from public, anon, authenticated;

create or replace function public.link_client_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_linked_email text;
  v_match uuid;
begin
  if new.email is null then
    return new;
  end if;

  v_match := public.verified_profile_for_email(new.email);

  if new.profile_id is null then
    new.profile_id := v_match;
    return new;
  end if;

  select u.email into v_linked_email from auth.users u where u.id = new.profile_id;
  if lower(v_linked_email) is not distinct from lower(new.email::text) then
    return new;
  end if;

  new.profile_id := v_match;
  return new;
end;
$$;

create or replace function public.client_members_adopt_existing()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.profile_id is null then
    new.profile_id := public.verified_profile_for_email(new.email);
  end if;
  return new;
end;
$$;

-- Trigger functions are never meant to be called directly.
revoke all on function public.link_client_to_profile() from public, anon, authenticated;
revoke all on function public.client_members_adopt_existing() from public, anon, authenticated;

-- 2. Customers may not change the hidden fields on their own record.
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
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Those details cannot be changed here.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_client_self_update() from public, anon, authenticated;

-- Named to run before clients_link_profile (triggers fire in name order), so
-- it sees the customer's own change, not the link trigger's.
drop trigger if exists clients_aa_guard_self_update on clients;
create trigger clients_aa_guard_self_update
  before update on clients
  for each row execute function public.guard_client_self_update();

-- 3. No more direct anonymous uploads to enquiry photos.
drop policy if exists "anyone uploads an enquiry photo" on storage.objects;
drop function if exists public.enquiry_photo_upload_allowed();

-- 4. Fixed search_path on every function we own in public (extensions excluded).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
       )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end;
$$;
