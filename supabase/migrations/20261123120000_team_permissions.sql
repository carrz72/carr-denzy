-- ===========================================================================
-- Team members with permissions.
--
-- the owner can give someone a "staff" login and choose what they can do:
--
--   see_all_jobs     every job, or only the ones assigned to them
--   manage_jobs      add and change jobs and customers, book visits, requests
--   see_prices       see quotes, invoices and payments (read only)
--   manage_quotes    make, change and send quotes
--   manage_invoices  make, change and send invoices
--   record_payments  record and remove payments
--
-- Enforced HERE, in the database, not just by hiding buttons: the app's pages
-- read with the signed-in person's own access, so a "jobs only" helper cannot
-- read an invoice even by typing its address.
--
-- A staff login only counts while it has a staff_permissions row. Removing
-- someone deletes the row, which cuts their access on their very next
-- request, even though their sign-in token still says "staff" for a while.
-- ===========================================================================

create table if not exists staff_permissions (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  level           text not null default 'jobs' check (level in ('jobs', 'jobs_quotes', 'office')),
  see_all_jobs    boolean not null default false,
  manage_jobs     boolean not null default false,
  see_prices      boolean not null default false,
  manage_quotes   boolean not null default false,
  manage_invoices boolean not null default false,
  record_payments boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null,
  -- Somebody who can add jobs has to be able to see the jobs they add.
  constraint staff_manage_jobs_sees_all check (not manage_jobs or see_all_jobs)
);

alter table staff_permissions enable row level security;

drop policy if exists "owner manages staff permissions" on staff_permissions;
create policy "owner manages staff permissions"
  on staff_permissions for all to authenticated
  using (is_owner()) with check (is_owner());

drop policy if exists "staff read own permissions" on staff_permissions;
create policy "staff read own permissions"
  on staff_permissions for select to authenticated
  using (profile_id = auth.uid());

revoke all on staff_permissions from anon;

-- --- Helpers ----------------------------------------------------------------
-- security definer: they read staff_permissions and jobs without going
-- through those tables' own policies, which is what stops a jobs policy that
-- calls a jobs lookup from looping.

create or replace function is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and auth_role() = 'staff'
     and exists (select 1 from staff_permissions where profile_id = auth.uid());
$$;

-- Every existing "staff can..." rule now also needs the permissions row, so a
-- removed person loses access at once rather than when their token expires.
create or replace function is_staff_or_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_owner() or is_active_staff();
$$;

create or replace function staff_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when is_owner() then true
    else coalesce((
      select case p_permission
        when 'see_all_jobs'    then sp.see_all_jobs
        when 'manage_jobs'     then sp.manage_jobs
        -- Anyone who handles money can see it.
        when 'see_prices'      then sp.see_prices or sp.manage_quotes or sp.manage_invoices or sp.record_payments
        when 'manage_quotes'   then sp.manage_quotes
        when 'manage_invoices' then sp.manage_invoices
        when 'record_payments' then sp.record_payments
        else false
      end
      from staff_permissions sp
      where sp.profile_id = auth.uid() and auth_role() = 'staff'
    ), false)
  end;
$$;

create or replace function staff_sees_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_owner()
      or (
        p_job_id is not null
        and is_active_staff()
        and (
          staff_can('see_all_jobs')
          or exists (select 1 from jobs where id = p_job_id and assigned_to = auth.uid())
        )
      );
$$;

create or replace function staff_sees_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_owner()
      or (
        is_active_staff()
        and (
          staff_can('see_all_jobs')
          or exists (
            select 1 from jobs
             where client_id = p_client_id and assigned_to = auth.uid() and deleted_at is null
          )
        )
      );
$$;

revoke execute on function staff_can(text) from anon;
revoke execute on function staff_sees_job(uuid) from anon;
revoke execute on function staff_sees_client(uuid) from anon;

-- --- Customers --------------------------------------------------------------

drop policy if exists "staff reads clients" on clients;
create policy "staff reads clients" on clients for select to authenticated
  using (staff_sees_client(id));

drop policy if exists "staff adds clients" on clients;
create policy "staff adds clients" on clients for insert to authenticated
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff changes clients" on clients;
create policy "staff changes clients" on clients for update to authenticated
  using (is_active_staff() and staff_can('manage_jobs'))
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff reads properties" on properties;
create policy "staff reads properties" on properties for select to authenticated
  using (staff_sees_client(client_id));

