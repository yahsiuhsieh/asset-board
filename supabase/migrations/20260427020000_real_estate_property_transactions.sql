create extension if not exists pgcrypto;

create table if not exists public.real_estate_property_transactions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  bank_connection_id uuid references public.real_estate_bank_connections(id) on delete set null,
  provider text not null default 'teller'
    check (provider in ('mock', 'teller')),
  provider_transaction_id text not null,
  account_id text not null,
  account_name text not null,
  posted_at date not null,
  description text not null,
  memo text,
  amount numeric(14, 2) not null check (amount >= 0),
  direction text not null
    check (direction in ('credit', 'debit')),
  classification text not null
    check (classification in ('expense', 'ignored')),
  category text
    check (category in ('taxes', 'insurance', 'maintenance', 'hoa', 'utilities', 'other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint real_estate_property_transactions_expense_category_required
    check (classification <> 'expense' or category is not null),
  constraint real_estate_property_transactions_ignored_category_empty
    check (classification <> 'ignored' or category is null)
);

create unique index if not exists real_estate_property_transactions_provider_unique
  on public.real_estate_property_transactions(
    asset_id,
    provider,
    account_id,
    provider_transaction_id
  );

create index if not exists real_estate_property_transactions_asset_month_idx
  on public.real_estate_property_transactions(asset_id, posted_at, classification);

create index if not exists real_estate_property_transactions_connection_idx
  on public.real_estate_property_transactions(bank_connection_id);
