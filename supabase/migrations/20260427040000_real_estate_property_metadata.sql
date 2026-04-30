alter table public.real_estate_properties
  add column if not exists county text,
  add column if not exists purchased_at date,
  add column if not exists parcel_number text,
  add column if not exists building_cost numeric(14, 2) not null default 0,
  add column if not exists land_cost numeric(14, 2) not null default 0,
  add column if not exists total_depreciation numeric(14, 2) not null default 0;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_building_cost_nonnegative,
  drop constraint if exists real_estate_properties_land_cost_nonnegative,
  drop constraint if exists real_estate_properties_total_depreciation_nonnegative;

alter table public.real_estate_properties
  add constraint real_estate_properties_building_cost_nonnegative
    check (building_cost >= 0),
  add constraint real_estate_properties_land_cost_nonnegative
    check (land_cost >= 0),
  add constraint real_estate_properties_total_depreciation_nonnegative
    check (total_depreciation >= 0);
