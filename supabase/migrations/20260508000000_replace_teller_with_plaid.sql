alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_provider_check;

update public.real_estate_property_transactions
set
  provider = 'legacy_bank',
  bank_connection_id = null,
  updated_at = now()
where provider = 'teller';

alter table public.real_estate_property_transactions
  alter column provider set default 'plaid',
  add constraint real_estate_property_transactions_provider_check
    check (provider in ('mock', 'plaid', 'legacy_bank'));

alter table public.real_estate_bank_connections
  drop constraint if exists real_estate_bank_connections_provider_check;

delete from public.real_estate_bank_connections
where provider = 'teller';

alter table public.real_estate_bank_connections
  add column if not exists provider_item_id text,
  alter column provider set default 'plaid',
  drop column if exists enrollment_id,
  add constraint real_estate_bank_connections_provider_check
    check (provider in ('plaid'));
