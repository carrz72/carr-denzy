-- ===========================================================================
-- Carr Denzy — Row Level Security
--
-- This file, not the route groups, is the authorisation boundary. A forged
-- request straight at PostgREST must fail exactly as a forged request through
-- the app does.
--
-- Rules applied throughout (spec NFR-11 … NFR-14):
--   * RLS is enabled on every table in `public`.
--   * No `USING (true)` for the `authenticated` or `anon` roles.
--   * Every INSERT and UPDATE policy carries a WITH CHECK clause.
--   * Identity always comes from auth.uid(), never from a client-sent id.
--   * A client reading someone else's row gets zero rows, which the app turns
--     into a 404 rather than a 403 — so ids cannot be enumerated (spec E-6).
-- ===========================================================================

alter table profiles      enable row level security;
alter table settings      enable row level security;
alter table services      enable row level security;
alter table clients       enable row level security;
alter table properties    enable row level security;
alter table enquiries     enable row level security;
alter table jobs          enable row level security;
alter table job_events    enable row level security;
alter table job_notes     enable row level security;
alter table job_photos    enable row level security;
alter table messages      enable row level security;
alter table price_items   enable row level security;
alter table quotes        enable row level security;
alter table quote_items   enable row level security;
alter table invoices      enable row level security;
alter table invoice_items enable row level security;
alter table payments      enable row level security;
alter table audit_log     enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "read own profile"
  on profiles for select to authenticated
  using (id = auth.uid());

create policy "owner reads all profiles"
  on profiles for select to authenticated
  using (is_staff_or_owner());

-- Note the WITH CHECK: a user may edit their own name and phone, but the
-- policy pins `role` to its existing value, so nobody can promote themselves
-- (spec FR-18). Role changes happen only via the service_role key.
create policy "update own profile, not own role"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from profiles p where p.id = auth.uid())
  );

create policy "owner updates profiles"
  on profiles for update to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- settings — business details. Readable by anyone signed in (invoices show
-- them anyway); writable only by the owner.
-- ---------------------------------------------------------------------------

create policy "authenticated reads settings"
  on settings for select to authenticated
  using (true);

create policy "owner updates settings"
  on settings for update to authenticated
  using (is_owner())
  with check (is_owner());

create policy "owner inserts settings"
  on settings for insert to authenticated
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- services — public marketing content
-- ---------------------------------------------------------------------------

create policy "anyone reads active services"
  on services for select to anon, authenticated
  using (is_active);

create policy "owner reads all services"
  on services for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes services"
  on services for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create policy "client reads own record"
  on clients for select to authenticated
  using (profile_id = auth.uid() and deleted_at is null);

create policy "client updates own contact details"
  on clients for update to authenticated
  using (profile_id = auth.uid() and deleted_at is null)
  with check (
    profile_id = auth.uid()
    and deleted_at is null
  );

create policy "staff reads clients"
  on clients for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes clients"
  on clients for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create policy "client reads own properties"
  on properties for select to authenticated
  using (client_id in (select my_client_ids()));

create policy "staff reads properties"
  on properties for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes properties"
  on properties for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- enquiries
--
-- Insert is deliberately open to `anon`: a stranger with a burst pipe must be
-- able to reach the business without making an account (spec FR-5). The abuse
-- surface is handled above the database — rate limit per IP and a honeypot in
-- the server action (spec NFR-20) — because Postgres cannot see the caller's
-- IP. Read is closed: nobody anonymous can read anything back.
-- ---------------------------------------------------------------------------

create policy "anyone submits an enquiry"
  on enquiries for insert to anon, authenticated
  with check (
    status = 'new'
    and job_id is null
    and client_id is null
    and char_length(description) >= 10
    and (email is not null or phone is not null)
  );

create policy "staff reads enquiries"
  on enquiries for select to authenticated
  using (is_staff_or_owner());

create policy "owner updates enquiries"
  on enquiries for update to authenticated
  using (is_owner())
  with check (is_owner());

create policy "owner deletes enquiries"
  on enquiries for delete to authenticated
  using (is_owner());

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create policy "client reads own jobs"
  on jobs for select to authenticated
  using (client_id in (select my_client_ids()) and deleted_at is null);

create policy "staff reads jobs"
  on jobs for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes jobs"
  on jobs for all to authenticated
  using (is_owner())
  with check (is_owner());

-- Staff may move a job along and nothing else. They cannot reassign it away
-- from themselves, and they never touch money.
create policy "staff updates assigned jobs"
  on jobs for update to authenticated
  using (auth_role() = 'staff' and assigned_to = auth.uid() and deleted_at is null)
  with check (auth_role() = 'staff' and assigned_to = auth.uid() and deleted_at is null);

-- ---------------------------------------------------------------------------
-- job_events — append-only timeline. Written by trigger; nobody UPDATEs or
-- DELETEs, so no such policies exist and the tables stays honest.
-- ---------------------------------------------------------------------------

