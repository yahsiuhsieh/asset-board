create extension if not exists pgcrypto;

alter table public.real_estate_properties
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists map_zoom integer not null default 12;

create table if not exists public.real_estate_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists real_estate_photos_one_cover_per_asset
  on public.real_estate_photos(asset_id)
  where is_cover;

create index if not exists real_estate_photos_asset_order_idx
  on public.real_estate_photos(asset_id, sort_order, created_at);

create table if not exists public.real_estate_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  metric_type text not null check (
    metric_type in (
      'current_market_value',
      'monthly_rent',
      'remaining_mortgage_balance',
      'monthly_mortgage',
      'annual_taxes',
      'annual_insurance',
      'annual_maintenance',
      'annual_expenses'
    )
  ),
  value numeric(14, 2) not null,
  recorded_at date not null,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists real_estate_metric_snapshots_unique_day
  on public.real_estate_metric_snapshots(asset_id, metric_type, recorded_at);

create index if not exists real_estate_metric_snapshots_asset_metric_idx
  on public.real_estate_metric_snapshots(asset_id, metric_type, recorded_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos',
  'property-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.real_estate_metric_snapshots (asset_id, metric_type, value, recorded_at, note)
select asset_id, 'current_market_value', current_market_value, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'monthly_rent', monthly_rent, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'remaining_mortgage_balance', remaining_mortgage_balance, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'monthly_mortgage', monthly_mortgage, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'annual_taxes', annual_taxes, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'annual_insurance', annual_insurance, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'annual_maintenance', annual_maintenance, current_date, 'Initial snapshot'
from public.real_estate_properties
union all
select asset_id, 'annual_expenses', annual_expenses, current_date, 'Initial snapshot'
from public.real_estate_properties
on conflict (asset_id, metric_type, recorded_at) do nothing;
