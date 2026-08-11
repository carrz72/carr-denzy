-- ===========================================================================
-- Carr Denzy — functions and triggers
--
-- Everything that must be true regardless of which client is talking to the
-- database lives here: reference allocation, money arithmetic, the job status
-- machine, and payment reconciliation.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- The role is read from the JWT's app_metadata rather than from the profiles
-- table, so evaluating a policy costs no extra query per row. `profiles.role`
-- remains the durable record; the claim is the fast path, written by the
-- server-side promotion step in the auth callback.
--
-- Defined first because the SECURITY DEFINER functions below call them.
-- ---------------------------------------------------------------------------

create or replace function auth_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role',
    'client'
  );
$$;

create or replace function is_owner()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and auth_role() = 'owner';
$$;

create or replace function is_staff_or_owner()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and auth_role() in ('owner', 'staff');
$$;

-- Every client record the caller controls. A signed-in person is normally one
-- client, but this stays a set so a future "manages several accounts" case
-- needs no policy rewrite.
create or replace function my_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clients
   where profile_id = auth.uid()
     and deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at   before update on profiles   for each row execute function set_updated_at();
create trigger settings_updated_at   before update on settings   for each row execute function set_updated_at();
create trigger clients_updated_at    before update on clients    for each row execute function set_updated_at();
create trigger properties_updated_at before update on properties for each row execute function set_updated_at();
create trigger enquiries_updated_at  before update on enquiries  for each row execute function set_updated_at();
create trigger jobs_updated_at       before update on jobs       for each row execute function set_updated_at();
create trigger quotes_updated_at     before update on quotes     for each row execute function set_updated_at();
create trigger invoices_updated_at   before update on invoices   for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Reference allocation
--
-- Taken from a sequence inside the insert transaction. Doing this in the app
-- with `select max(...) + 1` is how two invoices end up sharing a number under
-- concurrency; this cannot (spec NFR-21, AC-7).
-- ---------------------------------------------------------------------------

create or replace function assign_reference()
returns trigger
language plpgsql
as $$
declare
  prefix text := tg_argv[0];
  seq    text := tg_argv[1];
  n      bigint;
begin
  if new.reference is null or new.reference = '' then
    execute format('select nextval(%L)', seq) into n;
    new.reference := prefix || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger enquiries_reference before insert on enquiries
  for each row execute function assign_reference('ENQ', 'enquiry_ref_seq');

create trigger jobs_reference before insert on jobs
  for each row execute function assign_reference('JOB', 'job_ref_seq');

create trigger quotes_reference before insert on quotes
  for each row execute function assign_reference('QUO', 'quote_ref_seq');

create trigger invoices_reference before insert on invoices
  for each row execute function assign_reference('INV', 'invoice_ref_seq');

-- ---------------------------------------------------------------------------
-- Money
--
-- A line's amount is quantity (×1000) × unit price in pence, divided by 1000
-- and rounded half-up to the nearest penny. All integer arithmetic — no float
-- ever touches a customer total.
-- ---------------------------------------------------------------------------

create or replace function line_amount_pence(quantity_milli integer, unit_price_pence integer)
returns integer
language sql
immutable
as $$
  select ((quantity_milli::bigint * unit_price_pence::bigint) + 500) / 1000;
$$;

create or replace function apply_rate_bp(amount_pence integer, rate_bp integer)
returns integer
language sql
immutable
as $$
  select ((amount_pence::bigint * rate_bp::bigint) + 5000) / 10000;
$$;

-- --- quote totals ----------------------------------------------------------

