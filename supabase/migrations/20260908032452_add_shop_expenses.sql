create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  expense_date date not null default current_date,
  description text not null check (length(trim(description)) > 0),
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','gcash','bank','other')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_location_date_idx on public.expenses(location_id, expense_date desc);
alter table public.expenses enable row level security;
revoke all on table public.expenses from anon, authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

create policy "read location expenses" on public.expenses for select to authenticated
using (public.is_platform_admin() or public.can_access_location(location_id));
create policy "add location expenses" on public.expenses for insert to authenticated
with check (public.has_shop_permission(business_id,'reports') and exists(select 1 from public.locations l where l.id=location_id and l.business_id=business_id));
create policy "update location expenses" on public.expenses for update to authenticated
using (public.has_shop_permission(business_id,'reports'))
with check (public.has_shop_permission(business_id,'reports') and exists(select 1 from public.locations l where l.id=location_id and l.business_id=business_id));
create policy "delete location expenses" on public.expenses for delete to authenticated
using (public.has_shop_permission(business_id,'reports'));
