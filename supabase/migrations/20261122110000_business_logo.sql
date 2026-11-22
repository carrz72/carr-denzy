-- ---------------------------------------------------------------------------
-- Business logo on quotes and invoices.
--
-- The logo printed top-left on every quote and invoice (on screen and in the
-- PDF) is whatever file `settings.logo_path` points at in the public
-- `branding` bucket. The owner replaces it from Settings; null means the
-- standard logo shipped with the site (public/images/logo/logo-mark.png).
--
-- Public bucket for the same reason as `portfolio`: the logo is meant to be
-- seen, and a plain URL is what lets the PDF renderer fetch it directly.
-- ---------------------------------------------------------------------------

alter table settings add column if not exists logo_path text;

comment on column settings.logo_path is
  'Path of the business logo inside the branding storage bucket. Null uses the standard logo.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = true;

drop policy if exists "anyone reads branding" on storage.objects;
create policy "anyone reads branding"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'branding');

drop policy if exists "owner uploads branding" on storage.objects;
create policy "owner uploads branding"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and is_owner());

drop policy if exists "owner updates branding" on storage.objects;
create policy "owner updates branding"
  on storage.objects for update to authenticated
  using (bucket_id = 'branding' and is_owner())
  with check (bucket_id = 'branding' and is_owner());

drop policy if exists "owner deletes branding" on storage.objects;
create policy "owner deletes branding"
  on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and is_owner());
