alter table public.businesses
  add column if not exists character_keycap_upgrade_price numeric(12,2) not null default 30
  check (character_keycap_upgrade_price >= 0);

alter table public.sale_items
  add column if not exists selected_keycaps jsonb;

create or replace function public.create_confirmed_sale_with_choices(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid; v_sale_id uuid; v_item jsonb; v_product public.products;
  v_variant public.product_variants; v_quantity integer; v_price numeric(12,2);
  v_stock integer; v_total numeric(12,2):=0; v_has_choices boolean;
  v_keycaps jsonb; v_keycap jsonb; v_style_id uuid; v_letter text;
  v_needed integer; v_available integer; v_base_style text; v_selected_style text;
  v_upgrade numeric(12,2); v_upgrade_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_payment_method='gcash' and not coalesce(p_payment_received,false) then raise exception 'Confirm that the GCash payment was received'; end if;
  select l.business_id,b.character_keycap_upgrade_price into v_business_id,v_upgrade
  from public.locations l join public.businesses b on b.id=l.business_id
  where l.id=p_location_id and l.active
    and (public.is_business_member(l.business_id) or public.is_platform_admin());
  if v_business_id is null then raise exception 'Location not available'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer;
    if v_quantity<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business_id and active;
    if v_product.id is null then raise exception 'Product not found'; end if;
    v_keycaps:=coalesce(v_item->'selected_keycaps','[]'::jsonb);
    if jsonb_array_length(v_keycaps)=0 and jsonb_array_length(coalesce(v_item->'selected_letters','[]'::jsonb))>0 then
      select coalesce(jsonb_agg(jsonb_build_object('style_id',v_product.alphabet_style_id,'letter',upper(x))), '[]'::jsonb)
      into v_keycaps from jsonb_array_elements_text(v_item->'selected_letters') x;
    end if;
    if v_product.letters_required>0 then
      if jsonb_array_length(v_keycaps)<>v_product.letters_required then raise exception 'Choose exactly % keycap(s) for %',v_product.letters_required,v_product.name; end if;
      select a.name into v_base_style from public.alphabet_styles a where a.id=v_product.alphabet_style_id;
      v_upgrade_count:=0;
      for v_style_id,v_letter,v_needed in
        select (x->>'style_id')::uuid,upper(x->>'letter'),count(*)::int*v_quantity
        from jsonb_array_elements(v_keycaps) x group by 1,2
      loop
        if v_letter!~'^[A-Z]$' then raise exception 'Invalid letter choice'; end if;
        select a.name into v_selected_style from public.alphabet_styles a where a.id=v_style_id and a.business_id=v_business_id and a.active;
        if v_selected_style is null then raise exception 'Keycap type not available'; end if;
        select quantity_on_hand into v_available from public.alphabet_letter_inventory
          where style_id=v_style_id and location_id=p_location_id and letter=v_letter for update;
        if coalesce(v_available,0)<v_needed then raise exception 'Only % of % % available',coalesce(v_available,0),v_selected_style,v_letter; end if;
        if lower(coalesce(v_base_style,'')) like '%universal%' and lower(v_selected_style) like '%character%' then
          v_upgrade_count:=v_upgrade_count+(v_needed/v_quantity);
        end if;
      end loop;
    elsif jsonb_array_length(v_keycaps)>0 then raise exception 'Keycaps are not used for this product';
    else v_upgrade_count:=0; end if;

    select exists(select 1 from public.product_variants where product_id=v_product.id and active) into v_has_choices;
    if v_has_choices then
      if nullif(v_item->>'variant_id','') is null then raise exception 'Choose % for %',coalesce(v_product.variant_label,'an option'),v_product.name; end if;
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and active;
      if v_variant.id is null then raise exception 'Choice not found'; end if;
      v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.variant_inventory_levels where variant_id=v_variant.id and location_id=p_location_id for update;
    else
      v_variant:=null; v_price:=coalesce(v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.inventory_levels where product_id=v_product.id and location_id=p_location_id for update;
    end if;
    if v_price is null then raise exception 'Set a price for %',v_product.name; end if;
    if coalesce(v_stock,0)<v_quantity then raise exception 'Only % unit(s) available for %',coalesce(v_stock,0),v_product.name; end if;
    v_price:=v_price+coalesce(v_upgrade_count,0)*v_upgrade;
    v_total:=v_total+v_quantity*v_price;
  end loop;

  insert into public.sales(business_id,location_id,payment_method,total,created_by,payment_confirmed_at,payment_confirmed_by,payment_reference)
  values(v_business_id,p_location_id,p_payment_method,v_total,auth.uid(),case when p_payment_received then now() end,
    case when p_payment_received then auth.uid() end,case when p_payment_method='gcash' then nullif(trim(p_payment_reference),'') end)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
    v_keycaps:=coalesce(v_item->'selected_keycaps','[]'::jsonb);
    if jsonb_array_length(v_keycaps)=0 and jsonb_array_length(coalesce(v_item->'selected_letters','[]'::jsonb))>0 then
      select coalesce(jsonb_agg(jsonb_build_object('style_id',v_product.alphabet_style_id,'letter',upper(x))), '[]'::jsonb)
      into v_keycaps from jsonb_array_elements_text(v_item->'selected_letters') x;
    end if;
    select a.name into v_base_style from public.alphabet_styles a where a.id=v_product.alphabet_style_id;
    select count(*) into v_upgrade_count from jsonb_array_elements(v_keycaps) x join public.alphabet_styles a on a.id=(x->>'style_id')::uuid
      where lower(coalesce(v_base_style,'')) like '%universal%' and lower(a.name) like '%character%';
    if nullif(v_item->>'variant_id','') is not null then select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid; else v_variant:=null; end if;
    v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price)+coalesce(v_upgrade_count,0)*v_upgrade;
    insert into public.sale_items(sale_id,product_id,variant_id,product_name,variant_name,selected_letters,selected_keycaps,quantity,unit_price,line_total)
    values(v_sale_id,v_product.id,v_variant.id,v_product.name,v_variant.name,
      case when jsonb_array_length(v_keycaps)>0 then array(select upper(x->>'letter') from jsonb_array_elements(v_keycaps) x) end,
      case when jsonb_array_length(v_keycaps)>0 then v_keycaps end,v_quantity,v_price,v_quantity*v_price);
    if v_variant.id is not null then
      update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where variant_id=v_variant.id and location_id=p_location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by) values(p_location_id,v_product.id,v_variant.id,'sale',-v_quantity,v_sale_id,auth.uid());
    else
      update public.inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now() where product_id=v_product.id and location_id=p_location_id;
      insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,sale_id,created_by) values(p_location_id,v_product.id,'sale',-v_quantity,v_sale_id,auth.uid());
    end if;
    for v_style_id,v_letter,v_needed in
      select (x->>'style_id')::uuid,upper(x->>'letter'),count(*)::int*v_quantity from jsonb_array_elements(v_keycaps) x group by 1,2
    loop
      update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand-v_needed,updated_at=now() where style_id=v_style_id and location_id=p_location_id and letter=v_letter;
      insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by) values(v_style_id,p_location_id,v_letter,'sale',-v_needed,v_sale_id,auth.uid());
    end loop;
  end loop;
  return v_sale_id;
