alter table public.real_estate_properties
  drop column if exists rent_match_keyword;

alter table public.real_estate_property_transactions
  drop constraint if exists real_estate_property_transactions_classification_check,
  drop constraint if exists real_estate_property_transactions_expense_category_required,
  drop constraint if exists real_estate_property_transactions_ignored_category_empty;

alter table public.real_estate_property_transactions
  add constraint real_estate_property_transactions_classification_check
    check (classification in ('expense', 'rental_income', 'ignored')),
  add constraint real_estate_property_transactions_expense_category_required
    check (classification <> 'expense' or category is not null),
  add constraint real_estate_property_transactions_non_expense_category_empty
    check (classification = 'expense' or category is null);
