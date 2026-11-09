create or replace function public.submit_viae_checkout(request uuid, customer text, contact text, address text, items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; p public.source_products%rowtype; v public.source_product_options%rowtype; q integer; price numeric; total numeric:=0; existing_total numeric; line_request uuid; idx integer:=0; order_ids jsonb:='[]'::jsonb; oid uuid; units integer; available bigint;
begin
 if request is null or customer is null or contact is null or address is null or length(trim(customer)) not between 2 and 120 or length(trim(contact)) not between 5 and 250 or length(trim(address)) not between 5 and 1000 then raise exception 'Enter your name, contact details and delivery address.';end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'Choose 1–30 product options.';end if;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select sum(total_price_php) into existing_total from public.reseller_preorders where notes='Website checkout '||request::text;
 if existing_total is not null then return jsonb_build_object('reference',request,'total_php',existing_total);end if;
 if (select count(*) from public.reseller_preorders where customer_contact=trim(contact) and notes like 'Website checkout %' and created_at>now()-interval '5 minutes')>=30 then raise exception 'Please wait a few minutes before submitting another order.';end if;
 if (select count(*) from jsonb_array_elements(items))<>(select count(distinct (x->>'product_id')||coalesce(x->>'variant_id','')) from jsonb_array_elements(items) x) then raise exception 'Combine duplicate options in your cart.';end if;
 for item in select value from jsonb_array_elements(items) order by value->>'product_id',value->>'variant_id' loop
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
  select greatest(0,on_hand-reserved) into available from viae_private.stock_counts where source_product_id=p.id and source_product_option_id is not distinct from v.id;
  if price is null or price<=0 then raise exception 'This option needs a confirmed selling price.';end if;
  if coalesce(available,0)<q*units then raise exception 'Not enough stock for %. Refresh your cart or enquire.',p.name;end if;
  idx:=idx+1;line_request:=md5(request::text||':'||idx)::uuid;
  insert into public.reseller_preorders(business_id,location_id,source_product_id,source_product_option_id,customer_name,customer_contact,delivery_address,product_name,selected_options,quantity,total_price_php,deposit_required_php,request_id,notes,fulfilment_status,arrived_at)
  values(p.business_id,p.location_id,p.id,v.id,trim(customer),trim(contact),trim(address),p.name,v.option_value,q,price*q,price*q,line_request,'Website checkout '||request::text,'arrived',(now() at time zone 'Asia/Manila')::date) returning id into oid;
  order_ids:=order_ids||jsonb_build_array(oid);total:=total+price*q;
 end loop;
 return jsonb_build_object('reference',request,'total_php',total);
end $$;
revoke all on function public.submit_viae_checkout(uuid,text,text,text,jsonb) from public;
grant execute on function public.submit_viae_checkout(uuid,text,text,text,jsonb) to anon,authenticated;
