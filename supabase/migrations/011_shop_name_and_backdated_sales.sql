-- Rename the Sebu3D shop profile without changing its login or products.
update public.businesses set name='3D Prints' where slug='sebu3d';

-- A missed sale uses the normal stock-safe checkout, then is placed on its true
-- calendar date. The separate manager passcode protects shared shop logins.
create or replace function public.create_backdated_sale_with_choices(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text,
  p_sale_date date,
  p_passcode text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_hash text; v_sale uuid; v_timestamp timestamptz;
begin
  select business_id into v_business from public.locations where id=p_location_id and active;
  if v_business is null or not public.is_business_owner(v_business) then raise exception 'Shop access required'; end if;
  select manager_passcode_hash into v_hash from public.businesses where id=v_business;
  if v_hash is null or extensions.crypt(p_passcode,v_hash)<>v_hash then raise exception 'Incorrect manager passcode'; end if;
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

grant execute on function public.create_backdated_sale_with_choices(
  uuid,jsonb,public.payment_method,boolean,text,date,text
) to authenticated;
