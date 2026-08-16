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
declare
  v_linked_email citext;
  v_match uuid;
begin
  if new.email is null then
    -- No email is not a statement about identity — an owner clearing the field
    -- should not silently revoke somebody's portal access.
    return new;
  end if;

  select id into v_match from profiles where email = new.email limit 1;

  -- Case 1: no link yet. Adopt an account with this email if one exists.
  if new.profile_id is null then
    new.profile_id := v_match;
    return new;
  end if;

  -- Case 2: already linked. Only act if the link has gone stale — that is, the
  -- account it points at is no longer the address on this customer record.
  select email into v_linked_email from profiles where id = new.profile_id;

  if v_linked_email is not distinct from new.email then
    return new;
  end if;

  -- The link is stale. This is the typo case: an invoice goes out to
  -- carr723@…, that account gets linked, and the address is corrected to
  -- carrz723@… afterwards. Without this the correction changes nothing —
  -- the real customer still sees an empty portal, and the person on the
  -- typo'd address can still read their invoices.
  --
  -- Repoint when the corrected address has an account. When it does not, the
  -- link is CLEARED rather than left where it was: leaving it means somebody
  -- who is no longer this customer keeps access to their invoices and
  -- photographs, and stale access to a stranger's records is worse than a
  -- customer having to sign in again. The blank refills itself the moment the
  -- right person signs in — that is what the sign-in adoption is for.
  new.profile_id := v_match;

  return new;
end;
$$;

comment on function public.link_client_to_profile() is
  'Keeps clients.profile_id in step with clients.email: adopts a login for a record created after the account, and repoints (or clears) a link left stale by an email correction.';

drop trigger if exists clients_link_profile on clients;

create trigger clients_link_profile
  before insert or update of email on clients
  for each row execute function public.link_client_to_profile();

-- ---------------------------------------------------------------------------
-- Backfill, in two parts.
--
-- Rows already in a broken state predate both triggers, and the people they
-- belong to are looking at an empty portal right now.
-- ---------------------------------------------------------------------------

-- 1. Orphans: created in the wrong order, never linked to anything.
update clients c
   set profile_id = p.id
  from profiles p
 where c.profile_id is null
   and c.email is not null
   and c.email = p.email
   and c.deleted_at is null;

-- 2. Stale links: pointing at an account that is not the address on the record.
--    This is the live case — a customer record whose email was corrected after
--    the link was made, leaving the invoice visible to the typo'd account and
--    invisible to the real customer.
update clients c
   set profile_id = correct.id
  from profiles correct, profiles linked
 where c.profile_id = linked.id
   and c.email is not null
   and c.email = correct.email
   and linked.email <> c.email
   and c.deleted_at is null;

-- 3. Stale links with no account on the corrected address. Cleared, not left:
--    an account that is no longer this customer must not keep reading their
--    invoices. The sign-in adoption refills it when the right person arrives.
update clients c
   set profile_id = null
  from profiles linked
 where c.profile_id = linked.id
   and c.email is not null
   and linked.email <> c.email
   and c.deleted_at is null
   and not exists (select 1 from profiles p where p.email = c.email);