drop policy if exists "staff adds properties" on properties;
create policy "staff adds properties" on properties for insert to authenticated
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff changes properties" on properties;
create policy "staff changes properties" on properties for update to authenticated
  using (is_active_staff() and staff_can('manage_jobs'))
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff read all members" on client_members;
create policy "staff read all members" on client_members for select to authenticated
  using (staff_sees_client(client_id));

drop policy if exists "staff reads private client notes" on client_private_notes;
create policy "staff reads private client notes" on client_private_notes for select to authenticated
  using (staff_sees_client(client_id));

-- --- Requests ---------------------------------------------------------------

drop policy if exists "staff reads enquiries" on enquiries;
create policy "staff reads enquiries" on enquiries for select to authenticated
  using (is_owner() or (is_active_staff() and staff_can('manage_jobs')));

drop policy if exists "staff updates enquiries" on enquiries;
create policy "staff updates enquiries" on enquiries for update to authenticated
  using (is_active_staff() and staff_can('manage_jobs'))
  with check (is_active_staff() and staff_can('manage_jobs'));

-- --- Jobs -------------------------------------------------------------------

drop policy if exists "staff reads jobs" on jobs;
create policy "staff reads jobs" on jobs for select to authenticated
  using (staff_sees_job(id));

drop policy if exists "staff updates assigned jobs" on jobs;
create policy "staff updates assigned jobs" on jobs for update to authenticated
  using (is_active_staff() and assigned_to = auth.uid() and deleted_at is null)
  with check (is_active_staff() and assigned_to = auth.uid() and deleted_at is null);

drop policy if exists "staff adds jobs" on jobs;
create policy "staff adds jobs" on jobs for insert to authenticated
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff changes jobs" on jobs;
create policy "staff changes jobs" on jobs for update to authenticated
  using (is_active_staff() and staff_can('manage_jobs'))
  with check (is_active_staff() and staff_can('manage_jobs'));

drop policy if exists "staff reads job events" on job_events;
create policy "staff reads job events" on job_events for select to authenticated
  using (staff_sees_job(job_id));

drop policy if exists "staff reads all notes" on job_notes;
create policy "staff reads all notes" on job_notes for select to authenticated
  using (staff_sees_job(job_id));

drop policy if exists "staff writes notes" on job_notes;
create policy "staff writes notes" on job_notes for insert to authenticated
  with check (staff_sees_job(job_id) and author_id = auth.uid());

drop policy if exists "staff reads all photos" on job_photos;
create policy "staff reads all photos" on job_photos for select to authenticated
  using (is_owner() or staff_sees_job(job_id));

drop policy if exists "staff writes job photos" on job_photos;
create policy "staff writes job photos" on job_photos for insert to authenticated
  with check (job_id is not null and staff_sees_job(job_id));

drop policy if exists "owner updates photos" on job_photos;
create policy "owner updates photos" on job_photos for update to authenticated
  using (is_owner() or staff_sees_job(job_id))
  with check (is_owner() or staff_sees_job(job_id));

drop policy if exists "staff manages visits" on job_visits;
drop policy if exists "staff reads visits" on job_visits;
create policy "staff reads visits" on job_visits for select to authenticated
  using (staff_sees_job(job_id));

drop policy if exists "staff books visits" on job_visits;
create policy "staff books visits" on job_visits for all to authenticated
  using (is_owner() or (staff_can('manage_jobs') and staff_sees_job(job_id)))
  with check (is_owner() or (staff_can('manage_jobs') and staff_sees_job(job_id)));

-- Messages: same customer side as before; the team side now only on jobs
-- they can see.
drop policy if exists "participants read job messages" on messages;
create policy "participants read job messages" on messages for select to authenticated
  using (
    staff_sees_job(job_id)
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids()) and j.deleted_at is null
    )
  );

drop policy if exists "participants post job messages" on messages;
create policy "participants post job messages" on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      staff_sees_job(job_id)
      or job_id in (
        select j.id from jobs j
         where j.client_id in (select my_client_ids()) and j.deleted_at is null
      )
    )
  );

drop policy if exists "mark messages read" on messages;
create policy "mark messages read" on messages for update to authenticated
  using (
    staff_sees_job(job_id)
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids()) and j.deleted_at is null
    )
  )
  with check (
    staff_sees_job(job_id)
    or job_id in (
      select j.id from jobs j
       where j.client_id in (select my_client_ids()) and j.deleted_at is null
    )
  );

