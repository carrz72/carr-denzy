-- ===========================================================================
-- Carrdenzy — portfolio categories
--
-- The owner groups "Our work" photos (Bathrooms, Boilers, Building work…) and
-- the public /work page shows them under those headings with a jump-to bar.
--
-- Additive only: a new table and a nullable column. Existing rows land in
-- "Other work" on the site until the owner gives them a category.
-- ===========================================================================

create table if not exists portfolio_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists portfolio_categories_name_key
  on portfolio_categories (lower(btrim(name)));

alter table portfolio_items
  add column if not exists category_id uuid
    references portfolio_categories (id) on delete set null;

create index if not exists portfolio_items_category_idx
  on portfolio_items (category_id);

alter table portfolio_categories enable row level security;

-- Category names are public copy, read by the anonymous marketing pages.
drop policy if exists "anyone reads portfolio categories" on portfolio_categories;
create policy "anyone reads portfolio categories"
  on portfolio_categories for select to anon, authenticated
  using (true);

drop policy if exists "owner writes portfolio categories" on portfolio_categories;
create policy "owner writes portfolio categories"
  on portfolio_categories for all to authenticated
  using (is_owner())
  with check (is_owner());
