-- ===========================================================================
-- Withdrawing a sent quote
--
-- A quote that went out wrong (wrong price, wrong job, the customer asked for
-- a different option) had no way back: it sat as "Awaiting reply" and the
-- customer could still accept it. "Withdrawn" takes it off the table while
-- keeping it on file, which is the honest record of what was offered.
--
-- Acceptance and decline already refuse anything not in status 'sent'
-- (apply_quote_acceptance / apply_quote_decline), so a withdrawn quote cannot
-- be accepted through the portal, the public link or the owner app.
-- ===========================================================================

alter type quote_status add value if not exists 'withdrawn';

-- A job whose only quote was withdrawn has no quote out any more. Let it go
-- back to 'new' rather than claiming "Quote sent" with nothing sent. Every
-- other transition is unchanged from 20260810091000_functions.sql.
create or replace function job_transition_allowed(p_from job_status, p_to job_status)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'new'         then p_to in ('quoted','scheduled','cancelled','declined')
    when p_from = 'quoted'      then p_to in ('accepted','declined','cancelled','scheduled','new')
    when p_from = 'accepted'    then p_to in ('scheduled','in_progress','cancelled')
    when p_from = 'declined'    then p_to in ('quoted','cancelled')
    when p_from = 'scheduled'   then p_to in ('in_progress','completed','cancelled')
    when p_from = 'in_progress' then p_to in ('completed','cancelled')
    when p_from = 'completed'   then p_to in ('invoiced','in_progress','cancelled')
    when p_from = 'invoiced'    then p_to in ('paid','completed','cancelled')
    when p_from = 'paid'        then p_to in ('invoiced')
    when p_from = 'cancelled'   then p_to in ('new')
    else false
  end;
$$;
