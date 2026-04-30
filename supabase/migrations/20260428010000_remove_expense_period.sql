alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_expense_period_check;

alter table public.real_estate_property_transactions
  drop column if exists expense_period;
