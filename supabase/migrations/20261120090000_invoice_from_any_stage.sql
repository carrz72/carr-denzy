-- ===========================================================================
-- A job can be invoiced from any open stage
--
-- The job status machine only allowed "invoiced" from "completed". But plenty
-- of work is invoiced straight from the phone job — a call-out fixed on the
-- day never passes through quoted, scheduled or completed. sendInvoice() set
-- the job to "invoiced", the status guard refused it, and the app ignored the
-- error: the job sat at "New request" with a sent (even paid) invoice on it,
-- and every later step (paid) was refused for the same reason.
--
-- Invoicing now closes out the job from new, quoted, accepted, scheduled,
-- in progress or completed. Every other transition is unchanged from
-- 20261119140000_quote_withdrawal.sql.
-- ===========================================================================

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
    when p_from = 'declined'    then p_to in ('quoted','cancelled')
    when p_from = 'scheduled'   then p_to in ('in_progress','completed','cancelled','invoiced')
    when p_from = 'in_progress' then p_to in ('completed','cancelled','invoiced')
    when p_from = 'completed'   then p_to in ('invoiced','in_progress','cancelled')
    when p_from = 'invoiced'    then p_to in ('paid','completed','cancelled')
    when p_from = 'paid'        then p_to in ('invoiced')
    when p_from = 'cancelled'   then p_to in ('new')
    else false
  end;
$$;

-- --- Jobs already stuck ------------------------------------------------------
-- Any open job with a live (sent, not cancelled) invoice on it is invoiced.
update jobs j
   set status = 'invoiced'
 where j.deleted_at is null
   and j.status in ('new','quoted','accepted','scheduled','in_progress','completed')
   and exists (
     select 1 from invoices i
      where i.job_id = j.id
        and i.deleted_at is null
        and i.status in ('sent','part_paid','overdue','paid')
   );

-- And one whose live invoices are all paid is paid.
update jobs j
   set status = 'paid'
 where j.deleted_at is null
   and j.status = 'invoiced'
   and exists (
     select 1 from invoices i
      where i.job_id = j.id and i.deleted_at is null and i.status = 'paid'
   )
   and not exists (
     select 1 from invoices i
      where i.job_id = j.id
        and i.deleted_at is null
        and i.status in ('sent','part_paid','overdue')
   );
