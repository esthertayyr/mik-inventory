alter table public.external_orders
  add column if not exists is_past_order boolean not null default false;

comment on column public.external_orders.is_past_order is
  'True when an older order is entered later for historical tracking.';
