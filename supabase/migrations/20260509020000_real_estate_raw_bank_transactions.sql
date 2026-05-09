create table if not exists public.real_estate_raw_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'plaid'
    check (provider in ('plaid')),
  provider_item_id text not null check (length(btrim(provider_item_id)) > 0),
  provider_account_id text not null check (length(btrim(provider_account_id)) > 0),
  provider_transaction_id text not null check (length(btrim(provider_transaction_id)) > 0),
  bank_connection_id uuid references public.real_estate_bank_connections(id) on delete set null,
  account_name text not null,
  posted_at date not null,
  title text not null,
  description text not null,
  memo text,
  amount numeric(14, 2) not null check (amount >= 0),
  direction text not null
    check (direction in ('credit', 'debit')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists real_estate_raw_bank_transactions_provider_unique
  on public.real_estate_raw_bank_transactions(
    provider,
    provider_item_id,
    provider_account_id,
    provider_transaction_id
  );

create index if not exists real_estate_raw_bank_transactions_account_date_idx
  on public.real_estate_raw_bank_transactions(
    provider,
    provider_item_id,
    provider_account_id,
    posted_at desc
  );

alter table public.real_estate_bank_connections
  add column if not exists raw_transactions_synced_start_date date,
  add column if not exists raw_transactions_synced_end_date date;

alter table public.real_estate_property_transactions
  add column if not exists raw_bank_transaction_id uuid
    references public.real_estate_raw_bank_transactions(id) on delete set null;

insert into public.real_estate_raw_bank_transactions (
  provider,
  provider_item_id,
  provider_account_id,
  provider_transaction_id,
  bank_connection_id,
  account_name,
  posted_at,
  title,
  description,
  memo,
  amount,
  direction,
  synced_at,
  updated_at
)
select distinct on (
  property_transaction.provider,
  connection.provider_item_id,
  property_transaction.account_id,
  property_transaction.provider_transaction_id
)
  property_transaction.provider,
  connection.provider_item_id,
  property_transaction.account_id,
  property_transaction.provider_transaction_id,
  property_transaction.bank_connection_id,
  property_transaction.account_name,
  property_transaction.posted_at,
  property_transaction.description,
  coalesce(property_transaction.original_description, property_transaction.description),
  property_transaction.memo,
  property_transaction.amount,
  property_transaction.direction,
  coalesce(property_transaction.updated_at, now()),
  now()
from public.real_estate_property_transactions property_transaction
join public.real_estate_bank_connections connection
  on connection.id = property_transaction.bank_connection_id
where property_transaction.provider = 'plaid'
  and connection.provider_item_id is not null
  and property_transaction.raw_bank_transaction_id is null
order by
  property_transaction.provider,
  connection.provider_item_id,
  property_transaction.account_id,
  property_transaction.provider_transaction_id,
  property_transaction.updated_at desc
on conflict (
  provider,
  provider_item_id,
  provider_account_id,
  provider_transaction_id
) do update
set
  bank_connection_id = excluded.bank_connection_id,
  account_name = excluded.account_name,
  posted_at = excluded.posted_at,
  title = excluded.title,
  description = excluded.description,
  memo = excluded.memo,
  amount = excluded.amount,
  direction = excluded.direction,
  synced_at = excluded.synced_at,
  updated_at = now();

with raw_transaction_candidates as (
  select
    property_transaction.id as transaction_id,
    raw_transaction.id as raw_bank_transaction_id,
    row_number() over (
      partition by raw_transaction.id
      order by property_transaction.updated_at desc, property_transaction.created_at desc
    ) as row_number
  from public.real_estate_property_transactions property_transaction
  join public.real_estate_bank_connections connection
    on connection.id = property_transaction.bank_connection_id
  join public.real_estate_raw_bank_transactions raw_transaction
    on raw_transaction.provider = 'plaid'
    and raw_transaction.provider_item_id = connection.provider_item_id
    and raw_transaction.provider_account_id = connection.account_id
    and raw_transaction.provider_transaction_id = property_transaction.provider_transaction_id
  where property_transaction.provider = 'plaid'
    and property_transaction.raw_bank_transaction_id is null
)
update public.real_estate_property_transactions property_transaction
set raw_bank_transaction_id = raw_transaction_candidates.raw_bank_transaction_id
from raw_transaction_candidates
where property_transaction.id = raw_transaction_candidates.transaction_id
  and raw_transaction_candidates.row_number = 1;

create unique index if not exists real_estate_property_transactions_raw_bank_unique
  on public.real_estate_property_transactions(raw_bank_transaction_id);

create index if not exists real_estate_property_transactions_raw_bank_idx
  on public.real_estate_property_transactions(raw_bank_transaction_id)
  where raw_bank_transaction_id is not null;
