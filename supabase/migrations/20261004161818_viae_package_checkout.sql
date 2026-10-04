alter table public.reseller_preorders add column request_id uuid unique;
alter table public.reseller_preorders add column direct_sale boolean not null default false;
create function public.create_reseller_package_order(b uuid,l uuid,request uuid,package uuid,contents jsonb,customer text,contact text,address text,quantity integer,total numeric,paid_now boolean,payment_day date,method text,remarks text) returns uuid
language plpgsql security definer set search_path='' as $$
declare order_id uuid;selected_package_id uuid:=package;count_packages integer:=quantity;line jsonb;p public.source_products%rowtype;v public.source_product_options%rowtype;estimated_cost numeric:=0;item_count integer;option_id uuid;product_id uuid;
begin
 if not public.has_shop_permission(b,case when paid_now then 'sell' else 'orders' end) then raise exception 'Your account cannot create this order.';end if;
 if not exists(select 1 from public.locations where id=l and business_id=b) then raise exception 'Choose a location belonging to this shop.';end if;
 if quantity is null or quantity<=0 or total is null or total<=0 or length(trim(coalesce(customer,'')))=0 or request is null then raise exception 'Customer, quantity and full price are required.';end if;
 if paid_now and (payment_day is null or method not in('cash','gcash','bank','other')) then raise exception 'Choose a payment date and method.';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text,0));
 select id into order_id from public.reseller_preorders where request_id=request and business_id=b;
 if found then return order_id;end if;
 if selected_package_id is null then
  if jsonb_typeof(contents)<>'array' or jsonb_array_length(contents)=0 then raise exception 'Add products to the custom package.';end if;
  insert into public.reseller_packages(business_id,location_id,name,tier,package_price_php,deposit_required_php,active)
  values(b,l,'Custom package · '||trim(customer),'reseller',total/count_packages,total/count_packages*0.5,true) returning id into selected_package_id;
  for line in select value from jsonb_array_elements(contents) loop
   product_id:=(line->>'product_id')::uuid;option_id:=nullif(line->>'option_id','')::uuid;item_count:=(line->>'quantity')::integer;
   if item_count is null or item_count<=0 then raise exception 'Use positive whole quantities for each selection.';end if;
   select * into p from public.source_products where id=product_id and business_id=b and status='active';
   if not found then raise exception 'Choose official products from this shop.';end if;
   v:=null;
   if option_id is not null then select * into v from public.source_product_options where id=option_id and source_product_id=p.id;if not found then raise exception 'Choose the correct product variant.';end if;end if;
   insert into public.reseller_package_items(business_id,package_id,source_product_id,source_product_option_id,quantity) values(b,selected_package_id,p.id,option_id,item_count);
  end loop;
 elsif not exists(select 1 from public.reseller_packages where id=selected_package_id and business_id=b and active) then raise exception 'Choose an active set package.';
 end if;
 select coalesce(sum(i.quantity*(coalesce(v.source_price,p.source_price,0)*(1+p.tax_percent/100)+p.shipping_amount/greatest(p.order_quantity,1))*p.currency_to_php_rate),0)*count_packages into estimated_cost
 from public.reseller_package_items i join public.source_products p on p.id=i.source_product_id left join public.source_product_options v on v.id=i.source_product_option_id where i.package_id=selected_package_id;
 if not paid_now and total*0.5<estimated_cost then raise exception 'The 50%% deposit does not cover estimated buying costs. Increase the full price or reduce the package contents.';end if;
 insert into public.reseller_preorders(business_id,location_id,reseller_package_id,package_name,customer_name,customer_contact,delivery_address,product_name,quantity,total_price_php,deposit_required_php,request_id,direct_sale,notes,created_by)
 select b,l,id,name,trim(customer),nullif(trim(contact),''),nullif(trim(address),''),name,count_packages,total,total*0.5,request,paid_now,nullif(trim(remarks),''),auth.uid() from public.reseller_packages where id=selected_package_id returning id into order_id;
 if paid_now then
  insert into public.reseller_preorder_payments(preorder_id,business_id,location_id,payment_type,amount_php,payment_method,payment_date,created_by) values(order_id,b,l,'final',total,method,payment_day,auth.uid());
  update public.reseller_preorders set fulfilment_status='delivered',delivery_fee_confirmed=true,delivery_fee_php=0,delivered_at=payment_day where id=order_id;
 end if;
 if package is null then update public.reseller_packages set active=false where id=selected_package_id;end if;
 return order_id;
end $$;
revoke all on function public.create_reseller_package_order(uuid,uuid,uuid,uuid,jsonb,text,text,text,integer,numeric,boolean,date,text,text) from public,anon;
grant execute on function public.create_reseller_package_order(uuid,uuid,uuid,uuid,jsonb,text,text,text,integer,numeric,boolean,date,text,text) to authenticated;
