-- ===========================================================================
-- Carr Denzy — portfolio
--
-- The "Our work" gallery, moved out of a hard-coded array in src/lib/site.ts
-- so the owner can manage it without a deploy.
--
-- One row is one JOB, not one photograph. A before-and-after is a single row
-- carrying two images, because rendering them as two neighbouring cards is
-- exactly what made them read as two unrelated projects.
-- ===========================================================================

create table portfolio_items (
  id            uuid primary key default gen_random_uuid(),

  -- The finished shot, and the one that leads if there is no pair.
  after_path    text not null,
  -- Non-null turns this row into a before/after pair.
  before_path   text,

  caption       text not null check (char_length(caption) between 3 and 200),
  -- Optional and deliberately sparse: only set where the location is actually
  -- known. Inventing a plausible suburb for a real job is a lie to a customer.
  location      text check (location is null or char_length(location) <= 80),

  sort_order    integer not null default 0,
  is_published  boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column portfolio_items.after_path is
  'Either a path under the `portfolio` storage bucket, or a root-relative path '
  'into /public (e.g. /images/work-33.webp). The app resolves both, which lets '
  'the gallery seed from files already shipped in the repo without a re-upload.';

create index portfolio_items_order_idx
  on portfolio_items (sort_order, created_at)
  where is_published;

create trigger portfolio_items_updated_at
  before update on portfolio_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read is open to anonymous visitors: this is marketing content, and the whole
-- point is that a stranger with a burst pipe can see it. Everything else is
-- owner-only.
-- ---------------------------------------------------------------------------

alter table portfolio_items enable row level security;

create policy "anyone reads published portfolio items"
  on portfolio_items for select to anon, authenticated
  using (is_published);

create policy "staff reads all portfolio items"
  on portfolio_items for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes portfolio items"
  on portfolio_items for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- Storage
--
-- PUBLIC, unlike `job-photos` and `enquiry-photos`.
--
-- Those two are private because they are photographs of the inside of a
-- customer's home. These are the opposite: work the business is actively
-- advertising. A public bucket means a plain CDN URL with no signing round
-- trip, which is what keeps the marketing pages statically renderable.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('portfolio', 'portfolio', true, 10485760,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

create policy "anyone reads portfolio photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'portfolio');

create policy "owner uploads portfolio photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio' and is_owner());

create policy "owner updates portfolio photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'portfolio' and is_owner())
  with check (bucket_id = 'portfolio' and is_owner());

create policy "owner deletes portfolio photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio' and is_owner());

-- ---------------------------------------------------------------------------
-- Seed — the gallery exactly as it stands today, so nothing changes visually
-- on the day this ships. Paths point at files already in /public/images.
--
-- Note row 3: the garden ground works were two separate cards until now. They
-- are one job, and one row.
-- ---------------------------------------------------------------------------

insert into portfolio_items (after_path, before_path, caption, location, sort_order)
values
  ('/images/work-33.webp', null,
   'Garage conversion with porcelain paving and new boundary fencing', null, 10),

  ('/images/work-feature.webp', null,
   'Outbuilding rebuilt from the blockwork up, with a new timber roof', 'Gedling', 20),

  ('/images/work-10.webp', '/images/work-15.webp',
   'Garden ground works, dug out and relaid', null, 30),

  ('/images/work-22.webp', null,
   'Laminate flooring laid through a full room refurbishment', null, 40),

  ('/images/work-18.webp', null,
   'Garden and garage conversion, mid-build', null, 50),

  ('/images/work-12.webp', null,
   'Garden renovation and garage conversion', null, 60),

  ('/images/work-31.webp', null,
   'Building repairs and making good', null, 70),

  ('/images/work-24.webp', null,
   'Interior refurbishment', null, 80),

  ('/images/work-05.webp', null,
   'Patio slabs laid and pointed', null, 90)
on conflict do nothing;
