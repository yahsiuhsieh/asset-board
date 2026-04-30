alter table public.real_estate_properties
  add column if not exists rent_collection_month date,
  add column if not exists rent_collected_amount numeric(14, 2) not null default 0,
  add column if not exists rent_collected_at date;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_rent_collected_amount_nonnegative;

alter table public.real_estate_properties
  add constraint real_estate_properties_rent_collected_amount_nonnegative
  check (rent_collected_amount >= 0);
