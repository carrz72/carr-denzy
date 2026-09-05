-- ===========================================================================
-- "A month or two."
--
-- `expected_days` holds a single number, which forces a precision nobody has
-- before the work starts. A plumber pricing a refurbishment says "three to
-- four weeks" or "a month or two", and means it — the honest answer is a
-- range, and rounding it to one number either overpromises or looks padded.
--
-- The lower bound stays in `expected_days`, so everything already written
-- against it keeps working and a job with no upper bound reads exactly as it
-- did before. The upper bound is optional and additive.
-- ===========================================================================

alter table jobs
  add column if not exists expected_days_max integer;

-- An upper bound only means something alongside a lower one, and it cannot be
-- shorter than it. Written as one constraint so a half-filled range can never
-- be stored at all.
alter table jobs
  drop constraint if exists jobs_expected_range_valid;

alter table jobs
  add constraint jobs_expected_range_valid check (
    expected_days_max is null
    or (
      expected_days is not null
      and expected_days_max >= expected_days
      and expected_days_max <= 260
    )
  );

comment on column jobs.expected_days_max is
  'Optional upper bound in working days, for an estimate given as a range ("three to four weeks"). Null means the estimate is a single figure.';
