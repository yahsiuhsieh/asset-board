alter table public.real_estate_properties
  alter column current_market_value_source set default 'manual';

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_current_market_value_source_check;

alter table public.real_estate_properties
  add constraint real_estate_properties_current_market_value_source_check
  check (current_market_value_source in ('manual', 'mock', 'provider'));
