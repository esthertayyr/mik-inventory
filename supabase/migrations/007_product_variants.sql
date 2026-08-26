-- Simple product choices such as Letter A-Z, Colour, or Size.
-- Products without choices continue using inventory_levels exactly as before.
alter table public.products add column if not exists variant_label text;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_override numeric(12,2) check(price_override is null or price_override>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(product_id,name)
);

create table if not exists public.variant_inventory_levels (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  quantity_on_hand integer not null default 0 check(quantity_on_hand>=0),
  updated_at timestamptz not null default now(),
  primary key(variant_id,location_id)
);

alter table public.sale_items add column if not exists variant_id uuid references public.product_variants(id) on delete restrict;
alter table public.sale_items add column if not exists variant_name text;
alter table public.inventory_movements add column if not exists variant_id uuid references public.product_variants(id) on delete restrict;

alter table public.product_variants enable row level security;
alter table public.variant_inventory_levels enable row level security;
create policy "read business variants" on public.product_variants for select
using(exists(select 1 from public.products p where p.id=product_id and public.is_business_member(p.business_id)) or public.is_platform_admin());
create policy "owners manage variants" on public.product_variants for all
using(exists(select 1 from public.products p where p.id=product_id and public.is_business_owner(p.business_id)))
with check(exists(select 1 from public.products p where p.id=product_id and public.is_business_owner(p.business_id)));
create policy "read variant stock" on public.variant_inventory_levels for select
using(public.can_access_location(location_id) or public.is_platform_admin());

create or replace function public.create_product_with_choices(
  p_business_id uuid,
  p_location_id uuid,
  p_name text,
  p_category_id uuid,
  p_regular_price numeric,
  p_sale_price numeric,
  p_starting_stock integer,
  p_variant_label text default null,
  p_variants jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_product_id uuid; declare v_variant jsonb; declare v_variant_id uuid;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Owner access required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id and active) then raise exception 'Shop location not available'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Enter a product name'; end if;
  if p_starting_stock<0 then raise exception 'Starting stock cannot be negative'; end if;
  if p_regular_price<0 or p_sale_price<0 then raise exception 'Price cannot be negative'; end if;
  if p_category_id is not null and not exists(select 1 from public.categories where id=p_category_id and business_id=p_business_id) then raise exception 'Category not available'; end if;

  insert into public.products(business_id,category_id,name,regular_price,sale_price,variant_label)
  values(p_business_id,p_category_id,trim(p_name),p_regular_price,p_sale_price,case when jsonb_array_length(p_variants)>0 then nullif(trim(p_variant_label),'') else null end)
  returning id into v_product_id;

  if jsonb_array_length(p_variants)=0 then
    insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count) values(v_product_id,p_location_id,p_starting_stock,false);
    if p_starting_stock>0 then insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,note,created_by) values(p_location_id,v_product_id,'stock_in',p_starting_stock,'Starting stock',auth.uid()); end if;
  else
    insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count) values(v_product_id,p_location_id,0,false);
    for v_variant in select * from jsonb_array_elements(p_variants) loop
      if nullif(trim(v_variant->>'name'),'') is null then raise exception 'Choice name cannot be empty'; end if;
      insert into public.product_variants(product_id,name) values(v_product_id,trim(v_variant->>'name')) returning id into v_variant_id;
      insert into public.variant_inventory_levels(variant_id,location_id,quantity_on_hand) values(v_variant_id,p_location_id,p_starting_stock);
      if p_starting_stock>0 then insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,note,created_by) values(p_location_id,v_product_id,v_variant_id,'stock_in',p_starting_stock,'Starting stock',auth.uid()); end if;
    end loop;
  end if;
  return v_product_id;
end $$;

create or replace function public.record_variant_inventory_movement(
  p_location_id uuid,
  p_variant_id uuid,
  p_type public.movement_type,
  p_quantity integer,
  p_note text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_product_id uuid; declare v_business_id uuid; declare v_delta integer; declare v_stock integer;
begin
  select p.id,p.business_id into v_product_id,v_business_id from public.product_variants v join public.products p on p.id=v.product_id where v.id=p_variant_id and v.active and p.active;
  if v_product_id is null or not public.can_access_location(p_location_id) or not exists(select 1 from public.locations where id=p_location_id and business_id=v_business_id) then raise exception 'Choice or location not available'; end if;
  if p_type not in ('stock_in','damage') or p_quantity<=0 then raise exception 'Enter a positive quantity'; end if;
  v_delta:=case when p_type='damage' then -p_quantity else p_quantity end;
  insert into public.variant_inventory_levels(variant_id,location_id,quantity_on_hand) values(p_variant_id,p_location_id,0) on conflict do nothing;
  select quantity_on_hand into v_stock from public.variant_inventory_levels where variant_id=p_variant_id and location_id=p_location_id for update;
  if v_stock+v_delta<0 then raise exception 'Stock cannot be negative'; end if;
  update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand+v_delta,updated_at=now() where variant_id=p_variant_id and location_id=p_location_id;
  insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,note,created_by) values(p_location_id,v_product_id,p_variant_id,p_type,v_delta,nullif(trim(p_note),''),auth.uid());
