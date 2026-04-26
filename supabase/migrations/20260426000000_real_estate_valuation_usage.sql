alter table public.real_estate_properties
  add column if not exists current_market_value_live_sync_count integer not null default 0,
  add column if not exists current_market_value_live_synced_at timestamptz;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_live_sync_count_nonnegative;

alter table public.real_estate_properties
  add constraint real_estate_properties_live_sync_count_nonnegative
  check (current_market_value_live_sync_count >= 0);
