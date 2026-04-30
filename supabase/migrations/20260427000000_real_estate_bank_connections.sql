create table if not exists public.real_estate_bank_connections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  provider text not null check (provider in ('teller')),
  access_token text not null,
  enrollment_id text,
  account_id text not null,
  account_name text not null,
  account_type text,
  account_subtype text,
  institution_name text,
  institution_id text,
  last_four text,
  status text not null default 'active' check (status in ('active', 'disconnected')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists real_estate_bank_connections_unique_account
  on public.real_estate_bank_connections(asset_id, provider, account_id);

create index if not exists real_estate_bank_connections_asset_status_idx
  on public.real_estate_bank_connections(asset_id, status);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'real_estate_properties'
      and column_name = 'rent_bank_access_token'
  ) then
    insert into public.real_estate_bank_connections (
      asset_id,
      provider,
      access_token,
      account_id,
      account_name,
      status,
      connected_at,
      updated_at
    )
    select
      asset_id,
      'teller',
      rent_bank_access_token,
      rent_bank_account_id,
      coalesce(rent_bank_account_name, 'Connected bank account'),
      'active',
      coalesce(rent_bank_connected_at, now()),
      now()
    from public.real_estate_properties
    where rent_bank_provider = 'teller'
      and rent_bank_access_token is not null
      and rent_bank_account_id is not null
    on conflict (asset_id, provider, account_id) do update
    set
      access_token = excluded.access_token,
      account_name = excluded.account_name,
      status = excluded.status,
      connected_at = excluded.connected_at,
      updated_at = excluded.updated_at;
  end if;
end $$;
