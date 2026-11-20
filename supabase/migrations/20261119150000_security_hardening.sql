-- ===========================================================================
-- Security hardening from the second audit
--
-- 1. adopt_client_memberships was SECURITY DEFINER and, like every function,
--    executable by PUBLIC by default. Any signed-in user could call it through
--    PostgREST with their own profile id and somebody else's email, and take
--    over every pending invitation for that address — access to another
--    customer's account. It is only meant to be called by handle_new_user(),
--    which runs as the table owner and does not need the grant.
--
-- 2. record_audit_entry let any signed-in customer write audit rows. Only the
--    owner's actions use it.
--
-- 3. check_rate_limit was granted to anon and authenticated, so anyone could
--    fill the table with junk or reset nothing useful. The app only calls it
--    with the service-role key (src/lib/rate-limit.ts).
--
-- 4. mark_overdue_invoices was callable by anon. Harmless (it only applies the
--    date rules), but there is no reason for it; the owner pages and the cron
--    job are the only callers.
--
-- 5. Account managers (client_members.role = 'manager') could not accept or
--    decline quotes: 20260812120000 redefined accept_quote / decline_quote with
--    a check on clients.profile_id only, dropping can_manage_client(). And they
--    could not read the client row at all, which the member screens need, so
--    adding people failed for them with "That customer no longer exists".
-- ===========================================================================

-- --- 1. Invitation takeover ------------------------------------------------
revoke all on function adopt_client_memberships(uuid, citext) from public, anon, authenticated;

-- --- 2. Audit log: staff and owner only -----------------------------------
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
  if auth.uid() is null or not is_staff_or_owner() then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_detail);
end;
$$;

revoke all on function record_audit_entry(text, text, uuid, jsonb) from public, anon;
grant execute on function record_audit_entry(text, text, uuid, jsonb) to authenticated;

-- --- 3. Rate limiter: server only -----------------------------------------
revoke all on function check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function check_rate_limit(text, text, integer, integer) to service_role;

-- --- 4. Overdue sweep: signed in, or the server ---------------------------
revoke all on function mark_overdue_invoices() from public, anon;
grant execute on function mark_overdue_invoices() to authenticated, service_role;

-- --- 5. Account managers --------------------------------------------------

-- Everyone on an account can see the account's own record (name, contact
-- details), as the named customer always could. Writing it stays with the
-- named customer and the owner.
create policy "members read the account they are on"
  on clients for select to authenticated
  using (id in (select my_client_ids()) and deleted_at is null);

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
  ) or is_staff_or_owner()
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
  ) or is_staff_or_owner()
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