end $$;

create or replace function public.void_sale(p_sale_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_sale public.sales; v_item public.sale_items; v_style_id uuid; v_letter text; v_needed integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null or not (public.is_business_member(v_sale.business_id) or public.is_platform_admin()) then raise exception 'Shop access required'; end if;
  if v_sale.status<>'completed' then raise exception 'Sale already cancelled'; end if;
  for v_item in select * from public.sale_items where sale_id=p_sale_id loop
    if v_item.variant_id is not null then
      update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now() where variant_id=v_item.variant_id and location_id=v_sale.location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by) values(v_sale.location_id,v_item.product_id,v_item.variant_id,'sale_void',v_item.quantity,p_sale_id,auth.uid());
    else
      update public.inventory_levels set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now() where product_id=v_item.product_id and location_id=v_sale.location_id;
      insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,sale_id,created_by) values(v_sale.location_id,v_item.product_id,'sale_void',v_item.quantity,p_sale_id,auth.uid());
    end if;
    if jsonb_array_length(coalesce(v_item.selected_keycaps,'[]'::jsonb))>0 then
      for v_style_id,v_letter,v_needed in select (x->>'style_id')::uuid,upper(x->>'letter'),count(*)::int*v_item.quantity from jsonb_array_elements(v_item.selected_keycaps) x group by 1,2 loop
        update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand+v_needed,updated_at=now() where style_id=v_style_id and location_id=v_sale.location_id and letter=v_letter;
        insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by) values(v_style_id,v_sale.location_id,v_letter,'sale_void',v_needed,p_sale_id,auth.uid());
      end loop;
    elsif cardinality(v_item.selected_letters)>0 then
      select alphabet_style_id into v_style_id from public.products where id=v_item.product_id;
      for v_letter,v_needed in select x,count(*)::int*v_item.quantity from unnest(v_item.selected_letters) x group by x loop
        update public.alphabet_letter_inventory set quantity_on_hand=quantity_on_hand+v_needed,updated_at=now() where style_id=v_style_id and location_id=v_sale.location_id and letter=v_letter;
        insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by) values(v_style_id,v_sale.location_id,v_letter,'sale_void',v_needed,p_sale_id,auth.uid());
      end loop;
    end if;
  end loop;
  update public.sales set status='voided',voided_by=auth.uid(),voided_at=now() where id=p_sale_id;
end $$;

revoke execute on function public.create_confirmed_sale_with_choices(uuid,jsonb,public.payment_method,boolean,text) from public,anon;
grant execute on function public.create_confirmed_sale_with_choices(uuid,jsonb,public.payment_method,boolean,text) to authenticated;
revoke execute on function public.void_sale(uuid) from public,anon;
grant execute on function public.void_sale(uuid) to authenticated;