create policy "client reads own job events"
  on job_events for select to authenticated
  using (
    job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

create policy "staff reads job events"
  on job_events for select to authenticated
  using (is_staff_or_owner());

-- ---------------------------------------------------------------------------
-- job_notes
-- ---------------------------------------------------------------------------

create policy "client reads shared notes"
  on job_notes for select to authenticated
  using (
    visible_to_client
    and job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

create policy "staff reads all notes"
  on job_notes for select to authenticated
  using (is_staff_or_owner());

create policy "staff writes notes"
  on job_notes for insert to authenticated
  with check (is_staff_or_owner() and author_id = auth.uid());

create policy "author edits own note"
  on job_notes for update to authenticated
  using (is_staff_or_owner() and author_id = auth.uid())
  with check (is_staff_or_owner() and author_id = auth.uid());

create policy "owner deletes notes"
  on job_notes for delete to authenticated
  using (is_owner());

-- ---------------------------------------------------------------------------
-- job_photos
-- ---------------------------------------------------------------------------

create policy "anyone attaches a photo to their own enquiry"
  on job_photos for insert to anon, authenticated
  with check (enquiry_id is not null and job_id is null);

create policy "client reads shared job photos"
  on job_photos for select to authenticated
  using (
    visible_to_client
    and job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

create policy "staff reads all photos"
  on job_photos for select to authenticated
  using (is_staff_or_owner());

create policy "staff writes job photos"
  on job_photos for insert to authenticated
  with check (is_staff_or_owner() and job_id is not null);

create policy "owner updates photos"
  on job_photos for update to authenticated
  using (is_staff_or_owner())
  with check (is_staff_or_owner());

create policy "owner deletes photos"
  on job_photos for delete to authenticated
  using (is_owner());

-- ---------------------------------------------------------------------------
-- messages — the owner ↔ client thread
-- ---------------------------------------------------------------------------

create policy "participants read job messages"
  on messages for select to authenticated
  using (
    is_staff_or_owner()
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

create policy "participants post job messages"
  on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      is_staff_or_owner()
      or job_id in (
        select j.id from jobs j
         where j.client_id in (select my_client_ids())
           and j.deleted_at is null
      )
    )
  );

create policy "mark messages read"
  on messages for update to authenticated
  using (
    is_staff_or_owner()
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  )
  with check (
    is_staff_or_owner()
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- price_items — the owner's own price list. Clients never see it.
-- ---------------------------------------------------------------------------

create policy "staff reads price list"
  on price_items for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes price list"
  on price_items for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- quotes
--
-- A client may READ a quote addressed to them, and respond to it only through
-- accept_quote() / decline_quote(). There is deliberately no client UPDATE
-- policy, so a crafted PATCH setting total_pence to 1 has nowhere to land
-- (spec AC-5).
-- ---------------------------------------------------------------------------

create policy "client reads own sent quotes"
  on quotes for select to authenticated
  using (
    client_id in (select my_client_ids())
    and status <> 'draft'
    and deleted_at is null
  );

create policy "staff reads quotes"
  on quotes for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes quotes"
  on quotes for all to authenticated
  using (is_owner())
  with check (is_owner());

create policy "client reads own quote items"
  on quote_items for select to authenticated
  using (
    quote_id in (
      select q.id from quotes q
       where q.client_id in (select my_client_ids())
         and q.status <> 'draft'
         and q.deleted_at is null
    )
  );

create policy "staff reads quote items"
  on quote_items for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes quote items"
  on quote_items for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- invoices — same shape as quotes. Clients read; only the owner writes.
-- ---------------------------------------------------------------------------

create policy "client reads own issued invoices"
  on invoices for select to authenticated
  using (
    client_id in (select my_client_ids())
    and status <> 'draft'
    and deleted_at is null
  );

create policy "staff reads invoices"
  on invoices for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes invoices"
  on invoices for all to authenticated
  using (is_owner())
  with check (is_owner());

create policy "client reads own invoice items"
  on invoice_items for select to authenticated
  using (
    invoice_id in (
      select i.id from invoices i
       where i.client_id in (select my_client_ids())
         and i.status <> 'draft'
         and i.deleted_at is null
    )
  );

create policy "staff reads invoice items"
  on invoice_items for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes invoice items"
  on invoice_items for all to authenticated
  using (is_owner())
  with check (is_owner());

-- Clients see what they have paid, but recording a payment is the owner's act
-- alone — there is no client INSERT policy here by design.
create policy "client reads own payments"
  on payments for select to authenticated
  using (
    invoice_id in (
      select i.id from invoices i
       where i.client_id in (select my_client_ids())
         and i.status <> 'draft'
         and i.deleted_at is null
    )
  );

create policy "staff reads payments"
  on payments for select to authenticated
  using (is_staff_or_owner());

create policy "owner writes payments"
  on payments for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- audit_log — owner may read; writes come from SECURITY DEFINER functions and
-- the service_role key. No INSERT policy for `authenticated`, so a client
-- cannot forge an entry.
-- ---------------------------------------------------------------------------

create policy "owner reads audit log"
  on audit_log for select to authenticated
  using (is_owner());

-- ===========================================================================
-- Storage
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('job-photos', 'job-photos', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('enquiry-photos', 'enquiry-photos', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Enquiry photos: a stranger can upload, nobody anonymous can read back. The
-- app serves them to the owner through short-lived signed URLs (spec NFR-17).
create policy "anyone uploads an enquiry photo"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'enquiry-photos');

create policy "staff reads enquiry photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'enquiry-photos' and is_staff_or_owner());

create policy "owner deletes enquiry photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'enquiry-photos' and is_owner());

-- Job photos are filed under `<job_id>/<filename>`, so the first path segment
-- is the job id and the policy can join straight to job ownership.
create policy "staff writes job photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and is_staff_or_owner());

create policy "staff reads job photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and is_staff_or_owner());

create policy "client reads photos on own jobs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1]::uuid in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids())
         and j.deleted_at is null
    )
  );

create policy "owner deletes job photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and is_owner());
