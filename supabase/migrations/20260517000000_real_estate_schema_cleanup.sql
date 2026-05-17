alter table public.real_estate_properties
  add column if not exists cover_photo_storage_path text;

do $$
declare
  duplicate_asset_count integer;
  missing_ledger_count integer;
  multi_photo_asset_count integer;
begin
  select count(*)
  into duplicate_asset_count
  from (
    select asset_id
    from public.real_estate_properties
    group by asset_id
    having count(*) > 1
  ) duplicate_assets;

  if duplicate_asset_count > 0 then
    raise exception 'Cannot promote real_estate_properties.asset_id to primary key: duplicate asset_id rows exist.';
  end if;

  select count(*)
  into missing_ledger_count
  from public.real_estate_properties property
  where property.rent_collection_month is not null
    and not exists (
      select 1
      from public.real_estate_property_transactions transaction
      where transaction.asset_id = property.asset_id
        and transaction.classification = 'rental_income'
        and transaction.rent_period_month = date_trunc('month', property.rent_collection_month)::date
    );

  if missing_ledger_count > 0 then
    raise exception 'Cannot drop legacy rent collection columns: one or more rows are not represented by rental_income ledger transactions.';
  end if;

  if to_regclass('public.real_estate_photos') is not null then
    select count(*)
    into multi_photo_asset_count
    from (
      select asset_id
      from public.real_estate_photos
      group by asset_id
      having count(*) > 1
    ) multi_photo_assets;

    if multi_photo_asset_count > 0 then
      raise exception 'Cannot collapse real_estate_photos: one or more properties have multiple photos.';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.real_estate_photos') is not null then
    update public.real_estate_properties property
    set
      cover_photo_storage_path = photo.storage_path,
      updated_at = now()
    from (
      select distinct on (asset_id)
        asset_id,
        storage_path
      from public.real_estate_photos
      order by asset_id, is_cover desc, sort_order, created_at
    ) photo
    where photo.asset_id = property.asset_id
      and property.cover_photo_storage_path is distinct from photo.storage_path;
  end if;
end $$;

drop table if exists public.real_estate_photos;

alter table public.real_estate_monthly_reviews
  drop column if exists rent_status,
  drop column if exists expense_status;

alter table public.real_estate_properties
  drop column if exists rent_collection_month,
  drop column if exists rent_collected_amount,
  drop column if exists rent_collected_at,
  drop column if exists current_market_value_live_synced_at;

do $$
declare
  primary_key_name text;
begin
  select constraint_name
  into primary_key_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'real_estate_properties'
    and constraint_type = 'PRIMARY KEY';

  if primary_key_name is not null then
    execute format('alter table public.real_estate_properties drop constraint %I', primary_key_name);
  end if;
end $$;

alter table public.real_estate_properties
  drop column if exists id,
  add primary key (asset_id);

alter table public.real_estate_bank_connections
  alter column provider_item_id set not null;
