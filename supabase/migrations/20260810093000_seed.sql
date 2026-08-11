-- ===========================================================================
-- Carr Denzy — seed data
--
-- Safe to re-run: every insert is idempotent.
-- Business details are placeholders where the real value is not known; they
-- are all editable from Settings in the app, which is where the owner should
-- change them rather than editing SQL.
-- ===========================================================================

insert into settings (
  id, trading_name, legal_name,
  address_line1, city, postcode, phone, email,
  vat_registered, cis_enabled,
  bank_account_name, bank_sort_code, bank_account_number,
  payment_terms_days, quote_valid_days,
  invoice_footer_note
) values (
  true,
  'Carr Denzy Plumbing & Gas',
  'Carr Denzy Plumbing & Gas Ltd',
  '123 Main Street',
  'London',
  'SE1 2AB',
  '01234 567890',
  'carrdenzy@gmail.com',
  false,   -- not VAT-registered: invoices carry no VAT lines at all
  false,   -- no CIS work
  'Carr Denzy Plumbing & Gas',
  '00-00-00',
  '00000000',
  14,
  30,
  'Thank you for your custom. Please use the invoice number as your payment reference.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

insert into services (slug, name, blurb, description, icon, image_path, sort_order) values

('leaks-and-repairs',
 'Leaks & repairs',
 'Dripping taps, burst pipes, blocked drains and the emergencies that will not wait.',
 'Most of what we do starts with something that has gone wrong. Leaking pipework, a tap that will not shut off, a toilet that keeps running, a drain backing up. We carry the common parts on the van, so a large share of these are fixed on the first visit rather than booked back in.',
 'Wrench', '/images/plumber.png', 10),

('gas-and-boilers',
 'Gas & boilers',
 'Gas Safe registered. Boiler servicing, repairs, replacements and landlord certificates.',
 'Gas work is done by Gas Safe registered engineers, and we are accredited installers for Worcester and Bosch. That covers annual servicing, fault-finding on a boiler that has locked out, full replacements, and CP12 landlord gas safety records.',
 'Flame', '/images/gas-fuel.png', 20),

('heating',
 'Heating',
 'Radiators, underfloor heating, system flushing and controls that actually work.',
 'Cold radiators at the top, cold at the bottom, or one room that never warms up — each points at something different. We balance and power-flush systems, replace radiators and valves, fit underfloor heating, and set up controls so the heating runs when you are in rather than when you are out.',
 'Thermometer', '/images/heater.png', 30),

('bathrooms-and-kitchens',
 'Bathrooms & kitchens',
 'Full fit-outs, from first fix pipework to the last bead of sealant.',
 'We install complete bathrooms and kitchens, including the tiling, the waste runs and the making good afterwards. If you are working with your own designer we will fit to their drawings; if not, we will tell you plainly what will and will not fit in the space you have.',
 'Bathtub', '/images/plumbing.png', 40),

('electrical',
 'Electrical',
 'Sockets, lighting, consumer units, fault-finding and EICR reports.',
 'Electrical work runs alongside most of our building and bathroom jobs, so it rarely needs a separate trade. Additional sockets and lighting circuits, consumer unit upgrades, tracing an intermittent fault, and periodic inspection reports for landlords.',
 'Lightning', '/images/electrician.png', 50),

('building-repairs',
 'Building repairs',
 'Brickwork, plastering, damp, and making good after the pipe is fixed.',
 'A leak that has been running for a week rarely stops at the pipe. We repair the brickwork, plaster and floors around what we have opened up, so you are not left arranging a second trade to finish someone else''s hole.',
 'Wall', '/images/wall.png', 60),

('maintenance-contracts',
 'Property maintenance',
 'Planned maintenance for landlords, letting agents and small commercial sites.',
 'For landlords and agents with several properties we work to a schedule rather than a crisis: annual gas checks, boiler services, and a written record per address. Every job, photograph and certificate stays on file against that property in your portal.',
 'Buildings', '/images/house.png', 70),

('extensions-and-conversions',
 'Extensions & conversions',
 'Single-storey extensions, loft and garage conversions, managed end to end.',
 'Larger projects where we handle the trades, the sequencing and the site. You get one point of contact, a written schedule of works, and staged invoices tied to what has actually been completed rather than to a calendar.',
 'HouseLine', '/images/extension.png', 80)

on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- price list starters — the owner edits these in Settings; they exist so the
-- quote builder is not empty on day one.
-- ---------------------------------------------------------------------------

insert into price_items (description, unit_price_pence, kind, unit) values
  ('Standard call-out and first hour',        8500,  'labour',    'visit'),
  ('Labour, per hour thereafter',             5500,  'labour',    'hour'),
  ('Emergency call-out (evening or weekend)', 14000, 'labour',    'visit'),
  ('Annual boiler service',                   9000,  'labour',    'each'),
  ('Landlord gas safety record (CP12)',       8000,  'labour',    'each'),
  ('Power flush, up to 10 radiators',         48000, 'labour',    'each'),
  ('Replace radiator valve set',              4200,  'materials', 'pair'),
  ('Replace basin mixer tap',                 6500,  'materials', 'each'),
  ('Toilet fill and flush valve kit',         3800,  'materials', 'each'),
  ('Copper pipe, 15mm, per metre',             950,  'materials', 'metre')
on conflict do nothing;
