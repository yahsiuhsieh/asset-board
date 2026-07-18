with claimed_raw_transactions as (
  select distinct on (raw_bank_transaction_id)
    raw_bank_transaction_id,
    nullif(btrim(description), '') as claimed_description
  from public.real_estate_property_transactions
  where raw_bank_transaction_id is not null
    and classification in ('rental_income', 'expense')
  order by raw_bank_transaction_id, updated_at desc, created_at desc
),
pending_duplicate_transactions as (
  select
    pending_transaction.id,
    claimed_raw_transaction.claimed_description
  from public.real_estate_property_transactions pending_transaction
  join claimed_raw_transactions claimed_raw_transaction
    on claimed_raw_transaction.raw_bank_transaction_id =
      pending_transaction.raw_bank_transaction_id
  where pending_transaction.classification is null
)
update public.real_estate_property_transactions property_transaction
set
  classification = 'ignored',
  category = null,
  note = null,
  description = coalesce(
    pending_duplicate_transaction.claimed_description,
    property_transaction.description
  ),
  updated_at = now()
from pending_duplicate_transactions pending_duplicate_transaction
where property_transaction.id = pending_duplicate_transaction.id;
