alter table public.real_estate_properties
  add column if not exists current_market_value_source text not null default 'zillow',
  add column if not exists current_market_value_synced_at timestamptz;

alter table public.real_estate_properties
  alter column current_market_value_source set default 'zillow';

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_current_market_value_source_check;

update public.real_estate_properties
set current_market_value_source = 'zillow'
where current_market_value_source is distinct from 'zillow';

alter table public.real_estate_properties
  add constraint real_estate_properties_current_market_value_source_check
  check (current_market_value_source = 'zillow');

alter table public.real_estate_properties
  drop column if exists manual_current_market_value,
  drop column if exists synced_current_market_value,
  drop column if exists synced_current_market_value_source,
  drop column if exists current_market_value_override;
