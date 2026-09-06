-- ===========================================================================
-- Carr Denzy — let a job note be corrected
--
-- The policies to do this have existed since the first migration:
--
--   "author edits own note"   on job_notes for update
--   "owner deletes notes"     on job_notes for delete
--
-- Nothing ever called them. Only `addJobNote` was written, so a note typed
-- one-handed under somebody's sink — which is exactly how these get written —
-- was permanent the moment it saved.
--
-- There is no good reason for that. A job note is a working record, not a
-- legal one: the immutable trail lives in `job_events` and `audit_log`, and an
-- invoice is protected by its own triggers. Refusing to fix a typo here buys
-- nothing and costs the owner a note that says the wrong thing for ever.
--
-- What it does need is honesty. A note marked `visible_to_client` has already
-- been read by the customer, and silently rewriting something they read is a
-- different act from fixing a typo before anyone saw it. `updated_at` is what
-- lets the UI say "edited" rather than pretend it was always that way.
-- ===========================================================================

alter table job_notes
  add column updated_at timestamptz not null default now();

comment on column job_notes.updated_at is
  'Equal to created_at until the note is edited. The UI compares the two to '
  'show an "edited" marker — particularly on notes the customer can see.';

create trigger job_notes_updated_at
  before update on job_notes
  for each row execute function set_updated_at();