create or replace function recalc_quote_totals(p_quote_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal integer := 0;
  v_tax      integer := 0;
  v_vat_on   boolean := false;
begin
  select vat_registered into v_vat_on from settings where id is true;

  select
    coalesce(sum(line_amount_pence(quantity_milli, unit_price_pence)), 0),
    coalesce(sum(
      case when v_vat_on
        then apply_rate_bp(line_amount_pence(quantity_milli, unit_price_pence), vat_rate_bp)
        else 0
      end
    ), 0)
  into v_subtotal, v_tax
  from quote_items
  where quote_id = p_quote_id;

  update quotes
     set subtotal_pence = v_subtotal,
         tax_pence      = v_tax,
         total_pence    = v_subtotal + v_tax
   where id = p_quote_id;
end;
$$;

create or replace function quote_items_recalc()
returns trigger
language plpgsql
as $$
begin
  perform recalc_quote_totals(coalesce(new.quote_id, old.quote_id));
  return coalesce(new, old);
end;
$$;

create trigger quote_items_recalc_trg
  after insert or update or delete on quote_items
  for each row execute function quote_items_recalc();

-- --- invoice totals --------------------------------------------------------

create or replace function recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal   integer := 0;
  v_vat        integer := 0;
  v_labour     integer := 0;
  v_cis        integer := 0;
  v_paid       integer := 0;
  v_total      integer := 0;
  v_reverse    boolean := false;
  v_vat_on     boolean := false;
  v_cis_on     boolean := false;
  v_cis_rate   integer := 0;
  v_status     invoice_status;
begin
  select vat_registered, cis_enabled, cis_deduction_rate_bp
    into v_vat_on, v_cis_on, v_cis_rate
    from settings where id is true;

  select reverse_charge, status into v_reverse, v_status
    from invoices where id = p_invoice_id;

  select
    coalesce(sum(line_amount_pence(quantity_milli, unit_price_pence)), 0),
    coalesce(sum(
      case when v_vat_on and not v_reverse
        then apply_rate_bp(line_amount_pence(quantity_milli, unit_price_pence), vat_rate_bp)
        else 0
      end
    ), 0),
    coalesce(sum(
      case when kind = 'labour'
        then line_amount_pence(quantity_milli, unit_price_pence)
        else 0
      end
    ), 0)
  into v_subtotal, v_vat, v_labour
  from invoice_items
  where invoice_id = p_invoice_id;

  -- CIS is deducted from labour only, never from materials.
  if v_cis_on then
    v_cis := apply_rate_bp(v_labour, v_cis_rate);
  end if;

  v_total := v_subtotal + v_vat - v_cis;

  select coalesce(sum(amount_pence), 0) into v_paid
    from payments where invoice_id = p_invoice_id;

  -- Only reconcile status for invoices that are actually out in the world.
  -- A draft stays a draft no matter what is recorded against it.
  if v_status in ('sent', 'part_paid', 'paid', 'overdue') then
    if v_paid >= v_total and v_total > 0 then
      v_status := 'paid';
    elsif v_paid > 0 then
      v_status := 'part_paid';
    elsif v_status = 'paid' or v_status = 'part_paid' then
      v_status := 'sent';
    end if;
  end if;

  update invoices
     set subtotal_pence      = v_subtotal,
         vat_pence           = v_vat,
         cis_deduction_pence = v_cis,
         total_pence         = v_total,
         paid_pence          = v_paid,
         status              = v_status,
         paid_at             = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = p_invoice_id;
end;
$$;

create or replace function invoice_items_recalc()
returns trigger
language plpgsql
as $$
begin
  perform recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

create trigger invoice_items_recalc_trg
  after insert or update or delete on invoice_items
  for each row execute function invoice_items_recalc();

create trigger payments_recalc_trg
  after insert or update or delete on payments
  for each row execute function invoice_items_recalc();

-- ---------------------------------------------------------------------------
-- Issued invoices are immutable (spec FR-57, AC-12)
-- ---------------------------------------------------------------------------

create or replace function guard_issued_invoice_items()
returns trigger
language plpgsql
as $$
declare
  v_status invoice_status;
  v_id     uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  select status into v_status from invoices where id = v_id;

  if v_status in ('sent', 'part_paid', 'paid') then
    raise exception
      'Issued invoices can''t be edited. Issue a credit note instead.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger invoice_items_immutable_trg
  before insert or update or delete on invoice_items
  for each row execute function guard_issued_invoice_items();

-- ---------------------------------------------------------------------------
-- Accepted quotes are immutable (spec FR-44)
-- ---------------------------------------------------------------------------

create or replace function guard_accepted_quote_items()
returns trigger
language plpgsql
as $$
declare
  v_status quote_status;
  v_id     uuid := coalesce(new.quote_id, old.quote_id);
begin
  select status into v_status from quotes where id = v_id;

  if v_status = 'accepted' then
    raise exception
      'This quote has been accepted and can''t be changed. Create a new quote instead.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quote_items_immutable_trg
  before insert or update or delete on quote_items
  for each row execute function guard_accepted_quote_items();

-- ---------------------------------------------------------------------------
-- Job status machine (spec section 3, FR-31, FR-32)
-- ---------------------------------------------------------------------------

create or replace function job_transition_allowed(p_from job_status, p_to job_status)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'new'         then p_to in ('quoted','scheduled','cancelled','declined')
    when p_from = 'quoted'      then p_to in ('accepted','declined','cancelled','scheduled')
    when p_from = 'accepted'    then p_to in ('scheduled','in_progress','cancelled')
    when p_from = 'declined'    then p_to in ('quoted','cancelled')
    when p_from = 'scheduled'   then p_to in ('in_progress','completed','cancelled')
    when p_from = 'in_progress' then p_to in ('completed','cancelled')
    when p_from = 'completed'   then p_to in ('invoiced','in_progress','cancelled')
    when p_from = 'invoiced'    then p_to in ('paid','completed','cancelled')
    when p_from = 'paid'        then p_to in ('invoiced')
    when p_from = 'cancelled'   then p_to in ('new')
    else false
  end;
$$;

create or replace function job_status_label(p_status job_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'new'         then 'New request'
    when 'quoted'      then 'Quote sent'
    when 'accepted'    then 'Quote accepted'
    when 'declined'    then 'Quote declined'
    when 'scheduled'   then 'Booked in'
    when 'in_progress' then 'Work under way'
    when 'completed'   then 'Work finished'
    when 'invoiced'    then 'Invoice sent'
    when 'paid'        then 'Paid'
    when 'cancelled'   then 'Cancelled'
  end;
$$;

create or replace function jobs_status_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not job_transition_allowed(old.status, new.status) then
      raise exception 'A job can''t go from % to %.',
        job_status_label(old.status), job_status_label(new.status)
        using errcode = 'check_violation';
    end if;

    -- Completing a job stamps the time once and never re-stamps it.
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger jobs_status_guard_trg
  before update on jobs
  for each row execute function jobs_status_guard();

create or replace function jobs_status_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into job_events (job_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into job_events (job_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;

  return new;
end;
$$;

create trigger jobs_status_event_trg
  after insert or update on jobs
  for each row execute function jobs_status_event();

-- ---------------------------------------------------------------------------
-- Quote acceptance (spec FR-23, AC-4)
--
-- A SECURITY DEFINER function, because accepting a quote has to touch the job
-- and sibling quotes — rows a client has no direct write access to. This is
-- the one narrow, audited hole in the client's write surface.
-- ---------------------------------------------------------------------------

create or replace function accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote  quotes%rowtype;
  v_caller uuid := auth.uid();
  v_ok     boolean;
begin
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  -- The caller must own this quote's client record, or be the owner/staff.
  select exists (
    select 1 from clients c
     where c.id = v_quote.client_id
       and c.profile_id = v_caller
  ) or is_staff_or_owner()
  into v_ok;

  if not v_ok then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status = 'accepted', responded_at = now()
   where id = p_quote_id;

  -- Every other open quote on the same job is off the table.
  update quotes
     set status = 'expired', responded_at = now()
   where job_id = v_quote.job_id
     and id <> p_quote_id
     and status = 'sent';

  update jobs set status = 'accepted' where id = v_quote.job_id;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (v_caller, 'quote.accepted', 'quote', p_quote_id,
          jsonb_build_object('job_id', v_quote.job_id, 'total_pence', v_quote.total_pence));
end;
$$;

create or replace function decline_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote  quotes%rowtype;
  v_caller uuid := auth.uid();
  v_ok     boolean;
begin
  select * into v_quote from quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from clients c
     where c.id = v_quote.client_id
       and c.profile_id = v_caller
  ) or is_staff_or_owner()
  into v_ok;

  if not v_ok then
    raise exception 'Not found.' using errcode = 'no_data_found';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  update quotes
     set status = 'declined',
         responded_at = now(),
         decline_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_quote_id;

  -- Only move the job to declined if nothing else is still on the table.
  if not exists (
    select 1 from quotes
     where job_id = v_quote.job_id and status = 'sent' and id <> p_quote_id
  ) then
    update jobs set status = 'declined' where id = v_quote.job_id;
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (v_caller, 'quote.declined', 'quote', p_quote_id,
          jsonb_build_object('job_id', v_quote.job_id, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Overdue sweep — called from the dashboard load, cheap and idempotent
-- ---------------------------------------------------------------------------

create or replace function mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update invoices
     set status = 'overdue'
   where status = 'sent'
     and due_date is not null
     and due_date < (now() at time zone 'Europe/London')::date
     and deleted_at is null;

  get diagnostics v_count = row_count;

  update quotes
     set status = 'expired'
   where status = 'sent'
     and valid_until is not null
     and valid_until < (now() at time zone 'Europe/London')::date
     and deleted_at is null;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- New auth user → profile, and link any client record waiting on that email
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext := new.email;
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    v_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'client'   -- never trust signup metadata for role; promotion is server-side
  )
  on conflict (id) do nothing;

  -- A phone enquiry becomes a client record long before that person ever signs
  -- in. When they finally do, adopt the record instead of orphaning it.
  update clients
     set profile_id = new.id
   where profile_id is null
     and email = v_email;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
