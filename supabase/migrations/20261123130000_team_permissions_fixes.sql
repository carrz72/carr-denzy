-- ===========================================================================
-- Team permissions: gaps found in the logic audit.
-- ===========================================================================

-- --- 1. A helper changing a job they were given -----------------------------
--
-- "staff updates assigned jobs" lets a team member update a job given to
-- them. On its own that allowed ANY column through the API: the customer, the
-- title, who it is assigned to, or a status like cancelled or paid. Someone
-- without "add and change jobs" may only say the job has started or is
-- finished (and add notes and photos, which are other tables).

create or replace function guard_helper_job_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_active_staff() or staff_can('manage_jobs') then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status not in ('in_progress', 'completed') then
    raise exception 'You can mark a job as started or finished. Ask the owner for anything else.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Everything except status and the columns the database keeps itself.
  if (to_jsonb(new) - array['status', 'completed_at', 'updated_at', 'scheduled_start'])
     is distinct from
     (to_jsonb(old) - array['status', 'completed_at', 'updated_at', 'scheduled_start']) then
    raise exception 'You can mark a job as started or finished. Ask the owner for anything else.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_guard_helper_update on jobs;
create trigger jobs_guard_helper_update
  before update on jobs
  for each row execute function guard_helper_job_update();

-- --- 2. Accepting or declining a quote on the customer's behalf --------------
--
-- These let "staff or owner" answer any quote. Now a team member needs the
-- quotes permission, the same as the button in the app.

create or replace function accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_ok     boolean;
begin
  select exists (
    select 1 from quotes q
     where q.id = p_quote_id and can_manage_client(q.client_id)
  ) or staff_can('manage_quotes')
  into v_ok;

  if not v_ok then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  perform apply_quote_acceptance(
    p_quote_id,
    case when is_staff_or_owner() then 'owner'::quote_response_channel
         else 'portal'::quote_response_channel end,
    null,
    v_caller
  );
end;
$$;

create or replace function decline_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_ok     boolean;
begin
  select exists (
    select 1 from quotes q
     where q.id = p_quote_id and can_manage_client(q.client_id)
  ) or staff_can('manage_quotes')
  into v_ok;

  if not v_ok then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  perform apply_quote_decline(
    p_quote_id,
    p_reason,
    case when is_staff_or_owner() then 'owner'::quote_response_channel
         else 'portal'::quote_response_channel end,
    null,
    v_caller
  );
end;
$$;
