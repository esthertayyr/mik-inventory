-- MIK shop profiles are shared team accounts. Signed-in shop members may record
-- earlier sales and correct sales directly; activity logs retain accountability.
drop function if exists public.create_backdated_sale_with_choices(
  uuid,jsonb,public.payment_method,boolean,text,date,text
);

create function public.create_backdated_sale_with_choices(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text,
  p_sale_date date
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_sale uuid; v_timestamp timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select business_id into v_business from public.locations where id=p_location_id and active;
  if v_business is null
     or not (public.is_business_member(v_business) or public.is_platform_admin()) then
    raise exception 'Shop access required';
  end if;
  if p_sale_date is null or p_sale_date>current_date then raise exception 'Choose today or an earlier date'; end if;
  if p_sale_date<date '2020-01-01' then raise exception 'Choose a valid sale date'; end if;
  v_timestamp:=(p_sale_date::text||' 12:00:00+08')::timestamptz;
  v_sale:=public.create_confirmed_sale_with_choices(
    p_location_id,p_items,p_payment_method,p_payment_received,p_payment_reference
  );
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

create or replace function public.void_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_sale public.sales; v_item public.sale_items; v_style_id uuid; v_letters_required integer; v_letter text; v_needed integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null
     or not (public.is_business_member(v_sale.business_id) or public.is_platform_admin()) then
    raise exception 'Shop access required';
  end if;
  if v_sale.status<>'completed' then raise exception 'Sale already cancelled'; end if;
  for v_item in select * from public.sale_items where sale_id=p_sale_id loop
    select alphabet_style_id,letters_required into v_style_id,v_letters_required
    from public.products where id=v_item.product_id;
    if v_item.variant_id is not null then
      update public.variant_inventory_levels
      set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now()
      where variant_id=v_item.variant_id and location_id=v_sale.location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
      values(v_sale.location_id,v_item.product_id,v_item.variant_id,'sale_void',v_item.quantity,p_sale_id,auth.uid());
    elsif coalesce(v_letters_required,0)<=0 or v_item.product_name like 'Keyboard Clicker%' then
      update public.inventory_levels
      set quantity_on_hand=quantity_on_hand+v_item.quantity,updated_at=now()
      where product_id=v_item.product_id and location_id=v_sale.location_id;
      insert into public.inventory_movements(location_id,product_id,variant_id,movement_type,quantity_change,sale_id,created_by)
      values(v_sale.location_id,v_item.product_id,null,'sale_void',v_item.quantity,p_sale_id,auth.uid());
    end if;
    if cardinality(v_item.selected_letters)>0 then
      for v_letter,v_needed in
        select x,count(*)::int*v_item.quantity from unnest(v_item.selected_letters) x group by x
      loop
        update public.alphabet_letter_inventory
        set quantity_on_hand=quantity_on_hand+v_needed,updated_at=now()
        where style_id=v_style_id and location_id=v_sale.location_id and letter=v_letter;
        insert into public.alphabet_inventory_movements(style_id,location_id,letter,movement_type,quantity_change,sale_id,created_by)
        values(v_style_id,v_sale.location_id,v_letter,'sale_void',v_needed,p_sale_id,auth.uid());
      end loop;
    end if;
  end loop;
  update public.sales set status='voided',voided_by=auth.uid(),voided_at=now() where id=p_sale_id;
end $$;

revoke execute on function public.void_sale(uuid) from public, anon;
grant execute on function public.void_sale(uuid) to authenticated;

-- Old passcode RPCs remain in the schema only for migration compatibility and
-- are no longer callable by shop accounts.
revoke execute on function public.void_sale_with_passcode(uuid,text) from public, anon, authenticated;
revoke execute on function public.change_shop_passcode(uuid,text,text) from public, anon, authenticated;
update public.businesses set manager_passcode_hash=null where manager_passcode_hash is not null;
