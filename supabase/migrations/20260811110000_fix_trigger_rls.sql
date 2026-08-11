-- ===========================================================================
-- Carr Denzy — let the audit triggers actually write
--
-- Creating a job failed outright with:
--
--   new row violates row-level security policy for table "job_events"
--
-- `jobs_status_event()` writes the immutable status timeline, and `job_events`
-- deliberately has no INSERT policy — the whole point is that nobody can forge
-- an entry. But a plpgsql trigger runs with the privileges of the *calling*
-- user, so RLS applied to the trigger too and blocked the write. The job insert
-- was rolled back with it.
--
-- This affected every route into the table: the phone-job form, converting an
-- enquiry, everything. It went unnoticed because no job had ever been created.
--
-- The fix is SECURITY DEFINER on the trigger functions that write audit rows,
-- which is exactly what that flag is for: the function is trusted system code,
-- not something a user is choosing to run. `search_path` is pinned on each one
-- so a caller cannot shadow `public` and have the definer-rights function
-- resolve to a table of their own.
-- ===========================================================================

create or replace function jobs_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into job_events (job_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into job_events (job_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The same trap, one table over.
--
-- `audit_log` has no INSERT policy for `authenticated` either, by the same
-- deliberate design. `recordPayment` writes to it directly from a server action
-- using the caller's session, so that write has been failing silently — the
-- payment saved, the audit entry did not.
--
-- Rather than open the table up, this gives the app a narrow, checked way in.
-- It records who actually called it from `auth.uid()` rather than trusting an
-- actor id passed in, so an entry cannot be attributed to someone else.
-- ---------------------------------------------------------------------------

create or replace function record_audit_entry(
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_detail);
end;
$$;

revoke execute on function record_audit_entry(text, text, uuid, jsonb) from anon;
grant execute on function record_audit_entry(text, text, uuid, jsonb) to authenticated;
