-- Manager passcodes protect sale corrections on shared shop logins.
alter table public.businesses add column if not exists manager_passcode_hash text;
alter table public.sales add column if not exists source_reference text;
create unique index if not exists sales_source_reference_key
  on public.sales(source_reference) where source_reference is not null;

create or replace function public.change_shop_passcode(
  p_business_id uuid, p_current_passcode text, p_new_passcode text
) returns void language plpgsql security definer set search_path=public as $$
declare v_hash text;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Shop access required'; end if;
  if p_new_passcode !~ '^[0-9]{4,8}$' then raise exception 'Use 4 to 8 numbers'; end if;
  select manager_passcode_hash into v_hash from public.businesses where id=p_business_id for update;
  if v_hash is not null and extensions.crypt(p_current_passcode,v_hash)<>v_hash then raise exception 'Current passcode is incorrect'; end if;
  update public.businesses set manager_passcode_hash=extensions.crypt(p_new_passcode,extensions.gen_salt('bf')) where id=p_business_id;
end $$;

create or replace function public.void_sale_with_passcode(p_sale_id uuid,p_passcode text) returns void
language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_hash text;
begin
  select business_id into v_business from public.sales where id=p_sale_id;
  if v_business is null or not public.is_business_owner(v_business) then raise exception 'Shop access required'; end if;
  select manager_passcode_hash into v_hash from public.businesses where id=v_business;
  if v_hash is null or extensions.crypt(p_passcode,v_hash)<>v_hash then raise exception 'Incorrect manager passcode'; end if;
  perform public.void_sale(p_sale_id);
end $$;
grant execute on function public.change_shop_passcode(uuid,text,text) to authenticated;
grant execute on function public.void_sale_with_passcode(uuid,text) to authenticated;

-- Temporary Sebu3D manager passcode. The shop can change it from Mik after deployment.
update public.businesses set manager_passcode_hash=extensions.crypt('1234',extensions.gen_salt('bf'))
where slug='sebu3d' and manager_passcode_hash is null;

