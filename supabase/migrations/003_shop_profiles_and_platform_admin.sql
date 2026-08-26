-- One business row now represents one independent shop profile.
-- Platform administrators create and manage shop profiles but are not shop members.

alter table public.businesses add column if not exists slug text;
alter table public.businesses add column if not exists contact_name text;
alter table public.businesses add column if not exists contact_email text;
alter table public.businesses add column if not exists status text not null default 'active' check (status in ('active','inactive'));
create unique index if not exists businesses_slug_key on public.businesses(slug) where slug is not null;

-- Initial stock imported by a migration is a system event, so it has no user actor.
alter table public.inventory_movements alter column created_by drop not null;

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_admins where user_id=auth.uid())
$$;

create policy "read own platform admin status" on public.platform_admins
for select using(user_id=auth.uid());

create policy "platform admins read shops" on public.businesses
for select using(public.is_platform_admin());
create policy "platform admins read shop locations" on public.locations
for select using(public.is_platform_admin());
create policy "platform admins read shop categories" on public.categories
for select using(public.is_platform_admin());
create policy "platform admins read shop products" on public.products
for select using(public.is_platform_admin());
create policy "platform admins read shop stock" on public.inventory_levels
for select using(public.is_platform_admin());
create policy "platform admins read shop sales" on public.sales
for select using(public.is_platform_admin());
create policy "platform admins read sale items" on public.sale_items
for select using(public.is_platform_admin());
create policy "platform admins read stock movements" on public.inventory_movements
for select using(public.is_platform_admin());

create or replace function public.admin_create_shop_profile(
  p_shop_name text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_use_sebu_catalogue boolean default false
) returns table(shop_id uuid, location_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_shop_id uuid;
  v_location_id uuid;
  v_slug text;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if nullif(trim(p_shop_name),'') is null then raise exception 'Enter a shop name'; end if;

  v_slug:=trim(both '-' from regexp_replace(lower(trim(p_shop_name)),'[^a-z0-9]+','-','g'));
  if v_slug='' then v_slug:='shop'; end if;
  if exists(select 1 from public.businesses where slug=v_slug) then
    v_slug:=v_slug||'-'||substr(gen_random_uuid()::text,1,6);
  end if;

  insert into public.businesses(name,slug,contact_name,contact_email)
  values(trim(p_shop_name),v_slug,nullif(trim(p_contact_name),''),nullif(lower(trim(p_contact_email)),''))
  returning id into v_shop_id;
  insert into public.locations(business_id,name) values(v_shop_id,'Main Shop') returning id into v_location_id;

  if p_use_sebu_catalogue then
    -- Temporary membership satisfies the protected workbook importer.
    insert into public.business_memberships(user_id,business_id,role,default_location_id)
    values(auth.uid(),v_shop_id,'owner',v_location_id);
    perform public.seed_sebu_products(v_shop_id,v_location_id);
    delete from public.business_memberships where user_id=auth.uid() and business_id=v_shop_id;
  end if;
  return query select v_shop_id,v_location_id;
end $$;

-- Connect a shop profile to a person after that person has registered a login.
create or replace function public.admin_assign_shop_user(
  p_shop_id uuid,
  p_user_id uuid,
  p_display_name text
) returns void
language plpgsql security definer set search_path=public as $$
declare v_location_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'This person must register a login first'; end if;
  select id into v_location_id from public.locations where business_id=p_shop_id and active order by created_at limit 1;
  if v_location_id is null then raise exception 'Shop profile not found'; end if;
  insert into public.profiles(id,display_name) values(p_user_id,trim(p_display_name))
  on conflict(id) do update set display_name=excluded.display_name;
  if exists(select 1 from public.business_memberships where user_id=p_user_id) then raise exception 'This login already belongs to a shop'; end if;
  insert into public.business_memberships(user_id,business_id,role,default_location_id)
  values(p_user_id,p_shop_id,'owner',v_location_id);
end $$;

grant execute on function public.admin_create_shop_profile(text,text,text,boolean) to authenticated;
grant execute on function public.admin_assign_shop_user(uuid,uuid,text) to authenticated;
revoke execute on function public.create_business_profile(text,text,text) from authenticated;
revoke execute on function public.create_business_profile(text,text,text) from public;

-- Create the first standalone shop profile from SEBU 3D prints.xlsx.
do $$
declare v_shop_id uuid; declare v_location_id uuid;
begin
  select id into v_shop_id from public.businesses where slug='sebu3d';
  if v_shop_id is null then
    insert into public.businesses(name,slug,status) values('Sebu3D','sebu3d','active') returning id into v_shop_id;
  end if;
  select id into v_location_id from public.locations where business_id=v_shop_id order by created_at limit 1;
  if v_location_id is null then
    insert into public.locations(business_id,name) values(v_shop_id,'Sebu3D Shop') returning id into v_location_id;
  end if;
  perform public.seed_sebu_products(v_shop_id,v_location_id);
end $$;
