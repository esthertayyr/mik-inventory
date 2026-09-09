create table if not exists public.platform_team_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  permissions text[] not null default array['view_dashboard']::text[],
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.platform_team_shops (
  user_id uuid not null references public.platform_team_members(user_id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  primary key(user_id,business_id)
);
create table if not exists public.stock_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  checked_on date not null default current_date,
  checked_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_checks_location_date_idx on public.stock_checks(location_id,checked_on desc);

alter table public.platform_team_members enable row level security;
alter table public.platform_team_shops enable row level security;
alter table public.stock_checks enable row level security;

create or replace function public.is_platform_team_member() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_team_members where user_id=auth.uid() and active)
$$;
create or replace function public.can_view_platform_shop(p_business_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or exists(select 1 from public.platform_team_shops where user_id=auth.uid() and business_id=p_business_id)
$$;

create policy "team reads own account" on public.platform_team_members for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy "team reads own shops" on public.platform_team_shops for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy "team reads assigned businesses" on public.businesses for select to authenticated using(public.can_view_platform_shop(id));
create policy "team reads assigned locations" on public.locations for select to authenticated using(public.can_view_platform_shop(business_id));
create policy "team reads assigned sales" on public.sales for select to authenticated using(public.can_view_platform_shop(business_id));
create policy "team reads assigned orders" on public.external_orders for select to authenticated using(public.can_view_platform_shop(business_id));
create policy "team reads assigned order payments" on public.order_payments for select to authenticated using(public.can_view_platform_shop(business_id));
create policy "team reads assigned expenses" on public.expenses for select to authenticated using(public.can_view_platform_shop(business_id));
create policy "team reads assigned stock" on public.inventory_levels for select to authenticated using(exists(select 1 from public.products p where p.id=product_id and public.can_view_platform_shop(p.business_id)));
create policy "members read stock checks" on public.stock_checks for select to authenticated using(public.can_access_location(location_id) or public.can_view_platform_shop(business_id));
create policy "members add stock checks" on public.stock_checks for insert to authenticated with check(public.can_access_location(location_id) or public.is_platform_admin());

grant select on public.platform_team_members,public.platform_team_shops to authenticated;
grant select,insert on public.stock_checks to authenticated;
revoke all on function public.is_platform_team_member() from public;
revoke all on function public.can_view_platform_shop(uuid) from public;
grant execute on function public.is_platform_team_member() to authenticated;
grant execute on function public.can_view_platform_shop(uuid) to authenticated;
