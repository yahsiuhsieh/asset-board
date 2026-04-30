alter table public.real_estate_properties
  add column if not exists rent_match_keyword text,
  add column if not exists rent_match_tolerance numeric(14, 2) not null default 50;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_rent_match_tolerance_nonnegative;

alter table public.real_estate_properties
  add constraint real_estate_properties_rent_match_tolerance_nonnegative
  check (rent_match_tolerance >= 0);
