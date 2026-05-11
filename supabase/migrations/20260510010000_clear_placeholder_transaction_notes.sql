update public.real_estate_property_transactions
set note = null
where note is not null
  and btrim(note) = '';

update public.real_estate_property_transactions
set note = null
where note is not null
  and (
    btrim(note) in (
      'Auto matched by target rent amount.',
      'Auto matched by target rent amount',
      'Marked as ignored.',
      'Marked as ignored',
      'Marked as expense.',
      'Marked as expense',
      'Marked as not rental income.',
      'Marked as not rental income',
      'Marked as rental income.',
      'Marked as rental income',
      'Needs expense review.',
      'Needs expense review',
      'Needs rent review.',
      'Needs rent review'
    )
    or btrim(note) like 'Classified by rule:%'
  );
