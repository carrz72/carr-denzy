-- ===========================================================================
-- Audit fixes, part 1: three holes in what a signed-in customer can do.
--
-- Each of these was reachable by a customer calling PostgREST directly with
-- their own session, without going through the app at all — which is exactly
-- the case `20260810092000_rls.sql` says RLS has to hold against.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Messages: a reader may mark a message read, and change nothing else.
--
-- The "mark messages read" policy decides WHICH rows a participant may update,
-- but a policy cannot say which COLUMNS. So a customer could rewrite the body
-- or the sender of any message on their own job — including the owner's
-- ("£500" becomes "£50"). Column privileges are the tool for that. The app
-- only ever updates `read_at` (src/lib/unread.ts), for owner and customer alike.
-- ---------------------------------------------------------------------------

revoke update on table messages from anon, authenticated;
grant update (read_at) on table messages to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The owner's private notes about a customer leave the customer's own row.
--
-- `clients.notes` sat on the same row the customer can read ("client reads own
-- record") and update ("client updates own contact details"), so a customer
-- could read what the owner wrote about them, and overwrite it. Column
-- privileges cannot fix this one: owner and customer are both the
-- `authenticated` role, so revoking the column from one revokes it from both.
--
-- So the notes move to their own table, readable by staff and writable by the
-- owner only, and the column is dropped once its contents are copied across.
-- ---------------------------------------------------------------------------

create table client_private_notes (
  client_id   uuid primary key references clients(id) on delete cascade,
  notes       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table client_private_notes is
  'The owner''s private notes about a customer. Kept off the clients row on '
  'purpose: a customer can read and update their own clients row.';

create trigger client_private_notes_updated_at
  before update on client_private_notes
  for each row execute function set_updated_at();

alter table client_private_notes enable row level security;

create policy "staff reads private client notes"
  on client_private_notes for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes private client notes"
  on client_private_notes for all to authenticated
  using (is_owner())
  with check (is_owner());

insert into client_private_notes (client_id, notes)
select id, notes
  from clients
 where notes is not null
   and trim(notes) <> '';

alter table clients drop column notes;


-- ---------------------------------------------------------------------------
-- 3. A quote past its `valid_until` date can no longer be answered.
--
-- The pages already hid the buttons on a lapsed quote, but the database did
-- not check. A page left open overnight, or a direct call, could still accept
-- a quote at a price that had lapsed — and `expired` is only stamped when the
-- owner happens to open the dashboard (`mark_overdue_invoices`).
--
-- The date test matches `mark_overdue_invoices`: valid THROUGH `valid_until`,
-- judged on the Europe/London calendar date.
--
-- Only customer channels (portal and emailed link) are refused. The owner can
-- still record an answer on a lapsed quote, because the usual reason for that
-- is a customer who rang to say yes and the owner agreed to honour the price.
--
-- The message keeps the words "no longer open", which is what the server
-- actions match on to show the customer a friendly explanation.
-- ---------------------------------------------------------------------------

create or replace function quote_has_lapsed(p_valid_until date)
returns boolean
language sql
stable
as $$
  select p_valid_until is not null
     and p_valid_until < (now() at time zone 'Europe/London')::date;
$$;

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

-- `create or replace` keeps existing privileges, but restate them so this file
-- is correct on its own: these are reachable only through accept_quote,
-- decline_quote and the service-role link functions.
revoke all on function apply_quote_acceptance(uuid, quote_response_channel, text, uuid)
  from public, anon, authenticated;
revoke all on function apply_quote_decline(uuid, text, quote_response_channel, text, uuid)
  from public, anon, authenticated;
