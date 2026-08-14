-- ===========================================================================
-- Remembering who has already been chased.
--
-- The reminder job runs on a schedule and looks at every overdue invoice and
-- every quote about to lapse. Without a record of what it has already sent, a
-- daily run emails the same customer about the same invoice every single
-- morning until they pay — which is not a reminder, it is harassment, and it
-- is the fastest way to get a business marked as spam.
--
-- One timestamp per row is all that is needed. The job only chases something
-- it has not chased in the last few days, so the schedule can be as frequent
-- as we like without changing how often any one customer hears from us.
-- ===========================================================================

alter table invoices
  add column if not exists last_reminder_at timestamptz;

alter table quotes
  add column if not exists last_reminder_at timestamptz;

comment on column invoices.last_reminder_at is
  'When a payment reminder was last emailed. Written only by the reminder job.';

comment on column quotes.last_reminder_at is
  'When an expiry nudge was last emailed. Written only by the reminder job.';

-- Partial indexes: the job asks "which unpaid invoices are past due and have
-- not been chased lately", never anything about the settled ones, and those
-- are the overwhelming majority of the table on any healthy business.
create index if not exists invoices_awaiting_reminder_idx
  on invoices (due_date)
  where status in ('sent', 'overdue') and deleted_at is null;

create index if not exists quotes_awaiting_reminder_idx
  on quotes (valid_until)
  where status = 'sent' and deleted_at is null;
