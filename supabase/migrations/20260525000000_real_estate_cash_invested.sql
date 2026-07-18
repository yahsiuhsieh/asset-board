alter table public.real_estate_properties
  add column if not exists cash_invested numeric(14, 2) not null default 0;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_cash_invested_nonnegative;

alter table public.real_estate_properties
  add constraint real_estate_properties_cash_invested_nonnegative
  check (cash_invested >= 0);
