alter table public.businesses
add column if not exists visible_modules text[] not null
default array['sales','orders','stock','production','reports']::text[];

alter table public.businesses
drop constraint if exists businesses_visible_modules_valid;

alter table public.businesses
add constraint businesses_visible_modules_valid check (
  visible_modules <@ array['sales','orders','stock','production','reports']::text[]
);
