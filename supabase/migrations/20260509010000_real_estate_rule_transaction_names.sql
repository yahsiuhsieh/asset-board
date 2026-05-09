alter table public.real_estate_transaction_rules
  add column if not exists set_transaction_name text
    check (
      set_transaction_name is null
      or length(btrim(set_transaction_name)) > 0
    );

alter table public.real_estate_property_transactions
  add column if not exists original_description text;

update public.real_estate_property_transactions
set original_description = description
where original_description is null;
