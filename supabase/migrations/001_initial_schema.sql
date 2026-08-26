-- SEBU 3D Print
-- Login profile -> business -> one or more locations.
-- Products belong to the business. Stock and sales belong to a location.

create extension if not exists pgcrypto;
create type public.user_role as enum ('owner', 'staff');
create type public.payment_method as enum ('cash', 'gcash');
create type public.sale_status as enum ('completed', 'voided');
create type public.movement_type as enum ('initial_stock', 'stock_in', 'sale', 'damage', 'adjustment', 'sale_void');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text not null, created_at timestamptz not null default now());
create table public.businesses (id uuid primary key default gen_random_uuid(), name text not null, currency text not null default 'PHP', created_at timestamptz not null default now());
create table public.business_memberships (user_id uuid not null references public.profiles(id) on delete cascade, business_id uuid not null references public.businesses(id) on delete cascade, role public.user_role not null default 'staff', primary key (user_id,business_id));
create table public.locations (id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, address text, active boolean not null default true, created_at timestamptz not null default now(), unique(business_id,name));
alter table public.business_memberships add column default_location_id uuid references public.locations(id) on delete set null;
create table public.categories (id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, sort_order integer not null default 0, active boolean not null default true, unique(business_id,name));

create table public.products (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null, sku text, name text not null, description text,
  regular_price numeric(12,2), sale_price numeric(12,2), cost_price numeric(12,2), low_stock_threshold integer not null default 3 check(low_stock_threshold>=0),
  image_url text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(business_id,sku), check(regular_price is null or regular_price>=0), check(sale_price is null or sale_price>=0)
);
create table public.inventory_levels (product_id uuid not null references public.products(id) on delete cascade, location_id uuid not null references public.locations(id) on delete cascade, quantity_on_hand integer not null default 0 check(quantity_on_hand>=0), needs_stock_count boolean not null default false, updated_at timestamptz not null default now(), primary key(product_id,location_id));
create table public.product_price_history (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, regular_price numeric(12,2), sale_price numeric(12,2), changed_by uuid references public.profiles(id), changed_at timestamptz not null default now());
create table public.sales (id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, location_id uuid not null references public.locations(id) on delete restrict, receipt_number bigint generated always as identity unique, status public.sale_status not null default 'completed', payment_method public.payment_method not null, total numeric(12,2) not null check(total>=0), customer_name text, notes text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), voided_by uuid references public.profiles(id), voided_at timestamptz);
create table public.sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete restrict, product_id uuid not null references public.products(id) on delete restrict, product_name text not null, quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0), line_total numeric(12,2) not null check(line_total>=0));
create table public.inventory_movements (id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on delete restrict, product_id uuid not null references public.products(id) on delete restrict, movement_type public.movement_type not null, quantity_change integer not null check(quantity_change<>0), note text, sale_id uuid references public.sales(id) on delete restrict, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());

create index products_business_category_idx on public.products(business_id,category_id);
create index sales_location_created_idx on public.sales(location_id,created_at desc);
create index movements_location_product_idx on public.inventory_movements(location_id,product_id,created_at desc);

