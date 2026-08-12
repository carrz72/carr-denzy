-- ===========================================================================
-- Accepting a quote from an emailed link, with no account.
--
-- Why this exists: most of this business's customers arrive by phone. They
-- have a client record but no login, so the portal link in a quote email was a
-- sign-in wall at precisely the moment they were about to say yes. Invoices
-- already solved this with a capability link (/invoices/view/<id>); quotes did
-- not, and quote acceptance is the step that actually wins the work.
--
-- The trust model is the same one the invoice link already uses: the quote's
-- 128-bit UUID, never listed or enumerable, handed out one at a time in an
-- email. Accepting a quote forms a contract, so unlike the invoice view this
-- also writes down WHAT was agreed and by whom, as evidence.
-- ===========================================================================

-- --- Evidence of how a quote was answered ---------------------------------

create type quote_response_channel as enum ('portal', 'link', 'owner');

alter table quotes
  add column responded_via     quote_response_channel,
  add column responder_ip_hash text,
  -- The totals as the customer saw them at the moment they agreed. A quote
  -- cannot be edited once accepted, but recording the figure here means the
  -- agreed price survives even if that guarantee is ever relaxed.
  add column accepted_total_pence integer;

comment on column quotes.responded_via is
  'How the customer answered: through the portal signed in, through the emailed '
  'capability link, or recorded by the owner after a phone call.';

comment on column quotes.responder_ip_hash is
  'Salted hash of the responder IP, kept as evidence of a link acceptance. '
  'Never the raw address — that is personal data we have no need to store.';

-- ---------------------------------------------------------------------------
-- Shared response logic
--
-- The three entry points (portal, link, owner) differ only in who is allowed
-- to call them. Keeping the actual state change in one place means the portal
-- and the link can never drift into accepting a quote differently — which is
-- the kind of divergence that ends with two customers on two paths getting two
-- different outcomes.
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

  update jobs set status = 'accepted' where id = v_quote.job_id;

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

  update quotes
     set status            = 'declined',
         responded_at      = now(),
         responded_via     = p_via,
         responder_ip_hash = p_ip_hash,
         decline_reason    = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_quote_id;

  -- Only move the job to declined once nothing else is still on the table.
  if not exists (
    select 1 from quotes
     where job_id = v_quote.job_id and status = 'sent' and id <> p_quote_id
  ) then
    update jobs set status = 'declined' where id = v_quote.job_id;
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

-- ---------------------------------------------------------------------------
-- Signed-in path — unchanged behaviour, now delegating
-- ---------------------------------------------------------------------------

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
      join clients c on c.id = q.client_id
     where q.id = p_quote_id and c.profile_id = v_caller
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
      join clients c on c.id = q.client_id
     where q.id = p_quote_id and c.profile_id = v_caller
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

-- ---------------------------------------------------------------------------
-- Link path — no account required
--
-- Deliberately NOT granted to `anon` at the database level. These are called
-- only from a server action, using the service-role key, after that action has
-- rate-limited the caller and hashed their IP. Leaving them ungranted means a
-- scripted client hammering PostgREST directly with the anon key cannot reach
-- them at all, so the rate limit is not something an attacker can route around.
-- ---------------------------------------------------------------------------

create or replace function accept_quote_via_link(p_quote_id uuid, p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform apply_quote_acceptance(p_quote_id, 'link', p_ip_hash, null);
end;
$$;

create or replace function decline_quote_via_link(
  p_quote_id uuid,
  p_reason   text,
  p_ip_hash  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform apply_quote_decline(p_quote_id, p_reason, 'link', p_ip_hash, null);
end;
$$;

revoke all on function accept_quote_via_link(uuid, text) from public, anon, authenticated;
revoke all on function decline_quote_via_link(uuid, text, text) from public, anon, authenticated;

revoke all on function apply_quote_acceptance(uuid, quote_response_channel, text, uuid)
  from public, anon, authenticated;
revoke all on function apply_quote_decline(uuid, text, quote_response_channel, text, uuid)
  from public, anon, authenticated;
