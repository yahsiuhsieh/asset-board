create extension if not exists pgcrypto;

alter table public.real_estate_property_transactions
  add column if not exists rent_period_month date;

alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_rent_period_month_check;

alter table public.real_estate_property_transactions
  add constraint real_estate_property_transactions_rent_period_month_check
    check (
      rent_period_month is null
      or (
        direction = 'credit'
        and date_trunc('month', rent_period_month)::date = rent_period_month
      )
    );

create index if not exists real_estate_property_transactions_rent_period_idx
  on public.real_estate_property_transactions(asset_id, rent_period_month)
  where rent_period_month is not null;

create table if not exists public.real_estate_monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  review_month date not null,
  rent_status text not null default 'needs_review'
    check (rent_status in ('ready', 'needs_review')),
  expense_status text not null default 'needs_review'
    check (expense_status in ('ready', 'needs_review')),
  closed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint real_estate_monthly_reviews_review_month_check
    check (date_trunc('month', review_month)::date = review_month)
);

create unique index if not exists real_estate_monthly_reviews_asset_month_idx
  on public.real_estate_monthly_reviews(asset_id, review_month);

create index if not exists real_estate_monthly_reviews_asset_closed_idx
  on public.real_estate_monthly_reviews(asset_id, closed_at);
