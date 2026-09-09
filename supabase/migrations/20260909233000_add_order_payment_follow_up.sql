alter table public.external_orders
  add column if not exists payment_followed_up_at timestamptz,
  add column if not exists payment_followed_up_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_followed_up_by_name text;

comment on column public.external_orders.payment_followed_up_at is
  'Most recent time a shop user confirmed that an unpaid customer was contacted.';

