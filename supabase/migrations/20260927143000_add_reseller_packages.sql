create table if not exists public.reseller_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  tier text not null default 'reseller' check (tier in ('starter','reseller','wholesale','custom')),
  description text,
  package_price_php numeric(12,2) not null check (package_price_php > 0),
  deposit_required_php numeric(12,2) not null check (deposit_required_php > 0 and deposit_required_php <= package_price_php),
  suggested_retail_total_php numeric(12,2) check (suggested_retail_total_php is null or suggested_retail_total_php >= 0),
  availability text not null default 'preorder' check (availability in ('preorder','ready_stock')),
  lead_time_text text not null default 'Estimated 1–2 months',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.reseller_packages(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_product_id uuid not null references public.source_products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  choices_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(package_id, source_product_id)
);

alter table public.reseller_preorders
  add column if not exists reseller_package_id uuid references public.reseller_packages(id) on delete set null,
  add column if not exists package_name text;

create index if not exists reseller_packages_business_idx
  on public.reseller_packages(business_id, active, created_at desc);
create index if not exists reseller_package_items_package_idx
  on public.reseller_package_items(package_id, sort_order);

alter table public.reseller_packages enable row level security;
alter table public.reseller_package_items enable row level security;

grant select, insert, update, delete on public.reseller_packages to authenticated;
grant select, insert, update, delete on public.reseller_package_items to authenticated;

create policy "members manage reseller packages"
on public.reseller_packages for all to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (public.is_business_member(business_id) or public.is_platform_admin());

create policy "members manage reseller package items"
on public.reseller_package_items for all to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (public.is_business_member(business_id) or public.is_platform_admin());
