do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'real_estate_bank_connections'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'real_estate_properties'
      and column_name = 'rent_bank_access_token'
  ) then
    insert into public.real_estate_bank_connections (
      asset_id,
      provider,
      access_token,
      account_id,
      account_name,
      status,
      connected_at,
      updated_at
    )
    select
      asset_id,
      'teller',
      rent_bank_access_token,
      rent_bank_account_id,
      coalesce(rent_bank_account_name, 'Connected bank account'),
      'active',
      coalesce(rent_bank_connected_at, now()),
      now()
    from public.real_estate_properties
    where rent_bank_provider = 'teller'
      and rent_bank_access_token is not null
      and rent_bank_account_id is not null
    on conflict (asset_id, provider, account_id) do update
    set
      access_token = excluded.access_token,
      account_name = excluded.account_name,
      status = excluded.status,
      connected_at = excluded.connected_at,
      updated_at = excluded.updated_at;
  end if;
end $$;

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_rent_bank_provider_check,
  drop constraint if exists real_estate_properties_monthly_rent_source_check,
  drop column if exists rent_bank_provider,
  drop column if exists rent_bank_access_token,
  drop column if exists rent_bank_account_id,
  drop column if exists rent_bank_account_name,
  drop column if exists rent_bank_connected_at,
  drop column if exists monthly_rent_source,
  drop column if exists monthly_rent_synced_at;
