alter table public.real_estate_properties
  add column if not exists rent_bank_provider text,
  add column if not exists rent_bank_access_token text,
  add column if not exists rent_bank_account_id text,
  add column if not exists rent_bank_account_name text,
  add column if not exists rent_bank_connected_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'real_estate_properties_rent_bank_provider_check'
  ) then
    alter table public.real_estate_properties
      add constraint real_estate_properties_rent_bank_provider_check
      check (rent_bank_provider is null or rent_bank_provider in ('teller'));
  end if;
end $$;
