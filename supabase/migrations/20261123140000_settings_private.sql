-- The settings row holds the UTR, bank details and VAT number. It was readable
-- by every signed-in person, customers included. Now only the owner, and team
-- members who handle money or manage jobs, read it. The customer pages read
-- the few public details they need on the server, and so does the public site.
begin;

drop policy if exists "authenticated reads settings" on settings;
drop policy if exists "team reads settings" on settings;
create policy "team reads settings" on settings for select to authenticated
  using (is_owner() or (is_active_staff() and (staff_can('see_prices') or staff_can('manage_jobs'))));

commit;
