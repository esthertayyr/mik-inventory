create table if not exists public.reseller_preorders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_product_id uuid references public.source_products(id) on delete set null,
  customer_name text not null check (char_length(trim(customer_name)) > 0),
  customer_contact text,
  delivery_address text,
  product_name text not null check (char_length(trim(product_name)) > 0),
  selected_options text,
  quantity integer not null default 1 check (quantity > 0),
  total_price_php numeric(12,2) not null check (total_price_php > 0),
  deposit_required_php numeric(12,2) not null check (deposit_required_php >= 0),
  delivery_fee_php numeric(12,2) not null default 0 check (delivery_fee_php >= 0),
  delivery_fee_confirmed boolean not null default false,
  fulfilment_status text not null default 'awaiting_deposit' check (fulfilment_status in ('awaiting_deposit','confirmed','ordered','in_transit','arrived','ready_to_ship','shipped','delivered','cancelled')),
  supplier_ordered_at date,
  arrived_at date,
  shipped_at date,
  delivered_at date,
  courier text,
  tracking_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_preorder_payments (
  id uuid primary key default gen_random_uuid(),
  preorder_id uuid not null references public.reseller_preorders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  payment_type text not null check (payment_type in ('deposit','final','delivery')),
  amount_php numeric(12,2) not null check (amount_php > 0),
  payment_method text not null check (payment_method in ('cash','gcash','bank','other')),
  payment_date date not null default current_date,
  reference text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists reseller_preorders_business_idx on public.reseller_preorders(business_id, created_at desc);
create index if not exists reseller_preorder_payments_order_idx on public.reseller_preorder_payments(preorder_id, payment_date);
alter table public.reseller_preorders enable row level security;
alter table public.reseller_preorder_payments enable row level security;
grant select, insert, update, delete on public.reseller_preorders to authenticated;
grant select, insert, update, delete on public.reseller_preorder_payments to authenticated;

create policy "members manage reseller preorders" on public.reseller_preorders for all to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (public.is_business_member(business_id) or public.is_platform_admin());

create policy "members manage reseller preorder payments" on public.reseller_preorder_payments for all to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (public.is_business_member(business_id) or public.is_platform_admin());
