-- ===========================================================================
-- Quote answers that respect where the job already is, and merging customers
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Answering a quote no longer drags the job backwards.
--
-- apply_quote_acceptance set the job to 'accepted' unconditionally, and
-- apply_quote_decline set it to 'declined'. The job status guard refuses
-- going backwards, so a quote on a job that was already booked in (a survey
-- visit first, the price after), in progress (extra work found on the day),
-- invoiced or cancelled could not be accepted or declined at all: the whole
-- answer failed and the customer saw an error.
--
-- The answer is now always recorded on the quote. The job moves only when
-- the move is a step forward from where it is: to 'accepted' from new,
-- quoted or declined; to 'declined' from new or quoted, and only once no
-- other quote on the job is still waiting. A job that is further on keeps its
-- status. Everything else matches 20261119120000_audit_critical_fixes.sql.
-- ---------------------------------------------------------------------------

create or replace function apply_quote_acceptance(
  p_quote_id uuid,
  p_via      quote_response_channel,
  p_ip_hash  text default null,
  p_actor    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote quotes%rowtype;
begin
  -- Lock the row. Two taps on a flaky mobile connection arrive as two requests,
  -- and without this both could pass the status check before either writes.
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  if p_via <> 'owner' and quote_has_lapsed(v_quote.valid_until) then
    raise exception 'This quote is no longer open for a response: it has expired.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status               = 'accepted',
         responded_at         = now(),
         responded_via        = p_via,
         responder_ip_hash    = p_ip_hash,
         accepted_total_pence = v_quote.total_pence
   where id = p_quote_id;

  -- Accepting one quote takes every other open quote on the job off the table.
  update quotes
     set status = 'expired', responded_at = now()
   where job_id = v_quote.job_id
     and id <> p_quote_id
     and status = 'sent';

  update jobs
     set status = 'accepted'
   where id = v_quote.job_id
     and status in ('new', 'quoted', 'declined');

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (
    p_actor,
    'quote.accepted',
    'quote',
    p_quote_id,
    jsonb_build_object(
      'job_id', v_quote.job_id,
      'total_pence', v_quote.total_pence,
      'via', p_via
    )
  );
end;
$$;

create or replace function apply_quote_decline(
  p_quote_id uuid,
  p_reason   text,
  p_via      quote_response_channel,
  p_ip_hash  text default null,
  p_actor    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote quotes%rowtype;
begin
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  if p_via <> 'owner' and quote_has_lapsed(v_quote.valid_until) then
    raise exception 'This quote is no longer open for a response: it has expired.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status            = 'declined',
         responded_at      = now(),
         responded_via     = p_via,
         responder_ip_hash = p_ip_hash,
         decline_reason    = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_quote_id;

  -- Only move the job to declined once nothing else is still on the table,
  -- and only from a stage where "declined" is the next step.
  if not exists (
    select 1 from quotes
     where job_id = v_quote.job_id and status = 'sent' and id <> p_quote_id
  ) then
    update jobs
       set status = 'declined'
     where id = v_quote.job_id
       and status in ('new', 'quoted');
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (
    p_actor,
    'quote.declined',
    'quote',
    p_quote_id,
    jsonb_build_object('job_id', v_quote.job_id, 'reason', p_reason, 'via', p_via)
  );
end;
$$;

revoke all on function apply_quote_acceptance(uuid, quote_response_channel, text, uuid)
  from public, anon, authenticated;
revoke all on function apply_quote_decline(uuid, text, quote_response_channel, text, uuid)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Merging a duplicate customer into the right one.
--
-- The same person entered twice (once from an enquiry, once from a phone
-- call) split their history across two records, and nothing could join them.
-- This moves everything from the duplicate onto the record being kept, in one
-- transaction, then retires the duplicate. Owner only.
--
-- Issued invoices move too: each keeps its own copy of the customer as it was
-- billed, so the document itself does not change.
-- ---------------------------------------------------------------------------

create or replace function merge_clients(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source clients%rowtype;
  v_target clients%rowtype;
  v_source_notes text;
  v_profile_email citext;
begin
  if not is_owner() then
    raise exception 'Only the owner can merge customers.' using errcode = 'insufficient_privilege';
  end if;

  if p_source = p_target then
    raise exception 'Pick a different customer to merge into.' using errcode = 'check_violation';
  end if;

  select * into v_source from clients where id = p_source and deleted_at is null for update;
  select * into v_target from clients where id = p_target and deleted_at is null for update;

  if v_source.id is null or v_target.id is null then
    raise exception 'One of those customers no longer exists.' using errcode = 'no_data_found';
  end if;

  update properties set client_id = p_target where client_id = p_source;
  update jobs       set client_id = p_target where client_id = p_source;
  update quotes     set client_id = p_target where client_id = p_source;
  update invoices   set client_id = p_target where client_id = p_source;
  update enquiries  set client_id = p_target where client_id = p_source;

  -- People with access: move those not already on the kept account.
  update client_members m
     set client_id = p_target
   where m.client_id = p_source
     and not exists (
       select 1 from client_members t where t.client_id = p_target and t.email = m.email
     );
  delete from client_members where client_id = p_source;

  -- Private notes: keep both, the duplicate's underneath.
  select notes into v_source_notes from client_private_notes where client_id = p_source;
  if v_source_notes is not null then
    insert into client_private_notes (client_id, notes)
    values (p_target, v_source_notes)
    on conflict (client_id) do update
      set notes = client_private_notes.notes || E'\n\n' || excluded.notes;
    delete from client_private_notes where client_id = p_source;
  end if;

  -- Their portal login. If the kept record has none, it takes this one;
  -- if it already has one, this login is added as a manager so nobody loses
  -- access to their own jobs.
  if v_source.profile_id is not null then
    update clients set profile_id = null where id = p_source;

    if v_target.profile_id is null then
      update clients set profile_id = v_source.profile_id where id = p_target;
    elsif v_target.profile_id <> v_source.profile_id then
      select email into v_profile_email from profiles where id = v_source.profile_id;
      if v_profile_email is not null then
        insert into client_members (client_id, email, role, profile_id)
        values (p_target, v_profile_email, 'manager', v_source.profile_id)
        on conflict (client_id, email) do nothing;
      end if;
    end if;
  end if;

  -- Contact details the kept record is missing.
  update clients
     set email        = coalesce(email, v_source.email),
         phone        = coalesce(phone, v_source.phone),
         company_name = coalesce(company_name, v_source.company_name)
   where id = p_target;

  update clients set deleted_at = now() where id = p_source;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (
    auth.uid(),
    'client.merged',
    'client',
    p_target,
    jsonb_build_object('merged_from', p_source, 'merged_name', v_source.full_name)
  );
end;
$$;

revoke all on function merge_clients(uuid, uuid) from public, anon;
grant execute on function merge_clients(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Recalculating draft totals after the tax settings change.
--
-- Quote and invoice totals are stored, and recalculated by trigger only when
-- their lines change. Turning VAT registration or CIS on or off in Settings
-- therefore left every draft showing totals worked out under the old rules
-- until someone happened to edit a line. Sent documents are deliberately
-- left alone: what the customer was sent is what they were sent.
-- ---------------------------------------------------------------------------

create or replace function recalc_draft_totals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not is_owner() then
    raise exception 'Only the owner can do that.' using errcode = 'insufficient_privilege';
  end if;

  for v_id in select id from quotes where status = 'draft' and deleted_at is null loop
    perform recalc_quote_totals(v_id);
    v_count := v_count + 1;
  end loop;

  for v_id in select id from invoices where status = 'draft' and deleted_at is null loop
    perform recalc_invoice_totals(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function recalc_draft_totals() from public, anon;
grant execute on function recalc_draft_totals() to authenticated;
