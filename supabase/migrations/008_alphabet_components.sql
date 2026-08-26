-- Multi-letter products share A-Z component stock by alphabet style.
create table if not exists public.alphabet_styles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(business_id,name)
);

create table if not exists public.alphabet_letter_inventory (
  style_id uuid not null references public.alphabet_styles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  letter text not null check(letter ~ '^[A-Z]$'),
  quantity_on_hand integer not null default 0 check(quantity_on_hand>=0),
  needs_stock_count boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(style_id,location_id,letter)
);

create table if not exists public.alphabet_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.alphabet_styles(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  letter text not null check(letter ~ '^[A-Z]$'),
  movement_type public.movement_type not null,
  quantity_change integer not null check(quantity_change<>0),
  sale_id uuid references public.sales(id) on delete restrict,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.products add column if not exists alphabet_style_id uuid references public.alphabet_styles(id) on delete restrict;
alter table public.products add column if not exists letters_required integer not null default 0 check(letters_required between 0 and 20);
alter table public.sale_items add column if not exists selected_letters text[];

alter table public.alphabet_styles enable row level security;
alter table public.alphabet_letter_inventory enable row level security;
alter table public.alphabet_inventory_movements enable row level security;

drop policy if exists "read alphabet styles" on public.alphabet_styles;
create policy "read alphabet styles" on public.alphabet_styles for select
using(public.is_business_member(business_id) or public.is_platform_admin());
drop policy if exists "owners manage alphabet styles" on public.alphabet_styles;
create policy "owners manage alphabet styles" on public.alphabet_styles for all
using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
drop policy if exists "read alphabet stock" on public.alphabet_letter_inventory;
create policy "read alphabet stock" on public.alphabet_letter_inventory for select
using(public.can_access_location(location_id) or public.is_platform_admin());
drop policy if exists "read alphabet movements" on public.alphabet_inventory_movements;
create policy "read alphabet movements" on public.alphabet_inventory_movements for select
using(public.can_access_location(location_id) or public.is_platform_admin());

create or replace function public.record_alphabet_inventory_movement(
  p_location_id uuid, p_style_id uuid, p_letter text,
  p_type public.movement_type, p_quantity integer, p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_delta integer; v_stock integer; v_business_id uuid;
begin
  select business_id into v_business_id from public.alphabet_styles where id=p_style_id and active;
  if v_business_id is null or not public.can_access_location(p_location_id)
     or not exists(select 1 from public.locations where id=p_location_id and business_id=v_business_id)
    then raise exception 'Alphabet style or location not available'; end if;
  if upper(p_letter)!~'^[A-Z]$' or p_type not in ('stock_in','damage') or p_quantity<=0
    then raise exception 'Enter a valid letter and positive quantity'; end if;
  v_delta:=case when p_type='damage' then -p_quantity else p_quantity end;
  insert into public.alphabet_letter_inventory(style_id,location_id,letter)
  values(p_style_id,p_location_id,upper(p_letter)) on conflict do nothing;
  select quantity_on_hand into v_stock from public.alphabet_letter_inventory
  where style_id=p_style_id and location_id=p_location_id and letter=upper(p_letter) for update;
  if v_stock+v_delta<0 then raise exception 'Stock cannot be negative'; end if;
  update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand+v_delta,
    needs_stock_count=false,updated_at=now()
  where style_id=p_style_id and location_id=p_location_id and letter=upper(p_letter);
  insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,created_by)
  values(p_style_id,p_location_id,upper(p_letter),p_type,v_delta,auth.uid());
end $$;

create or replace function public.create_confirmed_sale_with_choices(
  p_location_id uuid, p_items jsonb, p_payment_method public.payment_method,
  p_payment_received boolean, p_payment_reference text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; v_sale_id uuid; v_item jsonb; v_product public.products;
  v_variant public.product_variants; v_quantity integer; v_price numeric(12,2);
  v_stock integer; v_total numeric(12,2):=0; v_has_choices boolean;
  v_letters text[]; v_letter text; v_needed integer; v_available integer;
begin
  if p_payment_method='gcash' and not coalesce(p_payment_received,false) then raise exception 'Confirm that the GCash payment was received'; end if;
  select l.business_id into v_business_id from public.locations l join public.business_memberships m on m.business_id=l.business_id
  where l.id=p_location_id and l.active and m.user_id=auth.uid() and (m.role='owner' or m.default_location_id=l.id);
  if v_business_id is null then raise exception 'Location not available'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; if v_quantity<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business_id and active;
    if v_product.id is null then raise exception 'Product not found'; end if;
    v_letters:=array(select upper(jsonb_array_elements_text(coalesce(v_item->'selected_letters','[]'::jsonb))));
    if v_product.letters_required>0 then
      if v_product.alphabet_style_id is null or cardinality(v_letters)<>v_product.letters_required
        then raise exception 'Choose exactly % letter(s) for %',v_product.letters_required,v_product.name; end if;
      if exists(select 1 from unnest(v_letters) x where x!~'^[A-Z]$') then raise exception 'Invalid letter choice'; end if;
      for v_letter,v_needed in select x,count(*)::int*v_quantity from unnest(v_letters) x group by x loop
        select quantity_on_hand into v_available from public.alphabet_letter_inventory
        where style_id=v_product.alphabet_style_id and location_id=p_location_id and letter=v_letter for update;
        if coalesce(v_available,0)<v_needed then raise exception 'Only % of letter % available',coalesce(v_available,0),v_letter; end if;
      end loop;
    elsif cardinality(v_letters)>0 then raise exception 'Letters are not used for this product'; end if;

    select exists(select 1 from public.product_variants where product_id=v_product.id and active) into v_has_choices;
    if v_has_choices then
      if nullif(v_item->>'variant_id','') is null then raise exception 'Choose % for %',coalesce(v_product.variant_label,'an option'),v_product.name; end if;
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and active;
      v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.variant_inventory_levels where variant_id=v_variant.id and location_id=p_location_id for update;
    else
      v_variant:=null; v_price:=coalesce(v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.inventory_levels where product_id=v_product.id and location_id=p_location_id for update;
    end if;
    if v_price is null then raise exception 'Set a price for %',v_product.name; end if;
    if coalesce(v_stock,0)<v_quantity then raise exception 'Only % unit(s) available for %',coalesce(v_stock,0),v_product.name; end if;
    v_total:=v_total+v_quantity*v_price;
  end loop;

  insert into public.sales(business_id,location_id,payment_method,total,created_by,payment_confirmed_at,payment_confirmed_by,payment_reference)
  values(v_business_id,p_location_id,p_payment_method,v_total,auth.uid(),case when p_payment_received then now() end,
    case when p_payment_received then auth.uid() end,case when p_payment_method='gcash' then nullif(trim(p_payment_reference),'') end)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
    v_letters:=array(select upper(jsonb_array_elements_text(coalesce(v_item->'selected_letters','[]'::jsonb))));
    if nullif(v_item->>'variant_id','') is not null then select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid; else v_variant:=null; end if;
    v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
    insert into public.sale_items(sale_id,product_id,variant_id,product_name,variant_name,selected_letters,quantity,unit_price,line_total)
    values(v_sale_id,v_product.id,v_variant.id,v_product.name,v_variant.name,case when cardinality(v_letters)>0 then v_letters end,v_quantity,v_price,v_quantity*v_price);
    if v_variant.id is not null then
      update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where variant_id=v_variant.id and location_id=p_location_id;
    else
      update public.inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where product_id=v_product.id and location_id=p_location_id;
    end if;
    insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
    values(p_location_id,v_product.id,v_variant.id,'sale',-v_quantity,v_sale_id,auth.uid());
    if cardinality(v_letters)>0 then
      for v_letter,v_needed in select x,count(*)::int*v_quantity from unnest(v_letters) x group by x loop
        update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand-v_needed,updated_at=now()
        where style_id=v_product.alphabet_style_id and location_id=p_location_id and letter=v_letter;
        insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by)
        values(v_product.alphabet_style_id,p_location_id,v_letter,'sale',-v_needed,v_sale_id,auth.uid());
      end loop;
    end if;
  end loop;
  return v_sale_id;
end $$;

create or replace function public.void_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_sale public.sales; v_item public.sale_items; v_style_id uuid; v_letter text; v_needed integer;
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
    insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
    values(v_sale.location_id,v_item.product_id,v_item.variant_id,'sale_void',v_item.quantity,p_sale_id,auth.uid());
    if cardinality(v_item.selected_letters)>0 then
      select alphabet_style_id into v_style_id from public.products where id=v_item.product_id;
      for v_letter,v_needed in select x,count(*)::int*v_item.quantity from unnest(v_item.selected_letters) x group by x loop
        update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand+v_needed,updated_at=now()
        where style_id=v_style_id and location_id=v_sale.location_id and letter=v_letter;
        insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by)
        values(v_style_id,v_sale.location_id,v_letter,'sale_void',v_needed,p_sale_id,auth.uid());
      end loop;
    end if;
  end loop;
  update public.sales set status='voided',voided_by=auth.uid(),voided_at=now() where id=p_sale_id;
end $$;

grant execute on function public.record_alphabet_inventory_movement(uuid,uuid,text,public.movement_type,integer,text) to authenticated;
grant execute on function public.create_confirmed_sale_with_choices(uuid,jsonb,public.payment_method,boolean,text) to authenticated;

-- Prepare Sebu3D with separate stock pools for universal and character alphabets.
do $$
declare v_business uuid; v_location uuid; v_universal uuid; v_character uuid;
begin
  select id into v_business from public.businesses where slug='sebu3d';
  if v_business is null then return; end if;
  select id into v_location from public.locations where business_id=v_business order by created_at limit 1;
  insert into public.alphabet_styles(business_id,name) values(v_business,'Universal') on conflict(business_id,name) do update set active=true returning id into v_universal;
  insert into public.alphabet_styles(business_id,name) values(v_business,'Character') on conflict(business_id,name) do update set active=true returning id into v_character;
  insert into public.alphabet_letter_inventory(style_id,location_id,letter)
    select s.id,v_location,chr(64+n) from public.alphabet_styles s cross join generate_series(1,26) n
    where s.id in(v_universal,v_character) on conflict do nothing;
  update public.products set alphabet_style_id=v_universal,
    letters_required=(regexp_match(name,'([1-6]) Slot'))[1]::int
  where business_id=v_business and name ~ '^Keyboard Clicker [1-6] Slot';
  update public.products set alphabet_style_id=v_character,
    letters_required=(regexp_match(name,'([1-6]) Slot'))[1]::int
  where business_id=v_business and name ~ '^Keyboard Clicker Character [1-6] Slot';
  insert into public.products(business_id,category_id,name,regular_price,alphabet_style_id,letters_required)
  select v_business,c.id,'Extra Alphabet - Universal',null,v_universal,1 from public.categories c
  where c.business_id=v_business and c.name='Keyboard Clickers'
    and not exists(select 1 from public.products p where p.business_id=v_business and lower(p.name)=lower('Extra Alphabet - Universal'));
  insert into public.products(business_id,category_id,name,regular_price,alphabet_style_id,letters_required)
  select v_business,c.id,'Extra Alphabet - Character',null,v_character,1 from public.categories c
  where c.business_id=v_business and c.name='Keyboard Clickers'
    and not exists(select 1 from public.products p where p.business_id=v_business and lower(p.name)=lower('Extra Alphabet - Character'));
  insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count)
  select p.id,v_location,0,true from public.products p where p.business_id=v_business and p.name like 'Extra Alphabet - %'
  on conflict(product_id,location_id) do nothing;
end $$;
