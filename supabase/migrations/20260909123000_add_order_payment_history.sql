create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  order_id uuid not null references public.external_orders(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','gcash','bank','online','other')),
  payment_reference text,
  payment_kind text not null default 'additional' check (payment_kind in ('downpayment','additional','final','imported')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists order_payments_location_date_idx on public.order_payments(location_id,payment_date desc);
create index if not exists order_payments_order_idx on public.order_payments(order_id,created_at);
alter table public.order_payments enable row level security;

create policy "shop members read order payments" on public.order_payments
for select to authenticated using (public.can_access_location(location_id) or public.is_platform_admin());
create policy "shop members add order payments" on public.order_payments
for insert to authenticated with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists(select 1 from public.external_orders o where o.id=order_id and o.business_id=business_id and o.location_id=location_id)
);

insert into public.order_payments(business_id,location_id,order_id,payment_date,amount,payment_method,payment_reference,payment_kind,created_by,created_at)
select o.business_id,o.location_id,o.id,o.order_date,o.amount_paid,
  case lower(coalesce(o.payment_channel,'')) when 'cash' then 'cash' when 'gcash' then 'gcash' when 'bank transfer' then 'bank' when 'facebook / online' then 'online' else 'other' end,
  o.payment_reference,'imported',o.created_by,o.created_at
from public.external_orders o
where o.amount_paid > 0 and not exists(select 1 from public.order_payments p where p.order_id=o.id);

grant select,insert on public.order_payments to authenticated;
