alter table public.real_estate_properties
  add column if not exists current_market_value_source text not null default 'mock',
  add column if not exists current_market_value_synced_at timestamptz;

alter table public.real_estate_properties
  alter column current_market_value_source set default 'mock';

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_current_market_value_source_check;

update public.real_estate_properties
set current_market_value_source = 'mock'
where current_market_value_source not in ('mock', 'provider');

alter table public.real_estate_properties
  add constraint real_estate_properties_current_market_value_source_check
  check (current_market_value_source in ('mock', 'provider'));

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_monthly_rent_source_check;

update public.real_estate_properties
set monthly_rent_source = 'manual'
where monthly_rent_source not in ('manual', 'chase');

alter table public.real_estate_properties
  add constraint real_estate_properties_monthly_rent_source_check
  check (monthly_rent_source in ('manual', 'chase'));

alter table public.real_estate_metric_snapshots
  add column if not exists source text not null default 'manual';

alter table public.real_estate_metric_snapshots
  drop constraint if exists real_estate_metric_snapshots_source_check;

update public.real_estate_metric_snapshots
set source = 'manual'
where source not in ('manual', 'chase', 'mock', 'provider');

alter table public.real_estate_metric_snapshots
  add constraint real_estate_metric_snapshots_source_check
  check (source in ('manual', 'chase', 'mock', 'provider'));

alter table public.real_estate_properties
  drop column if exists manual_current_market_value,
  drop column if exists synced_current_market_value,
  drop column if exists synced_current_market_value_source,
  drop column if exists current_market_value_override;
