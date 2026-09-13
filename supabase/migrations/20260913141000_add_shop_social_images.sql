-- Optional, shop-owned artwork for social posts. It does not affect stock or sales.
create table public.shop_social_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  image_url text not null,
  storage_path text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index shop_social_images_business_created_idx on public.shop_social_images(business_id,created_at desc);
alter table public.shop_social_images enable row level security;
grant select,insert,delete on public.shop_social_images to authenticated;

create policy "shop reads social images" on public.shop_social_images
for select to authenticated using (public.is_business_member(business_id) or public.is_platform_admin());
create policy "shop owner adds social images" on public.shop_social_images
for insert to authenticated with check (
  (public.is_business_owner(business_id) or public.is_platform_admin())
  and created_by=(select auth.uid())
  and storage_path like business_id::text || '/social/%'
);
create policy "shop owner removes social images" on public.shop_social_images
for delete to authenticated using (public.is_business_owner(business_id) or public.is_platform_admin());
