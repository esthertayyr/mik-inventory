create table if not exists public.source_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  product_url text not null check (char_length(trim(product_url)) > 0),
  platform text not null default 'Other',
  supplier_name text,
  supplier_shop_url text,
  original_description text,
  english_description text,
  final_cost_sgd numeric(12,2) not null default 0 check (final_cost_sgd >= 0),
  exchange_rate_sgd_php numeric(12,4) not null default 45 check (exchange_rate_sgd_php > 0),
  order_quantity integer not null default 1 check (order_quantity > 0),
  deposit_percent numeric(5,2) not null default 50 check (deposit_percent > 0 and deposit_percent <= 100),
  market_reference_price_php numeric(12,2) check (market_reference_price_php is null or market_reference_price_php >= 0),
  market_reference_url text,
  selling_price_php numeric(12,2) check (selling_price_php is null or selling_price_php >= 0),
  notes text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_product_options (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.source_products(id) on delete cascade,
  option_type text not null,
  option_value text not null,
  price_sgd numeric(12,2) check (price_sgd is null or price_sgd >= 0),
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.source_product_images (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.source_products(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  image_type text not null default 'product' check (image_type in ('product','screenshot','price','supplier','variant')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists source_products_business_idx on public.source_products(business_id, created_at desc);
create index if not exists source_product_options_product_idx on public.source_product_options(source_product_id, sort_order);
create index if not exists source_product_images_product_idx on public.source_product_images(source_product_id, sort_order);

alter table public.source_products enable row level security;
alter table public.source_product_options enable row level security;
alter table public.source_product_images enable row level security;

grant select, insert, update, delete on public.source_products to authenticated;
grant select, insert, update, delete on public.source_product_options to authenticated;
grant select, insert, update, delete on public.source_product_images to authenticated;

create policy "members manage sourced products" on public.source_products for all to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (public.is_business_member(business_id) or public.is_platform_admin());

create policy "members manage sourced product options" on public.source_product_options for all to authenticated
using (exists(select 1 from public.source_products p where p.id=source_product_id and (public.is_business_member(p.business_id) or public.is_platform_admin())))
with check (exists(select 1 from public.source_products p where p.id=source_product_id and (public.is_business_member(p.business_id) or public.is_platform_admin())));

create policy "members manage sourced product images" on public.source_product_images for all to authenticated
using (exists(select 1 from public.source_products p where p.id=source_product_id and (public.is_business_member(p.business_id) or public.is_platform_admin())))
with check (exists(select 1 from public.source_products p where p.id=source_product_id and (public.is_business_member(p.business_id) or public.is_platform_admin())));
