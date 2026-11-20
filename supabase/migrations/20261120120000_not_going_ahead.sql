-- ===========================================================================
-- "Not going ahead": closing jobs where the customer said no or went quiet
--
-- Most enquiries that do not turn into work never get a formal answer. The
-- customer says no on WhatsApp, goes elsewhere, or just stops replying, and the
-- job sat as "New request" or "Quote sent" on the open list for ever.
--
--   * jobs.closed_reason records why a job did not go ahead (said no, went
--     quiet, went elsewhere, too expensive, no reply to the quote, ...).
--   * The status 'declined' now reads "Not going ahead", which covers every
--     one of those, not only a declined quote.
--   * The daily sweep closes a job whose quotes have all expired unanswered,
--     with the reason "No reply to the quote". Customers are already sent a
--     reminder before a quote expires (/api/cron/reminders).
--   * A closed job can be reopened: declined -> new is now allowed, so the
--     owner can quote it afresh when the customer comes back.
-- ===========================================================================

alter table jobs
  add column if not exists closed_reason text
    check (closed_reason is null or char_length(closed_reason) <= 200);

comment on column jobs.closed_reason is
  'Why a job did not go ahead, shown to the owner only. Set when status becomes declined.';

-- --- Labels ----------------------------------------------------------------
create or replace function job_status_label(p_status job_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'new'         then 'New request'
    when 'quoted'      then 'Quote sent'
    when 'accepted'    then 'Quote accepted'
    when 'declined'    then 'Not going ahead'
    when 'scheduled'   then 'Booked in'
    when 'in_progress' then 'Work under way'
    when 'completed'   then 'Work finished'
    when 'invoiced'    then 'Invoice sent'
    when 'paid'        then 'Paid'
    when 'cancelled'   then 'Cancelled'
  end;
$$;

-- --- Reopening ---------------------------------------------------------------
-- Unchanged from 20261120090000_invoice_from_any_stage.sql except that a job
-- that did not go ahead can go back to 'new'.
create or replace function job_transition_allowed(p_from job_status, p_to job_status)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'new'         then p_to in ('quoted','scheduled','cancelled','declined','invoiced')
    when p_from = 'quoted'      then p_to in ('accepted','declined','cancelled','scheduled','new','invoiced')
    when p_from = 'accepted'    then p_to in ('scheduled','in_progress','cancelled','invoiced')
    when p_from = 'declined'    then p_to in ('quoted','cancelled','new')
    when p_from = 'scheduled'   then p_to in ('in_progress','completed','cancelled','invoiced')
    when p_from = 'in_progress' then p_to in ('completed','cancelled','invoiced')
    when p_from = 'completed'   then p_to in ('invoiced','in_progress','cancelled')
    when p_from = 'invoiced'    then p_to in ('paid','completed','cancelled')
    when p_from = 'paid'        then p_to in ('invoiced')
    when p_from = 'cancelled'   then p_to in ('new')
    else false
  end;
$$;

-- --- The daily sweep -----------------------------------------------------------
-- As in 20260810091000_functions.sql, plus closing jobs left with nothing but
-- expired quotes. Privileges set in 20261119150000 carry over: create or
-- replace keeps them.
create or replace function mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update invoices
     set status = 'overdue'
   where status = 'sent'
     and due_date is not null
     and due_date < (now() at time zone 'Europe/London')::date
     and deleted_at is null;

  get diagnostics v_count = row_count;

  update quotes
     set status = 'expired'
   where status = 'sent'
     and valid_until is not null
     and valid_until < (now() at time zone 'Europe/London')::date
     and deleted_at is null;

  -- A job whose quote ran out with no answer, and that has nothing else open,
  -- is not going ahead. Only jobs still sitting at "Quote sent": anything the
  -- owner has already moved on (booked, started) is left alone.
  update jobs j
     set status = 'declined',
         closed_reason = 'No reply to the quote'
   where j.status = 'quoted'
     and j.deleted_at is null
     and exists (
       select 1 from quotes q
        where q.job_id = j.id and q.deleted_at is null and q.status = 'expired'
     )
     and not exists (
       select 1 from quotes q
        where q.job_id = j.id and q.deleted_at is null and q.status in ('sent', 'accepted')
     );

  return v_count;
end;
$$;
