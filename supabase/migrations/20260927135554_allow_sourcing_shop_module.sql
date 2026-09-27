alter table public.businesses
drop constraint if exists businesses_visible_modules_valid;

alter table public.businesses
add constraint businesses_visible_modules_valid check (
  visible_modules <@ array['sales','orders','stock','production','reports','sourcing']::text[]
);
