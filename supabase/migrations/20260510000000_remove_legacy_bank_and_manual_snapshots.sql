delete from public.real_estate_metric_snapshots
where source = 'manual';

delete from public.real_estate_property_transactions
where provider = 'legacy_bank';

alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_provider_check;

alter table public.real_estate_property_transactions
  alter column provider set default 'plaid',
  add constraint real_estate_property_transactions_provider_check
    check (provider in ('mock', 'plaid'));
