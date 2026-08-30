-- Event checkout records clicker bases immediately but defers the individual
-- A-Z keycap count until the quieter end-of-event stock check.
create or replace function public.create_event_sale(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_product public.products;
  v_variant public.product_variants;
  v_quantity integer;
  v_price numeric(12,2);
  v_stock integer;
  v_total numeric(12,2):=0;
  v_has_choices boolean;
  v_defer_letters boolean;
begin
  if p_payment_method='gcash' and not coalesce(p_payment_received,false) then
    raise exception 'Confirm that the GCash payment was received';
  end if;
  select l.business_id into v_business_id
  from public.locations l
  join public.business_memberships m on m.business_id=l.business_id
  where l.id=p_location_id and l.active and m.user_id=auth.uid()
    and (m.role='owner' or m.default_location_id=l.id);
  if v_business_id is null then raise exception 'Location not available'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer;
    if v_quantity<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products
    where id=(v_item->>'product_id')::uuid and business_id=v_business_id and active;
    if v_product.id is null then raise exception 'Product not found'; end if;
    v_defer_letters:=coalesce((v_item->>'defer_letters')::boolean,false);
    if v_product.letters_required>0 and (not v_defer_letters or v_product.name not like 'Keyboard Clicker%') then
      raise exception 'Event clicker letters must be checked after the event';
    end if;

    select exists(select 1 from public.product_variants where product_id=v_product.id and active) into v_has_choices;
    if v_has_choices then
      if nullif(v_item->>'variant_id','') is null then
        raise exception 'Choose % for %',coalesce(v_product.variant_label,'an option'),v_product.name;
      end if;
      select * into v_variant from public.product_variants
      where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and active;
      if v_variant.id is null then raise exception 'Choice not found'; end if;
      v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.variant_inventory_levels
      where variant_id=v_variant.id and location_id=p_location_id for update;
    else
      v_variant:=null;
      v_price:=coalesce(v_product.sale_price,v_product.regular_price);
      select quantity_on_hand into v_stock from public.inventory_levels
      where product_id=v_product.id and location_id=p_location_id for update;
    end if;
    if v_price is null then raise exception 'Set a price for %',v_product.name; end if;
    if coalesce(v_stock,0)<v_quantity then
      raise exception 'Only % unit(s) available for %',coalesce(v_stock,0),v_product.name;
    end if;
    v_total:=v_total+v_quantity*v_price;
  end loop;

  insert into public.sales(
    business_id,location_id,payment_method,total,created_by,
    payment_confirmed_at,payment_confirmed_by,payment_reference,source_reference
  ) values(
    v_business_id,p_location_id,p_payment_method,v_total,auth.uid(),
    case when p_payment_received then now() end,
    case when p_payment_received then auth.uid() end,
    case when p_payment_method='gcash' then nullif(trim(p_payment_reference),'') end,
    'event'
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
    if nullif(v_item->>'variant_id','') is not null then
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid;
    else v_variant:=null; end if;
    v_price:=coalesce(v_variant.price_override,v_product.sale_price,v_product.regular_price);
    insert into public.sale_items(
      sale_id,product_id,variant_id,product_name,variant_name,selected_letters,
      quantity,unit_price,line_total
    ) values(
      v_sale_id,v_product.id,v_variant.id,v_product.name,v_variant.name,null,
      v_quantity,v_price,v_quantity*v_price
    );
    if v_variant.id is not null then
      update public.variant_inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now()
      where variant_id=v_variant.id and location_id=p_location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
      values(p_location_id,v_product.id,v_variant.id,'sale',-v_quantity,v_sale_id,auth.uid());
    else
      update public.inventory_levels set quantity_on_hand=quantity_on_hand-v_quantity,updated_at=now()
      where product_id=v_product.id and location_id=p_location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
      values(p_location_id,v_product.id,null,'sale',-v_quantity,v_sale_id,auth.uid());
    end if;
  end loop;
  return v_sale_id;
end $$;

revoke execute on function public.create_event_sale(uuid,jsonb,public.payment_method,boolean,text) from public, anon;
grant execute on function public.create_event_sale(uuid,jsonb,public.payment_method,boolean,text) to authenticated;