create or replace function public.is_business_member(p_business_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.business_memberships where user_id=auth.uid() and business_id=p_business_id) $$;
create or replace function public.is_business_owner(p_business_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.business_memberships where user_id=auth.uid() and business_id=p_business_id and role='owner') $$;
create or replace function public.can_access_location(p_location_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.locations l join public.business_memberships m on m.business_id=l.business_id where l.id=p_location_id and m.user_id=auth.uid() and (m.role='owner' or m.default_location_id=l.id))
$$;
create or replace function public.can_view_profile(p_user_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id=auth.uid() or exists(select 1 from public.business_memberships mine join public.business_memberships theirs on theirs.business_id=mine.business_id where mine.user_id=auth.uid() and theirs.user_id=p_user_id)
$$;

alter table public.profiles enable row level security; alter table public.businesses enable row level security; alter table public.business_memberships enable row level security;
alter table public.locations enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security;
alter table public.inventory_levels enable row level security; alter table public.product_price_history enable row level security; alter table public.sales enable row level security;
alter table public.sale_items enable row level security; alter table public.inventory_movements enable row level security;

create policy "read business profiles" on public.profiles for select using(public.can_view_profile(id));
create policy "read own businesses" on public.businesses for select using(public.is_business_member(id));
create policy "read own memberships" on public.business_memberships for select using(user_id=auth.uid());
create policy "read assigned locations" on public.locations for select using(public.can_access_location(id));
create policy "owners manage locations" on public.locations for all using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy "read business categories" on public.categories for select using(public.is_business_member(business_id));
create policy "owners manage categories" on public.categories for all using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy "read business products" on public.products for select using(public.is_business_member(business_id));
create policy "owners manage products" on public.products for all using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy "read location inventory" on public.inventory_levels for select using(public.can_access_location(location_id));
create policy "read price history" on public.product_price_history for select using(exists(select 1 from public.products p where p.id=product_id and public.is_business_member(p.business_id)));
create policy "read assigned location sales" on public.sales for select using(public.can_access_location(location_id));
create policy "read sale items" on public.sale_items for select using(exists(select 1 from public.sales s where s.id=sale_id and public.can_access_location(s.location_id)));
create policy "read movements" on public.inventory_movements for select using(public.can_access_location(location_id));

create or replace function public.create_business_profile(p_business_name text,p_location_name text,p_display_name text) returns table(business_id uuid,location_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; declare v_location_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from public.business_memberships where user_id=auth.uid()) then raise exception 'This login already has a business'; end if;
  insert into public.profiles(id,display_name) values(auth.uid(),trim(p_display_name)) on conflict(id) do update set display_name=excluded.display_name;
  insert into public.businesses(name) values(trim(p_business_name)) returning id into v_business_id;
  insert into public.business_memberships(user_id,business_id,role) values(auth.uid(),v_business_id,'owner');
  insert into public.locations(business_id,name) values(v_business_id,trim(p_location_name)) returning id into v_location_id;
  update public.business_memberships set default_location_id=v_location_id where user_id=auth.uid() and business_id=v_business_id;
  return query select v_business_id,v_location_id;
end $$;

create or replace function public.remember_price_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.regular_price is distinct from new.regular_price or old.sale_price is distinct from new.sale_price then insert into public.product_price_history(product_id,regular_price,sale_price,changed_by) values(new.id,old.regular_price,old.sale_price,auth.uid()); end if;
  new.updated_at:=now(); return new;
end $$;
create trigger products_price_history before update on public.products for each row execute function public.remember_price_change();

-- Items contain product_id and quantity only. Server uses sale_price when present, otherwise regular_price.
create or replace function public.create_sale(p_location_id uuid,p_items jsonb,p_payment_method public.payment_method,p_customer_name text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; declare v_sale_id uuid; declare v_item jsonb; declare v_product public.products; declare v_quantity integer; declare v_price numeric(12,2); declare v_stock integer; declare v_total numeric(12,2):=0;
begin
  select l.business_id into v_business_id from public.locations l join public.business_memberships m on m.business_id=l.business_id where l.id=p_location_id and l.active and m.user_id=auth.uid() and (m.role='owner' or m.default_location_id=l.id);
  if v_business_id is null then raise exception 'Location not available'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; if v_quantity<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business_id and active;
    if v_product.id is null then raise exception 'Product not found'; end if; v_price:=coalesce(v_product.sale_price,v_product.regular_price); if v_price is null then raise exception 'Set a price for %',v_product.name; end if;
    select quantity_on_hand into v_stock from public.inventory_levels where product_id=v_product.id and location_id=p_location_id for update;
    if coalesce(v_stock,0)<v_quantity then raise exception 'Only % unit(s) available for %',coalesce(v_stock,0),v_product.name; end if; v_total:=v_total+v_quantity*v_price;
  end loop;
  insert into public.sales(business_id,location_id,payment_method,total,customer_name,notes,created_by) values(v_business_id,p_location_id,p_payment_method,v_total,nullif(trim(p_customer_name),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; select * into v_product from public.products where id=(v_item->>'product_id')::uuid; v_price:=coalesce(v_product.sale_price,v_product.regular_price);
    insert into public.sale_items(sale_id,product_id,product_name,quantity,unit_price,line_total) values(v_sale_id,v_product.id,v_product.name,v_quantity,v_price,v_quantity*v_price);
    update public.inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where product_id=v_product.id and location_id=p_location_id;
    insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,sale_id,created_by) values(p_location_id,v_product.id,'sale',-v_quantity,v_sale_id,auth.uid());
  end loop; return v_sale_id;
end $$;

create or replace function public.record_inventory_movement(p_location_id uuid,p_product_id uuid,p_type public.movement_type,p_quantity integer,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; declare v_delta integer; declare v_stock integer;
begin
  select l.business_id into v_business_id from public.locations l join public.business_memberships m on m.business_id=l.business_id where l.id=p_location_id and m.user_id=auth.uid() and (m.role='owner' or m.default_location_id=l.id);
  if v_business_id is null or not exists(select 1 from public.products where id=p_product_id and business_id=v_business_id) then raise exception 'Product or location not available'; end if;
  if p_type not in ('stock_in','damage') or p_quantity<=0 then raise exception 'Enter a positive quantity'; end if; v_delta:=case when p_type='damage' then -p_quantity else p_quantity end;
  insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count) values(p_product_id,p_location_id,0,false) on conflict do nothing;
  select quantity_on_hand into v_stock from public.inventory_levels where product_id=p_product_id and location_id=p_location_id for update; if v_stock+v_delta<0 then raise exception 'Stock cannot be negative'; end if;
  update public.inventory_levels set quantity_on_hand=quantity_on_hand+v_delta,needs_stock_count=false,updated_at=now() where product_id=p_product_id and location_id=p_location_id;
  insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,note,created_by) values(p_location_id,p_product_id,p_type,v_delta,nullif(trim(p_note),''),auth.uid());
end $$;

create or replace function public.void_sale(p_sale_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_sale public.sales; declare v_item public.sale_items;
begin
  select * into v_sale from public.sales where id=p_sale_id for update; if v_sale.id is null or not public.is_business_owner(v_sale.business_id) then raise exception 'Only the owner can void this sale'; end if; if v_sale.status<>'completed' then raise exception 'Sale already voided'; end if;
  for v_item in select * from public.sale_items where sale_id=p_sale_id loop update public.inventory_levels set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now() where product_id=v_item.product_id and location_id=v_sale.location_id; insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,sale_id,created_by) values(v_sale.location_id,v_item.product_id,'sale_void',v_item.quantity,p_sale_id,auth.uid()); end loop;
  update public.sales set status='voided',voided_by=auth.uid(),voided_at=now() where id=p_sale_id;
end $$;

grant execute on function public.create_business_profile(text,text,text) to authenticated;
grant execute on function public.create_sale(uuid,jsonb,public.payment_method,text,text) to authenticated;
grant execute on function public.record_inventory_movement(uuid,uuid,public.movement_type,integer,text) to authenticated;
grant execute on function public.void_sale(uuid) to authenticated;
