alter table public.businesses
add column if not exists business_type text not null default 'shop';

alter table public.businesses
drop constraint if exists businesses_business_type_valid;

alter table public.businesses
add constraint businesses_business_type_valid
check (business_type in ('shop','reseller'));

update public.businesses
set business_type = 'reseller',
    visible_modules = array['sourcing']::text[]
where lower(name) = 'astera' or lower(login_username) = 'astera';
