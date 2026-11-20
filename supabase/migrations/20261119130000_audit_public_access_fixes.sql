-- ===========================================================================
-- Audit fixes, part 2: what an anonymous visitor and a customer can reach
-- directly, without going through the app.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. No anonymous writes straight into enquiries or job_photos.
--
-- The rate limit and the honeypot live in the `submitEnquiry` server action,
-- because Postgres cannot see the caller's IP. These two policies let anyone
-- holding the public anon key skip that action entirely and insert as many
-- enquiries and photo rows as they liked, with photo rows attachable to any
-- enquiry id they could find.
--
-- Nothing needs them: `src/app/request/actions.ts` writes both tables with the
-- service-role client, which RLS does not apply to.
-- ---------------------------------------------------------------------------

drop policy if exists "anyone submits an enquiry" on enquiries;
drop policy if exists "anyone attaches a photo to their own enquiry" on job_photos;


-- ---------------------------------------------------------------------------
-- 2. Anonymous photo uploads: right place, right shape, and a ceiling.
--
-- The enquiry form uploads photos from the browser with the anon key (a
-- six-photo payload is too large for a server action), so this policy has to
-- stay open to `anon`. It used to accept any path in the bucket, in any
-- number. Now:
--
--   * the object must sit directly under `enquiry/`, named the way
--     `storageKey()` in src/lib/photos.ts names it — no other folders, no
--     traversal, nothing the app would not have produced;
--   * the whole bucket takes at most 60 new uploads in any rolling hour.
--
-- The ceiling is deliberately global rather than per visitor: Postgres cannot
-- see who is uploading, and a busy day for this business is a handful of
-- enquiries. It exists to stop the bucket being filled, not to police a
-- person. The bucket's own 10 MB / image-only limits still apply on top.
-- ---------------------------------------------------------------------------

create or replace function enquiry_photo_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*) < 60
    from storage.objects
   where bucket_id = 'enquiry-photos'
     and created_at > now() - interval '1 hour';
$$;

revoke all on function enquiry_photo_upload_allowed() from public;
grant execute on function enquiry_photo_upload_allowed() to anon, authenticated;

drop policy if exists "anyone uploads an enquiry photo" on storage.objects;

create policy "anyone uploads an enquiry photo"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'enquiry-photos'
    and name ~ '^enquiry/[a-z0-9][a-z0-9.-]*$'
    and name not like '%..%'
    and enquiry_photo_upload_allowed()
  );


-- ---------------------------------------------------------------------------
-- 3. A customer can only download job photos the owner chose to share.
--
-- The table policy on `job_photos` already hid rows with
-- `visible_to_client = false`, but the storage policy only checked that the
-- file sat in a folder named after one of the customer's jobs. Listing that
-- folder, or signing a URL for a path, handed over the hidden photos anyway.
--
-- The storage check now goes through the `job_photos` row for that exact
-- file, so the shared flag is the one source of truth. It also stops casting
-- the folder name to uuid, which raised an error for any object whose first
-- folder was not a uuid.
-- ---------------------------------------------------------------------------

drop policy if exists "client reads photos on own jobs" on storage.objects;

create policy "client reads shared photos on own jobs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (
      select 1
        from public.job_photos p
        join public.jobs j on j.id = p.job_id
       where p.storage_path = storage.objects.name
         and p.visible_to_client
         and j.deleted_at is null
         and j.client_id in (select public.my_client_ids())
    )
  );
