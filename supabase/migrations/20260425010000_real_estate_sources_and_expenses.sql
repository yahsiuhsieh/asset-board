alter table public.real_estate_properties
  add column if not exists current_market_value_source text not null default 'manual'
    check (current_market_value_source in ('manual', 'chase')),
  add column if not exists current_market_value_synced_at timestamptz,
  add column if not exists monthly_rent_source text not null default 'manual'
    check (monthly_rent_source in ('manual', 'chase')),
  add column if not exists monthly_rent_synced_at timestamptz;

alter table public.real_estate_metric_snapshots
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'chase'));

create table if not exists public.real_estate_expense_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  name text not null,
  category text not null check (
    category in ('taxes', 'insurance', 'maintenance', 'hoa', 'utilities', 'other')
  ),
  amount numeric(14, 2) not null default 0,
  frequency text not null check (
    frequency in ('monthly', 'quarterly', 'semiannual', 'annual')
  ),
  paid_month integer check (paid_month between 1 and 12),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists real_estate_expense_items_asset_idx
  on public.real_estate_expense_items(asset_id, category, created_at);

insert into public.real_estate_expense_items (asset_id, name, category, amount, frequency, note)
select asset_id, 'Property taxes', 'taxes', annual_taxes, 'annual', 'Backfilled from annual_taxes'
from public.real_estate_properties
where annual_taxes > 0
  and not exists (
    select 1 from public.real_estate_expense_items expense
    where expense.asset_id = real_estate_properties.asset_id
      and expense.category = 'taxes'
      and expense.name = 'Property taxes'
  );

insert into public.real_estate_expense_items (asset_id, name, category, amount, frequency, note)
select asset_id, 'Insurance', 'insurance', annual_insurance, 'annual', 'Backfilled from annual_insurance'
from public.real_estate_properties
where annual_insurance > 0
  and not exists (
    select 1 from public.real_estate_expense_items expense
    where expense.asset_id = real_estate_properties.asset_id
      and expense.category = 'insurance'
      and expense.name = 'Insurance'
  );

insert into public.real_estate_expense_items (asset_id, name, category, amount, frequency, note)
select asset_id, 'Maintenance reserve', 'maintenance', annual_maintenance, 'annual', 'Backfilled from annual_maintenance'
from public.real_estate_properties
where annual_maintenance > 0
  and not exists (
    select 1 from public.real_estate_expense_items expense
    where expense.asset_id = real_estate_properties.asset_id
      and expense.category = 'maintenance'
      and expense.name = 'Maintenance reserve'
  );

insert into public.real_estate_expense_items (asset_id, name, category, amount, frequency, note)
select asset_id, 'Other annual expenses', 'other', annual_expenses, 'annual', 'Backfilled from annual_expenses'
from public.real_estate_properties
where annual_expenses > 0
  and not exists (
    select 1 from public.real_estate_expense_items expense
    where expense.asset_id = real_estate_properties.asset_id
      and expense.category = 'other'
      and expense.name = 'Other annual expenses'
  );
