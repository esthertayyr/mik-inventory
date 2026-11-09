alter table public.source_products add column website_availability text not null default 'preparing' check (website_availability in ('preparing','in_stock'));
create or replace view public.viae_public_catalog with (security_barrier=true) as
select p.id,p.name,p.category_name category,p.english_description description,p.selling_price_php price_php,p.lead_time_text,p.featured,p.updated_at,
 coalesce(images.items,'[]'::jsonb) images,coalesce(options.items,'[]'::jsonb) variants,p.website_availability,
 coalesce((select greatest(0,on_hand-reserved) from public.reseller_stock_summary where source_product_id=p.id and source_product_option_id is null),0) available_stock
from public.source_products p join public.businesses b on b.id=p.business_id
left join lateral (select jsonb_agg(jsonb_build_object('url',image_url,'sort_order',sort_order) order by sort_order,created_at) items from public.source_product_images where source_product_id=p.id) images on true
left join lateral (select jsonb_agg(jsonb_build_object('id',v.id,'name',v.option_value,'price_php',v.selling_price_php,'sort_order',v.sort_order,'available_stock',coalesce((select greatest(0,floor((s.on_hand-s.reserved)::numeric/greatest(v.stock_units,1))) from public.reseller_stock_summary s where s.source_product_id=p.id and s.source_product_option_id=v.id),0)) order by v.sort_order,v.created_at) items from public.source_product_options v where v.source_product_id=p.id) options on true
where p.status='active' and b.status='active' and (lower(b.name)='viae' or lower(coalesce(b.slug,'')) in ('viae','astera') or lower(coalesce(b.login_username,'')) in ('viae','astera'));
-- Public, write-only checkout boundary. Prices, ownership and availability are
-- resolved by the server; no anonymous access to customer/order tables.
create function public.submit_viae_checkout(request uuid, customer text, contact text, address text, items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; p public.source_products%rowtype; v public.source_product_options%rowtype; q integer; price numeric; total numeric:=0; existing_total numeric; line_request uuid; idx integer:=0; order_ids jsonb:='[]'::jsonb; oid uuid; units integer; available bigint;
begin
 if request is null or length(trim(customer)) not between 2 and 120 or length(trim(contact)) not between 5 and 250 or length(trim(address)) not between 5 and 1000 then raise exception 'Enter your name, contact details and delivery address.';end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'Choose 1–30 product options.';end if;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select sum(total_price_php) into existing_total from public.reseller_preorders where notes='Website checkout '||request::text;
 if existing_total is not null then return jsonb_build_object('reference',request,'total_php',existing_total);end if;
 if (select count(*) from public.reseller_preorders where customer_contact=trim(contact) and notes like 'Website checkout %' and created_at>now()-interval '5 minutes')>=30 then raise exception 'Please wait a few minutes before submitting another order.';end if;
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct (x->>'product_id')||coalesce(x->>'variant_id','')) from jsonb_array_elements(items) x) then raise exception 'Combine duplicate options in your cart.';end if;
 for item in select value from jsonb_array_elements(items) loop
  q:=(item->>'quantity')::integer;
  if q is null or q not between 1 and 1000 then raise exception 'Choose a valid quantity.';end if;
  select pr.* into p from public.source_products pr join public.businesses b on b.id=pr.business_id where pr.id=(item->>'product_id')::uuid and pr.status='active' and pr.website_availability='in_stock' and b.status='active' and (lower(b.name)='viae' or lower(coalesce(b.slug,'')) in ('viae','astera') or lower(coalesce(b.login_username,'')) in ('viae','astera')) for update of pr;
  if not found then raise exception 'An item is no longer in stock. Refresh your cart.';end if;
  v:=null;
  if nullif(item->>'variant_id','') is not null then
   select * into v from public.source_product_options where id=(item->>'variant_id')::uuid and source_product_id=p.id;
   if not found then raise exception 'This option is no longer available.';end if;
  elsif exists(select 1 from public.source_product_options where source_product_id=p.id) then raise exception 'Choose an exact option.';end if;
  price:=coalesce(v.selling_price_php,p.selling_price_php); units:=greatest(coalesce(v.stock_units,1),1);
  select greatest(0,on_hand-reserved) into available from public.reseller_stock_summary where source_product_id=p.id and source_product_option_id is not distinct from v.id;
  if price is null or price<=0 then raise exception 'This option needs a confirmed selling price.';end if;
  if coalesce(available,0)<q*units then raise exception 'Not enough stock for %. Refresh your cart or enquire.',p.name;end if;
  idx:=idx+1;line_request:=md5(request::text||':'||idx)::uuid;
  insert into public.reseller_preorders(business_id,location_id,source_product_id,source_product_option_id,customer_name,customer_contact,delivery_address,product_name,selected_options,quantity,total_price_php,deposit_required_php,request_id,notes)
  values(p.business_id,p.location_id,p.id,v.id,trim(customer),trim(contact),trim(address),p.name,v.option_value,q,price*q,price*q,line_request,'Website checkout '||request::text) returning id into oid;
  order_ids:=order_ids||jsonb_build_array(oid);total:=total+price*q;
 end loop;
 return jsonb_build_object('reference',request,'total_php',total);
end $$;
revoke all on function public.submit_viae_checkout(uuid,text,text,text,jsonb) from public;
grant execute on function public.submit_viae_checkout(uuid,text,text,text,jsonb) to anon,authenticated;