end $$;

create or replace function public.create_confirmed_sale_with_choices(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; declare v_sale_id uuid; declare v_item jsonb; declare v_product public.products; declare v_variant public.product_variants; declare v_quantity integer; declare v_price numeric(12,2); declare v_stock integer; declare v_total numeric(12,2):=0; declare v_has_choices boolean;
begin
  if p_payment_method='gcash' and not coalesce(p_payment_received,false) then raise exception 'Confirm that the GCash payment was received'; end if;
  select l.business_id into v_business_id from public.locations l join public.business_memberships m on m.business_id=l.business_id where l.id=p_location_id and l.active and m.user_id=auth.uid() and (m.role='owner' or m.default_location_id=l.id);
  if v_business_id is null then raise exception 'Location not available'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; if v_quantity<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business_id and active;
    if v_product.id is null then raise exception 'Product not found'; end if;
    select exists(select 1 from public.product_variants where product_id=v_product.id and active) into v_has_choices;
    if v_has_choices then
      if nullif(v_item->>'variant_id','') is null then raise exception 'Choose % for %',coalesce(v_product.variant_label,'an option'),v_product.name; end if;
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and active;
      if v_variant.id is null then raise exception 'Choice not found'; end if;
      v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.variant_inventory_levels where variant_id=v_variant.id and location_id=p_location_id for update;
    else
      v_variant:=null;
      v_price:=coalesce(v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.inventory_levels where product_id=v_product.id and location_id=p_location_id for update;
    end if;
    if v_price is null then raise exception 'Set a price for %',v_product.name; end if;
    if coalesce(v_stock,0)<v_quantity then raise exception 'Only % unit(s) available for %',coalesce(v_stock,0),v_product.name; end if;
    v_total:=v_total+v_quantity*v_price;
  end loop;

  insert into public.sales(business_id,location_id,payment_method,total,created_by,payment_confirmed_at,payment_confirmed_by,payment_reference)
  values(v_business_id,p_location_id,p_payment_method,v_total,auth.uid(),case when p_payment_received then now() end,case when p_payment_received then auth.uid() end,case when p_payment_method='gcash' then nullif(trim(p_payment_reference),'') end)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
    if nullif(v_item->>'variant_id','') is not null then select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid; else v_variant:=null; end if;
    v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
    insert into public.sale_items(sale_id,product_id,variant_id,product_name,variant_name,quantity,unit_price,line_total) values(v_sale_id,v_product.id,v_variant.id,v_product.name,v_variant.name,v_quantity,v_price,v_quantity*v_price);
    if v_variant.id is not null then update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where variant_id=v_variant.id and location_id=p_location_id; else update public.inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where product_id=v_product.id and location_id=p_location_id; end if;
    insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by) values(p_location_id,v_product.id,v_variant.id,'sale',-v_quantity,v_sale_id,auth.uid());
  end loop;
  return v_sale_id;
end $$;

grant execute on function public.create_product_with_choices(uuid,uuid,text,uuid,numeric,numeric,integer,text,jsonb) to authenticated;
grant execute on function public.record_variant_inventory_movement(uuid,uuid,public.movement_type,integer,text) to authenticated;
grant execute on function public.create_confirmed_sale_with_choices(uuid,jsonb,public.payment_method,boolean,text) to authenticated;

create or replace function public.void_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_sale public.sales; declare v_item public.sale_items;
begin
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null or not public.is_business_owner(v_sale.business_id) then raise exception 'Only the owner can void this sale'; end if;
  if v_sale.status<>'completed' then raise exception 'Sale already voided'; end if;
  for v_item in select * from public.sale_items where sale_id=p_sale_id loop
    if v_item.variant_id is not null then
      update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now() where variant_id=v_item.variant_id and location_id=v_sale.location_id;
    else
      update public.inventory_levels set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now() where product_id=v_item.product_id and location_id=v_sale.location_id;
    end if;
    insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by) values(v_sale.location_id,v_item.product_id,v_item.variant_id,'sale_void',v_item.quantity,p_sale_id,auth.uid());
  end loop;
  update public.sales set status='voided',voided_by=auth.uid(),voided_at=now() where id=p_sale_id;
end $$;
