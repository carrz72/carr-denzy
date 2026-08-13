-- ===========================================================================
-- Getting told about a new enquiry.
--
-- Until now the only alert was an email to a single address held in an
-- environment variable — which meant the owner could not change it, could not
-- add a second person, and had no idea when it silently stopped working.
--
-- Two things here:
--   1. `settings.notification_emails` — owner-editable, more than one address.
--   2. `push_subscriptions` — so the installed app can buzz a phone the moment
--      an enquiry lands, which is the only mechanism that actually reaches
--      somebody under a sink at eight in the evening.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Who gets told
-- ---------------------------------------------------------------------------

alter table settings
  add column notification_emails text[] not null default '{}';

comment on column settings.notification_emails is
  'Everyone who should receive new-enquiry alerts. Empty falls back to the '
  'OWNER_NOTIFICATION_EMAIL environment variable, so an empty list never means '
  'silence — it means "use the original single address".';

-- ---------------------------------------------------------------------------
-- Push subscriptions
--
-- One row per browser per device. A person with the app on a phone and a
-- tablet has two, and both should buzz.
-- ---------------------------------------------------------------------------

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,

  -- The push service endpoint. Unique because re-subscribing on the same
  -- device returns the same endpoint, and a duplicate would mean the phone
  -- buzzes twice for one enquiry.
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,

  -- Just enough to tell "my phone" from "the tablet" when revoking one.
  user_agent   text,

  created_at   timestamptz not null default now(),
  last_used_at timestamptz,

  -- Push services return 404/410 for a subscription that no longer exists.
  -- Counted rather than deleted on the first failure: a single failed send can
  -- be a transient outage, and dropping the subscription would silently stop
  -- notifying somebody who is still there.
  failure_count integer not null default 0
);

create index push_subscriptions_profile_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

-- A person manages only their own devices. Nobody, including the owner, can
-- read another person's subscription — those keys would let you push arbitrary
-- notifications to their phone.
create policy "read own push subscriptions"
  on push_subscriptions for select to authenticated
  using (profile_id = auth.uid());

create policy "register own device"
  on push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());

create policy "update own device"
  on push_subscriptions for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "remove own device"
  on push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());

-- Sending happens server-side with the service-role key, which bypasses the
-- policies above by design — the sender is the system, not a signed-in person.
