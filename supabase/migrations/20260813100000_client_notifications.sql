-- ===========================================================================
-- Telling the customer what is happening.
--
-- Until now a customer heard from the app three times: an enquiry receipt, a
-- quote, and an invoice. Everything in between — the date being set, a message
-- on the job, the work being finished — happened in silence, visible only if
-- they thought to log in.
--
-- The booking one matters most. "When are you coming?" is the customer's
-- single biggest question and the main reason they ring; the app knew the
-- answer and never volunteered it.
-- ===========================================================================

alter table clients
  add column notify_booking    boolean not null default true,
  add column notify_messages   boolean not null default true,
  add column notify_completion boolean not null default true;

comment on column clients.notify_booking is
  'Email when a job is booked in or the date changes. Defaults ON — these are '
  'transactional messages about work the customer asked for, not marketing, so '
  'silence is the surprising choice rather than the safe one.';

-- ---------------------------------------------------------------------------
-- A customer can change their own preferences.
--
-- The existing "client updates own contact details" policy already allows an
-- UPDATE scoped to their own row, so these columns are covered by it. What is
-- NOT covered, and must not be, is a client changing anything financial — that
-- policy pins the row to `profile_id = auth.uid()` and the money lives on other
-- tables entirely.
-- ---------------------------------------------------------------------------

-- Push subscriptions already key off `profiles`, and a client has a profile the
-- moment they sign in — so client push needs no new table, only permission to
-- send to them. Nothing to change here; noted so the absence is not mistaken
-- for an oversight.
