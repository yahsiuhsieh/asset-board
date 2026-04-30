alter table public.real_estate_property_transactions
  add column if not exists expense_period text;

update public.real_estate_property_transactions
set expense_period = 'monthly'
where classification = 'expense'
  and expense_period is null;

update public.real_estate_property_transactions
set expense_period = null
where classification <> 'expense';

alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_expense_period_check;

alter table public.real_estate_property_transactions
  add constraint real_estate_property_transactions_expense_period_check
    check (
      (classification = 'expense' and expense_period in ('monthly', 'yearly'))
      or
      (classification <> 'expense' and expense_period is null)
    );

delete from public.real_estate_metric_snapshots
where metric_type in (
  'annual_taxes',
  'annual_insurance',
  'annual_maintenance',
  'annual_expenses'
);

alter table public.real_estate_metric_snapshots
  drop constraint if exists real_estate_metric_snapshots_metric_type_check;

alter table public.real_estate_metric_snapshots
  add constraint real_estate_metric_snapshots_metric_type_check
    check (
      metric_type in (
        'current_market_value',
        'monthly_rent',
        'remaining_mortgage_balance',
        'monthly_mortgage'
      )
    );

drop table if exists public.real_estate_expense_items;

alter table public.real_estate_properties
  drop column if exists annual_expenses,
  drop column if exists annual_taxes,
  drop column if exists annual_insurance,
  drop column if exists annual_maintenance;
