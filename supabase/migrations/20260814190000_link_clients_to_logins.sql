-- ===========================================================================
-- Connecting a customer's login to their customer record, in both directions.
--
-- `clients.profile_id` is what every portal policy filters on. Without it a
-- customer signs in successfully, sees "Nothing here yet", and cannot reply on
-- a job that is genuinely theirs — the account works, it is simply attached to
-- nothing.
--
-- Until now that link was made in exactly one place: `handle_new_user()`, which
-- fires when an auth user is INSERTED. So it only worked in one order —
-- customer record first, sign-in second. The opposite order is at least as
-- common and produced a silently broken account:
--
--   1. Somebody signs in, or is invited, and an auth user is created.
--      The trigger looks for a client row with that email. There is none yet.
--   2. Later the owner converts their enquiry into a job, which creates the
--      client record.
--   3. Nothing ever revisits step 1, so `profile_id` stays null for ever.
--
-- The fix is symmetry: the same adoption now also runs from the clients side,
-- so whichever record arrives second finds the first.
-- ===========================================================================

create or replace function public.link_client_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only ever fills a blank. An existing link is never repointed: `profile_id`
  -- is who can see this customer's jobs, invoices and photographs, and moving
  -- it because an email address was edited would hand one person's records to
  -- another.
  if new.profile_id is null and new.email is not null then
    select id into new.profile_id
      from profiles
     where email = new.email
     limit 1;
  end if;

  return new;
end;
$$;

comment on function public.link_client_to_profile() is
  'Adopts an existing login for a customer record created after the account. Mirror of handle_new_user(), which handles the opposite order.';

drop trigger if exists clients_link_profile on clients;

create trigger clients_link_profile
  before insert or update of email on clients
  for each row execute function public.link_client_to_profile();

-- ---------------------------------------------------------------------------
-- Backfill.
--
-- Every customer record created in the wrong order is currently orphaned, and
-- their owners are looking at an empty portal right now. Matched on email,
-- which is the same key both triggers use.
-- ---------------------------------------------------------------------------
update clients c
   set profile_id = p.id
  from profiles p
 where c.profile_id is null
   and c.email is not null
   and c.email = p.email
   and c.deleted_at is null;