-- --- Money --------------------------------------------------------------------

drop policy if exists "staff reads quotes" on quotes;
create policy "staff reads quotes" on quotes for select to authenticated
  using (is_owner() or (staff_can('see_prices') and staff_sees_job(job_id)));

drop policy if exists "staff writes quotes" on quotes;
create policy "staff writes quotes" on quotes for all to authenticated
  using (is_active_staff() and staff_can('manage_quotes') and staff_sees_job(job_id))
  with check (is_active_staff() and staff_can('manage_quotes') and staff_sees_job(job_id));

drop policy if exists "staff reads quote items" on quote_items;
create policy "staff reads quote items" on quote_items for select to authenticated
  using (is_owner() or (staff_can('see_prices') and quote_id in (select id from quotes)));

drop policy if exists "staff writes quote items" on quote_items;
create policy "staff writes quote items" on quote_items for all to authenticated
  using (is_active_staff() and staff_can('manage_quotes') and quote_id in (select id from quotes))
  with check (is_active_staff() and staff_can('manage_quotes') and quote_id in (select id from quotes));

drop policy if exists "staff reads invoices" on invoices;
create policy "staff reads invoices" on invoices for select to authenticated
  using (
    is_owner()
    or (
      staff_can('see_prices')
      and case when job_id is null then staff_can('see_all_jobs') else staff_sees_job(job_id) end
    )
  );

-- Add and change only: an issued invoice is a legal record, and only the owner
-- can make one disappear (and the app never hard-deletes them anyway).
drop policy if exists "staff writes invoices" on invoices;
drop policy if exists "staff adds invoices" on invoices;
create policy "staff adds invoices" on invoices for insert to authenticated
  with check (
    is_active_staff() and staff_can('manage_invoices')
    and case when job_id is null then staff_can('see_all_jobs') else staff_sees_job(job_id) end
  );

drop policy if exists "staff changes invoices" on invoices;
create policy "staff changes invoices" on invoices for update to authenticated
  using (
    is_active_staff() and staff_can('manage_invoices')
    and case when job_id is null then staff_can('see_all_jobs') else staff_sees_job(job_id) end
  )
  with check (
    is_active_staff() and staff_can('manage_invoices')
    and case when job_id is null then staff_can('see_all_jobs') else staff_sees_job(job_id) end
  );

drop policy if exists "staff reads invoice items" on invoice_items;
create policy "staff reads invoice items" on invoice_items for select to authenticated
  using (is_owner() or (staff_can('see_prices') and invoice_id in (select id from invoices)));

drop policy if exists "staff writes invoice items" on invoice_items;
create policy "staff writes invoice items" on invoice_items for all to authenticated
  using (is_active_staff() and staff_can('manage_invoices') and invoice_id in (select id from invoices))
  with check (is_active_staff() and staff_can('manage_invoices') and invoice_id in (select id from invoices));

drop policy if exists "staff reads payments" on payments;
create policy "staff reads payments" on payments for select to authenticated
  using (is_owner() or (staff_can('see_prices') and invoice_id in (select id from invoices)));

drop policy if exists "staff records payments" on payments;
create policy "staff records payments" on payments for all to authenticated
  using (is_active_staff() and staff_can('record_payments') and invoice_id in (select id from invoices))
  with check (is_active_staff() and staff_can('record_payments') and invoice_id in (select id from invoices));

drop policy if exists "staff reads price list" on price_items;
create policy "staff reads price list" on price_items for select to authenticated
  using (staff_can('see_prices'));

drop policy if exists "staff manage chase controls" on chase_controls;
create policy "staff manage chase controls" on chase_controls for all to authenticated
  using (is_owner() or staff_can('manage_invoices') or staff_can('record_payments') or (entity = 'quote' and staff_can('manage_quotes')) or (entity = 'job' and staff_can('manage_jobs')))
  with check (is_owner() or staff_can('manage_invoices') or staff_can('record_payments') or (entity = 'quote' and staff_can('manage_quotes')) or (entity = 'job' and staff_can('manage_jobs')));

-- the owner's to-do list is his; a team member keeps their own.
drop policy if exists "staff manage reminders" on owner_reminders;
create policy "staff manage reminders" on owner_reminders for all to authenticated
  using (is_owner() or (is_active_staff() and created_by = auth.uid()))
  with check (is_owner() or (is_active_staff() and created_by = auth.uid()));
