alter table public.real_estate_properties
  add column if not exists rental_status text not null default 'rented';

alter table public.real_estate_properties
  drop constraint if exists real_estate_properties_rental_status_check;

alter table public.real_estate_properties
  add constraint real_estate_properties_rental_status_check
    check (rental_status in ('rented', 'vacant'));
