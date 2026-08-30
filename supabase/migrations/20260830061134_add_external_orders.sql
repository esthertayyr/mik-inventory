-- External/custom orders are a separate production tracker. They do not create
-- cashier sales or inventory movements, preventing double-counting when the
-- customer has already paid through an outside channel.
create table if not exists public.order_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table if not exists public.external_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  order_number bigint generated always as identity unique,
  title text not null check (char_length(trim(title)) between 1 and 120),
  image_url text,
  customer_name text,
  customer_contact text,
  source text not null default 'Other',
  quantity integer not null default 1 check (quantity > 0),
  order_date date not null default current_date,
  target_date date,
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0 and amount_paid <= total_price),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  payment_channel text,
  payment_reference text,
  notes text,
  status text not null default 'new' check (status in ('new','making','ready','completed','cancelled')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  check (target_date is null or target_date >= order_date)
);

create table if not exists public.external_order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.external_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists external_orders_location_status_target_idx
  on public.external_orders(location_id, status, target_date, created_at desc);
create index if not exists external_orders_business_source_idx
  on public.external_orders(business_id, source, created_at desc);
create index if not exists external_order_history_order_idx
  on public.external_order_status_history(order_id, changed_at desc);

alter table public.order_sources enable row level security;
alter table public.external_orders enable row level security;
alter table public.external_order_status_history enable row level security;

revoke all on table public.order_sources from anon, authenticated;
revoke all on table public.external_orders from anon, authenticated;
revoke all on table public.external_order_status_history from anon, authenticated;
grant select, insert, update on table public.order_sources to authenticated;
grant select, insert, update on table public.external_orders to authenticated;
grant select, insert on table public.external_order_status_history to authenticated;

create policy "members read order sources" on public.order_sources for select to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin());
create policy "owners create order sources" on public.order_sources for insert to authenticated
with check (public.is_business_owner(business_id) or public.is_platform_admin());
create policy "owners update order sources" on public.order_sources for update to authenticated
using (public.is_business_owner(business_id) or public.is_platform_admin())
with check (public.is_business_owner(business_id) or public.is_platform_admin());

create policy "members read external orders" on public.external_orders for select to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin());
create policy "members create external orders" on public.external_orders for insert to authenticated
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (select 1 from public.locations l where l.id=location_id and l.business_id=business_id)
);
create policy "members update external orders" on public.external_orders for update to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin())
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (select 1 from public.locations l where l.id=location_id and l.business_id=business_id)
);

create policy "members read order history" on public.external_order_status_history for select to authenticated
using (exists (
  select 1 from public.external_orders o
  where o.id=order_id and (public.can_access_location(o.location_id) or public.is_platform_admin())
));
create policy "members create order history" on public.external_order_status_history for insert to authenticated
with check (exists (
  select 1 from public.external_orders o
  where o.id=order_id and (public.can_access_location(o.location_id) or public.is_platform_admin())
));

create or replace function public.track_external_order_change() returns trigger
language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'completed' and old.status is distinct from new.status then new.completed_at := now(); end if;
  if new.status = 'cancelled' and old.status is distinct from new.status then new.cancelled_at := now(); end if;
  if old.status is distinct from new.status then
    insert into public.external_order_status_history(order_id,from_status,to_status,changed_by)
    values(old.id,old.status,new.status,auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists external_orders_track_change on public.external_orders;
create trigger external_orders_track_change before update on public.external_orders
for each row execute function public.track_external_order_change();

insert into public.order_sources(business_id,name,sort_order)
select b.id,s.name,s.sort_order from public.businesses b cross join (values
  ('Facebook',1),('Online',2),('Walk-in',3),('Word of mouth',4),('Referral',5),('Other',6)
) as s(name,sort_order)
on conflict (business_id,name) do nothing;
