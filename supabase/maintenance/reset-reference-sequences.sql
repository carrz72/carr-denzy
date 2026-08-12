-- ===========================================================================
-- Reset reference numbering to 0001.
--
-- Run ONLY on a database with no live records — it makes the next enquiry,
-- job, quote and invoice start again at 0001. Running it while real invoices
-- exist would hand a second invoice the same number as one already sent to a
-- customer, which is exactly the collision the sequences exist to prevent.
--
-- The guard below refuses to run in that case rather than trusting the reader
-- to have checked.
-- ===========================================================================

do $$
declare
  v_invoices integer;
  v_quotes   integer;
  v_jobs     integer;
  v_enquiries integer;
begin
  select count(*) into v_invoices  from invoices;
  select count(*) into v_quotes    from quotes;
  select count(*) into v_jobs      from jobs;
  select count(*) into v_enquiries from enquiries;

  if v_invoices > 0 or v_quotes > 0 or v_jobs > 0 or v_enquiries > 0 then
    raise exception
      'Refusing to reset: % invoice(s), % quote(s), % job(s), % enquiry(s) still exist. '
      'Resetting now would reissue numbers that customers have already seen.',
      v_invoices, v_quotes, v_jobs, v_enquiries;
  end if;

  alter sequence enquiry_ref_seq restart with 1;
  alter sequence job_ref_seq     restart with 1;
  alter sequence quote_ref_seq   restart with 1;
  alter sequence invoice_ref_seq restart with 1;

  raise notice 'Numbering reset. The next records will be ENQ-0001, JOB-0001, QUO-0001 and INV-0001.';
end
$$;
