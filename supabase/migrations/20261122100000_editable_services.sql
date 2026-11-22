-- ---------------------------------------------------------------------------
-- Services become editable by the owner.
--
-- The website used to read its service list from code (src/lib/site.ts). It
-- now reads this table, so the owner can change names, descriptions, example
-- jobs, guide prices and photos, hide a service, or add a new one, from
-- Settings → Services. The code list stays as the fallback if the database is
-- unreachable.
--
-- Additive: new columns, and the eight existing rows brought in line with
-- what the site shows today (matched on slug, so job links are untouched).
-- ---------------------------------------------------------------------------

alter table services
  add column if not exists meta_description text,
  add column if not exists examples text[] not null default '{}',
  add column if not exists from_price text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists services_updated_at on services;
create trigger services_updated_at before update on services
  for each row execute function set_updated_at();

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('leaks-and-repairs', 'Leaks & repairs', 'Dripping taps, burst pipes, blocked drains and the emergencies that will not wait.', 'Most of what we do starts with something that has gone wrong. We carry the common parts on the van, so a large share of these are fixed on the first visit rather than booked back in for a second.', 'Leak and plumbing repairs in Nottingham. Burst pipes, dripping taps, running toilets and blocked drains fixed, often on the first visit.', array['Burst or leaking pipework', 'Taps that will not shut off', 'Toilets that keep running', 'Blocked sinks, baths and drains', 'Leaking radiators and valves', 'Water damage traced back to source']::text[], 'Wrench', '/images/plumber.webp', 10, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('gas-and-boilers', 'Gas & boilers', 'Gas Safe registered. Servicing, repairs, replacements and landlord certificates.', 'All gas work is carried out by Gas Safe registered engineers, and we are accredited installers for Worcester and Bosch. If your boiler has locked out, we will diagnose it before quoting to replace it — a new boiler is not always the answer.', 'Gas Safe registered boiler servicing, repairs and replacements in Nottingham, plus landlord gas safety certificates. Price agreed first.', array['Annual boiler servicing', 'Boiler fault-finding and repair', 'Full boiler replacement', 'CP12 landlord gas safety records', 'Gas cooker and hob installation', 'Gas leak detection']::text[], 'Flame', '/images/gas-fuel.webp', 20, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('heating', 'Heating', 'Radiators, underfloor heating, system flushing and controls that actually work.', 'Cold at the top, cold at the bottom, or one room that never warms up — each points at something different, and we will tell you which before doing any work. We balance and flush systems, replace radiators, and set controls so the heating runs when you are in.', 'Central heating in Nottingham: radiators fitted and swapped, underfloor heating, system flushing and heating controls. Free quote.', array['Power flushing and system cleaning', 'Radiator replacement and rebalancing', 'Thermostatic valve fitting', 'Underfloor heating installation', 'Smart thermostat setup', 'Cylinder and immersion repairs']::text[], 'Thermometer', '/images/heater.webp', 30, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('bathrooms-and-kitchens', 'Bathrooms & kitchens', 'Full fit-outs, from first fix pipework to the last bead of sealant.', 'We install complete bathrooms and kitchens including tiling, waste runs and making good afterwards. If you are working to your own designer''s drawings we will fit to them; if not, we will tell you plainly what will and will not fit the space you have.', 'Bathroom and kitchen fitting in Nottingham, from first fix pipework to the last bead of sealant. One team, price agreed before work starts.', array['Complete bathroom installation', 'Wet rooms and level-access showers', 'Kitchen plumbing and appliance fitting', 'Tiling and sealing', 'Soil and waste pipe alterations', 'Cloakroom and en-suite additions']::text[], 'Bathtub', '/images/plumbing.webp', 40, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('electrical', 'Electrical', 'Sockets, lighting, consumer units, fault-finding and EICR reports.', 'Electrical work runs alongside most of our bathroom and building jobs, so it rarely needs a separate trade booked in behind us. That keeps the job moving and stops two contractors blaming each other.', 'Electrical work in Nottingham: sockets, lighting, consumer units, fault-finding and EICR reports. Free quote, with the price agreed first.', array['Additional sockets and lighting circuits', 'Consumer unit upgrades', 'Intermittent fault tracing', 'EICR periodic inspection reports', 'Extractor fan installation', 'Outdoor and garden power']::text[], 'Lightning', '/images/electrician.webp', 50, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('building-repairs', 'Building repairs', 'Brickwork, plastering, damp, and making good after the pipe is fixed.', 'A leak that has been running for a week rarely stops at the pipe. We repair the brickwork, plaster and flooring around what we have opened up, so you are not left arranging a second trade to finish someone else''s hole.', 'Building repairs in Nottingham: brickwork, plastering, damp and making good after a leak. One team for the pipe and the wall around it.', array['Plastering and making good', 'Brickwork and pointing repairs', 'Damp investigation and treatment', 'Floor and joist repairs', 'Ceiling repairs after leaks', 'Rendering and external repairs']::text[], 'Wall', '/images/wall.webp', 60, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('maintenance-contracts', 'Property maintenance', 'Planned maintenance for landlords, letting agents and small commercial sites.', 'For landlords and agents with several properties we work to a schedule rather than a crisis. Every job, photograph and certificate stays on file against that address in your portal, so an accountant or a new tenant can be shown the history in a minute.', 'Planned property maintenance for landlords, letting agents and small commercial sites across Nottingham. Gas checks, servicing and records.', array['Annual gas safety checks across a portfolio', 'Scheduled boiler servicing', 'Void property inspections', 'Reactive repairs with agreed response times', 'Written condition reports', 'Commercial washroom maintenance']::text[], 'Buildings', '/images/house.webp', 70, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

insert into services (slug, name, blurb, description, meta_description, examples, icon, image_path, sort_order, is_active)
values ('extensions-and-conversions', 'Extensions & conversions', 'Single-storey extensions, loft and garage conversions, managed end to end.', 'Larger projects where we handle the trades, the sequencing and the site. You get one point of contact, a written schedule of works, and staged invoices tied to what has actually been completed rather than to a calendar.', 'Single-storey extensions, loft and garage conversions in Nottingham, managed end to end by one team. Free quote, price agreed first.', array['Single-storey rear extensions', 'Loft conversions', 'Garage conversions', 'Structural alterations', 'Full first and second fix', 'Project management and trade coordination']::text[], 'HouseLine', '/images/extension.webp', 80, true)
on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, description = excluded.description,
  meta_description = excluded.meta_description, examples = excluded.examples, icon = excluded.icon,
  image_path = excluded.image_path, sort_order = excluded.sort_order;