-- Historical workbook rows are imported as reporting history only. They deliberately do
-- not create stock movements because the workbook stock figures are a current snapshot.
do $$
declare v_business uuid; v_location uuid; v_user uuid; r record; v_sale uuid; v_product uuid; v_lookup text;
begin
  select id into v_business from public.businesses where slug='sebu3d';
  if v_business is null then return; end if;
  select id into v_location from public.locations where business_id=v_business order by created_at limit 1;
  select user_id into v_user from public.business_memberships where business_id=v_business order by (role='owner') desc,user_id limit 1;
  for r in select * from jsonb_to_recordset($data$
[{"row":3,"date":"2026-08-11","item":"Keyboard Clicker 6 Slots","amount":270,"payment":"cash"},{"row":4,"date":"2026-08-11","item":"Keyboard Clicker 4 Slots","amount":180,"payment":"cash"},{"row":5,"date":"2026-08-11","item":"Keyboard Clicker 4 Slots","amount":180,"payment":"gcash"},{"row":6,"date":"2026-08-11","item":"Keyboard Clicker 4 Slots","amount":180,"payment":"gcash"},{"row":9,"date":"2026-08-11","item":"Pickleball Clicker Damaged","amount":5,"payment":"cash"},{"row":10,"date":"2026-08-11","item":"Pickleball Clicker Damaged","amount":5,"payment":"cash"},{"row":11,"date":"2026-08-12","item":"Keyboard Clicker 1 Slot (Purple)","amount":45,"payment":"cash"},{"row":12,"date":"2026-08-12","item":"Keyboard Clicker 3 Slots (White)","amount":135,"payment":"cash"},{"row":13,"date":"2026-08-12","item":"Keyboard Clicker 4 Slots (Black)","amount":180,"payment":"cash"},{"row":14,"date":"2026-08-12","item":"Keyboard Clicker 4 Slots (Pink)","amount":180,"payment":"cash"},{"row":24,"date":"2026-08-13","item":"Dumpling Clicker","amount":125,"payment":"cash"},{"row":25,"date":"2026-08-13","item":"Glow in the dark Skeleton Keychain","amount":100,"payment":"cash"},{"row":26,"date":"2026-08-13","item":"Hoodie Pen Holder (Gray)","amount":0,"payment":"cash"},{"row":27,"date":"2026-08-13","item":"Hoodie Pen Holder (Red)","amount":250,"payment":"cash"},{"row":28,"date":"2026-08-13","item":"Starfish Fidget Large","amount":200,"payment":"cash"},{"row":29,"date":"2026-08-14","item":"Big Cone Fidget","amount":150,"payment":"cash"},{"row":30,"date":"2026-08-14","item":"Keyboard Clicker 2 Slots (Blue)","amount":90,"payment":"cash"},{"row":31,"date":"2026-08-14","item":"Keyboard Clicker 4 Slots (Pink)","amount":180,"payment":"cash"},{"row":32,"date":"2026-08-14","item":"Rainbow Dragon","amount":500,"payment":"cash"},{"row":33,"date":"2026-08-14","item":"Small Teddy Bear Keychain","amount":80,"payment":"cash"},{"row":34,"date":"2026-08-17","item":"Orange Fidget","amount":249,"payment":"cash"},{"row":35,"date":"2026-08-17","item":"Eiffel Tower","amount":99,"payment":"cash"},{"row":36,"date":"2026-08-17","item":"Keyboard Clicker 4 Slots (Pink)","amount":180,"payment":"cash"},{"row":37,"date":"2026-08-17","item":"Keyboard Clicker 4 Slots (Black)","amount":180,"payment":"cash"},{"row":38,"date":"2026-08-17","item":"Starfish Fidget Medium","amount":149,"payment":"cash"},{"row":39,"date":"2026-08-18","item":"Pickleball Clicker","amount":129,"payment":"cash"},{"row":40,"date":"2026-08-18","item":"Keyboard Clicker 1 Slot (Yellow)","amount":45,"payment":"cash"},{"row":41,"date":"2026-08-18","item":"Keyboard Clicker 1 Slot (Blue)","amount":45,"payment":"cash"},{"row":42,"date":"2026-08-18","item":"Glow in the dark Skeleton Keychain","amount":99,"payment":"cash"},{"row":43,"date":"2026-08-18","item":"Crocs Keychain","amount":59,"payment":"cash"},{"row":44,"date":"2026-08-18","item":"Dumpling Clicker","amount":129,"payment":"gcash"},{"row":45,"date":"2026-08-18","item":"Dumpling Clicker","amount":129,"payment":"gcash"},{"row":46,"date":"2026-08-18","item":"Ice Cream Clicker","amount":129,"payment":"gcash"},{"row":47,"date":"2026-08-18","item":"Keyboard Clicker Character 5 Slots (Pink)","amount":333,"payment":"gcash"},{"row":48,"date":"2026-08-18","item":"Keyboard Clicker 4 Slots (Red)","amount":20,"payment":"gcash"},{"row":49,"date":"2026-08-19","item":"Keyboard Clicker 1 Slot (Black)","amount":45,"payment":"cash"},{"row":50,"date":"2026-08-19","item":"Keyboard Clicker 1 Slot (Blue)","amount":45,"payment":"cash"},{"row":51,"date":"2026-08-19","item":"Dumpling Clicker","amount":129,"payment":"cash"},{"row":52,"date":"2026-08-20","item":"Flexi Octopus","amount":59,"payment":"cash"},{"row":53,"date":"2026-08-20","item":"Leather + 6 Letters","amount":95,"payment":"cash"},{"row":54,"date":"2026-08-21","item":"Pickleball Paddle","amount":59,"payment":"cash"},{"row":55,"date":"2026-08-21","item":"Starfish Fidget Small","amount":79,"payment":"cash"},{"row":56,"date":"2026-08-21","item":"Keyboard Clicker 6 Slots (Orange)","amount":270,"payment":"cash"},{"row":57,"date":"2026-08-21","item":"Glow in the dark Skeleton Keychain","amount":99,"payment":"cash"},{"row":58,"date":"2026-08-21","item":"Pickleball Clicker","amount":129,"payment":"cash"},{"row":59,"date":"2026-08-21","item":"Keyboard Clicker 4 Slots (White)","amount":0,"payment":"cash"},{"row":60,"date":"2026-08-22","item":"1 Color Letter Name (Red)","amount":60,"payment":"gcash"},{"row":61,"date":"2026-08-22","item":"1 Color Letter Name (Black)","amount":60,"payment":"gcash"},{"row":62,"date":"2026-08-22","item":"1 Color Letter Name (Purple)","amount":60,"payment":"gcash"},{"row":63,"date":"2026-08-22","item":"1 Color Letter Name (Pink)","amount":60,"payment":"gcash"},{"row":64,"date":"2026-08-22","item":"1 Color Letter Name (Blue)","amount":60,"payment":"gcash"},{"row":65,"date":"2026-08-22","item":"Crocs Keychain","amount":59,"payment":"cash"},{"row":66,"date":"2026-08-22","item":"Crocs Keychain","amount":59,"payment":"cash"},{"row":67,"date":"2026-08-22","item":"Pickleball Paddle 2x","amount":109,"payment":"cash"},{"row":68,"date":"2026-08-22","item":"Pickleball Clicker","amount":129,"payment":"cash"},{"row":69,"date":"2026-08-22","item":"Gray Dragon","amount":199,"payment":"cash"},{"row":70,"date":"2026-08-22","item":"Egg Fidget","amount":129,"payment":"cash"},{"row":71,"date":"2026-08-22","item":"Small Cone Fidget","amount":99,"payment":"cash"}]
$data$::jsonb) as x(row int,date date,item text,amount numeric,payment text) loop
    if exists(select 1 from public.sales where source_reference='sebu3d-xlsx-sales-row-'||r.row) then continue; end if;
    v_lookup:=regexp_replace(r.item,' \([^)]*\)$','','g');
    if v_lookup='Pickleball Clicker Damaged' then v_lookup:='Pickleball Clicker'; end if;
    if v_lookup='Leather + 6 Letters' then v_lookup:='Leather Keychain + 6 Letters'; end if;
    select id into v_product from public.products where business_id=v_business and lower(name)=lower(v_lookup) limit 1;
    if v_product is null then raise exception 'Historical product not found: %',v_lookup; end if;
    insert into public.sales(business_id,location_id,payment_method,total,notes,created_by,created_at,payment_confirmed_at,source_reference)
    values(v_business,v_location,r.payment::public.payment_method,r.amount,'Imported from SEBU 3D prints.xlsx, Sales row '||r.row,v_user,(r.date::text||' 12:00:00+08')::timestamptz,
      case when r.payment='gcash' then (r.date::text||' 12:00:00+08')::timestamptz else null end,'sebu3d-xlsx-sales-row-'||r.row) returning id into v_sale;
    insert into public.sale_items(sale_id,product_id,product_name,quantity,unit_price,line_total)
    values(v_sale,v_product,r.item,1,r.amount,r.amount);
  end loop;
end $$;
