create table if not exists public.real_estate_transaction_rules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  contains_text text not null check (length(btrim(contains_text)) > 0),
  target_amount numeric(14, 2) not null check (target_amount >= 0),
  category text not null
    check (category in ('taxes', 'insurance', 'maintenance', 'hoa', 'utilities', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists real_estate_transaction_rules_active_idx
  on public.real_estate_transaction_rules(is_active, created_at);

create index if not exists real_estate_transaction_rules_asset_idx
  on public.real_estate_transaction_rules(asset_id);
