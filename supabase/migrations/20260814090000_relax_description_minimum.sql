-- ===========================================================================
-- Let people describe the problem in their own words, however few.
--
-- The original constraint demanded 10 characters. In practice that rejected
-- "Leak" — which, alongside a photograph and a phone number, is a perfectly
-- actionable job request. The form is there to catch enquiries, not to grade
-- them, and anything genuinely unclear is a phone call away.
--
-- Three characters still blocks an empty box or a stray keypress, which is all
-- the constraint was ever really protecting against.
--
-- Must stay in step with:
--   * `validateStepOne` in src/components/request/request-form.tsx
--   * `enquirySchema` in src/lib/validation.ts
-- A database stricter than the form means an enquiry that passes validation
-- and then disappears on insert, with the customer told it was received.
-- ===========================================================================

alter table enquiries
  drop constraint if exists enquiry_description_min_length;

alter table enquiries
  add constraint enquiry_description_min_length
  check (char_length(trim(description)) >= 3);

-- The RLS policy that lets an anonymous visitor submit also carried the old
-- length test, so it has to move too — otherwise the insert is refused by the
-- policy rather than the constraint, which surfaces as a permissions error
-- instead of anything a customer could act on.
drop policy if exists "anyone submits an enquiry" on enquiries;

create policy "anyone submits an enquiry"
  on enquiries for insert to anon, authenticated
  with check (
    status = 'new'
    and job_id is null
    and client_id is null
    and char_length(trim(description)) >= 3
    and (email is not null or phone is not null)
  );
