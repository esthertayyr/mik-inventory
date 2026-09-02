-- Earlier sales may use the price that was actually charged on that date.
-- Normal and event checkout continue to use the current product price.
drop function if exists public.create_backdated_sale_with_choices(
  uuid,jsonb,public.payment_method,boolean,text,date
);

create function public.create_backdated_sale_with_choices(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text,
  p_sale_date date
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_business uuid; v_sale uuid; v_timestamp timestamptz; v_item jsonb;
  v_price numeric(12,2); v_product_id uuid; v_variant_id uuid;
  v_letters text[]; v_updated integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select business_id into v_business from public.locations where id=p_location_id and active;
  if v_business is null
     or not (public.is_business_member(v_business) or public.is_platform_admin()) then
    raise exception 'Shop access required';
  end if;
  if p_sale_date is null or p_sale_date>current_date then raise exception 'Choose today or an earlier date'; end if;
  if p_sale_date<date '2020-01-01' then raise exception 'Choose a valid sale date'; end if;

  -- Stock and keycap rules are still handled by the normal checkout function.
  v_sale:=public.create_confirmed_sale_with_choices(
    p_location_id,p_items,p_payment_method,p_payment_received,p_payment_reference
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item ? 'unit_price' then
      v_price:=(v_item->>'unit_price')::numeric(12,2);
      if v_price is null or v_price<=0 then raise exception 'Enter a price above zero for every product'; end if;
      v_product_id:=(v_item->>'product_id')::uuid;
      v_variant_id:=nullif(v_item->>'variant_id','')::uuid;
      select case when jsonb_array_length(coalesce(v_item->'selected_letters','[]'::jsonb))=0 then null
        else array(select upper(value) from jsonb_array_elements_text(v_item->'selected_letters')) end
      into v_letters;
      update public.sale_items
      set unit_price=v_price,line_total=quantity*v_price
      where sale_id=v_sale and product_id=v_product_id
        and variant_id is not distinct from v_variant_id
        and selected_letters is not distinct from v_letters;
      get diagnostics v_updated=row_count;
      if v_updated<>1 then raise exception 'Could not match the earlier sale price to its product'; end if;
    end if;
  end loop;

  update public.sales set total=(select coalesce(sum(line_total),0) from public.sale_items where sale_id=v_sale)
  where id=v_sale;
  v_timestamp:=(p_sale_date::text||' 12:00:00+08')::timestamptz;
  update public.sales set created_at=v_timestamp,
    payment_confirmed_at=case when payment_confirmed_at is null then null else v_timestamp end,
    notes=concat_ws(' · ',notes,'Past sale entered later') where id=v_sale;
  update public.inventory_movements set created_at=v_timestamp where sale_id=v_sale;
  update public.alphabet_inventory_movements set created_at=v_timestamp where sale_id=v_sale;
  return v_sale;
end $$;

revoke execute on function public.create_backdated_sale_with_choices(
  uuid,jsonb,public.payment_method,boolean,text,date
) from public, anon;
grant execute on function public.create_backdated_sale_with_choices(
  uuid,jsonb,public.payment_method,boolean,text,date
) to authenticated;
