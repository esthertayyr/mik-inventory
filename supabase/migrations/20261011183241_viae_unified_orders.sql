alter table public.reseller_preorders add column order_channel text not null default 'other'
 check(order_channel in ('website','messenger','walk_in','other'));
alter table public.reseller_preorders add column order_kind text not null default 'preorder'
 check(order_kind in ('ready_stock','preorder'));
update public.reseller_preorders set order_channel='website',order_kind='ready_stock'
 where notes like 'Website checkout %' and fulfilment_status<>'cancelled';

-- Staff-only creation. Never trust the client to classify stock or mark payment.
create or replace function public.create_viae_order(b uuid,l uuid,request uuid,package uuid,contents jsonb,
 customer text,contact text,address text,quantity integer,total numeric,channel text,remarks text)
returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid; pid uuid:=package; line jsonb; pr public.source_products%rowtype;
 vr public.source_product_options%rowtype; product uuid; variant uuid; count_items integer;
 ready boolean; cost numeric;
begin
 if auth.uid() is null or not public.has_shop_permission(b,'orders') then raise exception 'Order access required.';end if;
 if not exists(select 1 from public.businesses where id=b and slug='astera') then raise exception 'Choose VIAE.';end if;
 if not (public.can_access_location(l) or public.is_platform_admin()) or not exists(select 1 from public.locations where id=l and business_id=b) then raise exception 'Location access required.';end if;
 if request is null or quantity is null or quantity not between 1 and 1000 or total is null or total<=0
 or length(trim(coalesce(customer,''))) not between 1 and 120 or channel is null or channel not in('messenger','walk_in','other') then raise exception 'Enter customer, quantity, price and order source.';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text,0));
 select id into oid from public.reseller_preorders where request_id=request and business_id=b;
 if found then return oid;end if;
 if pid is null then
  if contents is null or jsonb_typeof(contents)<>'array' or jsonb_array_length(contents) not between 1 and 30 then raise exception 'Choose products and exact variants.';end if;
  insert into public.reseller_packages(business_id,location_id,name,tier,package_price_php,deposit_required_php,active)
  values(b,l,'Order items · '||trim(customer),'reseller',total/quantity,total/quantity*0.5,true) returning id into pid;
  for line in select value from jsonb_array_elements(contents) loop
   product:=(line->>'product_id')::uuid;variant:=nullif(line->>'option_id','')::uuid;count_items:=(line->>'quantity')::integer;
   if count_items is null or count_items not between 1 and 1000 then raise exception 'Use a whole quantity from 1 to 1000.';end if;
   select * into pr from public.source_products where id=product and business_id=b and status='active';
   if not found then raise exception 'Choose official VIAE products.';end if;
   vr:=null;
   if variant is not null then
    select * into vr from public.source_product_options where id=variant and source_product_id=pr.id;
    if not found then raise exception 'Choose the correct variant.';end if;
   elsif exists(select 1 from public.source_product_options where source_product_id=pr.id) then raise exception 'Choose an exact variant.';end if;
   insert into public.reseller_package_items(business_id,package_id,source_product_id,source_product_option_id,quantity)
   values(b,pid,pr.id,variant,count_items);
  end loop;
 elsif not exists(select 1 from public.reseller_packages where id=pid and business_id=b and active) then raise exception 'Choose an active VIAE package.';end if;
 if not exists(select 1 from public.reseller_package_items where package_id=pid) then raise exception 'Package is empty.';end if;
 select bool_and(coalesce(s.on_hand-s.reserved,0)>=i.needed) into ready
 from (select pi.source_product_id,pi.source_product_option_id,sum(pi.quantity*coalesce(v.stock_units,1)*create_viae_order.quantity) needed
 from public.reseller_package_items pi left join public.source_product_options v on v.id=pi.source_product_option_id
 where pi.package_id=pid group by pi.source_product_id,pi.source_product_option_id) i
 left join public.reseller_stock_summary s on s.business_id=b and s.location_id=l and s.source_product_id=i.source_product_id
 and s.source_product_option_id is not distinct from i.source_product_option_id;
 select coalesce(sum(i.quantity*(coalesce(v.source_price,p.source_price,0)*(1+p.tax_percent/100)+p.shipping_amount/greatest(p.order_quantity,1))*p.currency_to_php_rate),0)*create_viae_order.quantity into cost
 from public.reseller_package_items i join public.source_products p on p.id=i.source_product_id left join public.source_product_options v on v.id=i.source_product_option_id where i.package_id=pid;
 if not ready and total*0.5<cost then raise exception 'The 50%% deposit does not cover buying costs. Review the total price.';end if;
 insert into public.reseller_preorders(business_id,location_id,reseller_package_id,package_name,customer_name,customer_contact,delivery_address,
 product_name,quantity,total_price_php,deposit_required_php,request_id,notes,created_by,order_channel,order_kind,fulfilment_status,arrived_at)
 select b,l,id,name,trim(customer),nullif(trim(contact),''),nullif(trim(address),''),
 case when package is null then 'Selected products' else name end,quantity,total,case when ready then total else total*0.5 end,
 request,nullif(trim(remarks),''),auth.uid(),channel,case when ready then 'ready_stock' else 'preorder' end,
 case when ready then 'arrived' else 'awaiting_deposit' end,case when ready then (now() at time zone 'Asia/Manila')::date else null end
 from public.reseller_packages where id=pid returning id into oid;
 if package is null then update public.reseller_packages set active=false where id=pid;end if;
 return oid;
end $$;
revoke all on function public.create_viae_order(uuid,uuid,uuid,uuid,jsonb,text,text,text,integer,numeric,text,text) from public,anon;
grant execute on function public.create_viae_order(uuid,uuid,uuid,uuid,jsonb,text,text,text,integer,numeric,text,text) to authenticated;

-- Public write-only boundary. Supplier/private prices and customer records remain private.
create or replace function public.submit_viae_checkout(request uuid,customer text,contact text,address text,items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;p public.source_products%rowtype;v public.source_product_options%rowtype;
 q integer;price numeric;total numeric:=0;existing_total numeric;idx integer:=0;oid uuid;units integer;available bigint;ready boolean;deposit_total numeric:=0;
begin
 if request is null or customer is null or contact is null or address is null or length(trim(customer)) not between 2 and 120
 or length(trim(contact)) not between 5 and 250 or length(trim(address)) not between 5 and 1000 then raise exception 'Enter your name, contact details and delivery address.';end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'Choose 1–30 product options.';end if;
 perform pg_advisory_xact_lock(hashtextextended('3fe4c82d-a659-406b-b290-32d8a49f2bdf',0));
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select sum(total_price_php),sum(deposit_required_php) into existing_total,deposit_total from public.reseller_preorders where notes='Website checkout '||request::text;
 if existing_total is not null then return jsonb_build_object('reference',request,'total_php',existing_total,'payment_required_php',deposit_total);end if;
 if (select count(*) from public.reseller_preorders where customer_contact=trim(contact) and order_channel='website' and created_at>now()-interval '5 minutes')>=30 then raise exception 'Please wait a few minutes before submitting another order.';end if;
 if jsonb_array_length(items)<>(select count(distinct (x->>'product_id')||coalesce(x->>'variant_id','')) from jsonb_array_elements(items) x) then raise exception 'Combine duplicate options in your cart.';end if;
 deposit_total:=0;
 for item in select value from jsonb_array_elements(items) order by value->>'product_id',value->>'variant_id' loop
  q:=(item->>'quantity')::integer;
  if q is null or q not between 1 and 1000 then raise exception 'Choose a valid quantity.';end if;
  select pr.* into p from public.source_products pr join public.businesses b on b.id=pr.business_id
  where pr.id=(item->>'product_id')::uuid and pr.status='active' and b.slug='astera' and b.status='active' for update of pr;
  if not found then raise exception 'An item is no longer available. Refresh your cart.';end if;
  v:=null;
  if nullif(item->>'variant_id','') is not null then
   select * into v from public.source_product_options where id=(item->>'variant_id')::uuid and source_product_id=p.id;
   if not found then raise exception 'This option is no longer available.';end if;
  elsif exists(select 1 from public.source_product_options where source_product_id=p.id) then raise exception 'Choose an exact option.';end if;
  price:=coalesce(v.selling_price_php,p.selling_price_php);units:=greatest(coalesce(v.stock_units,1),1);
  if price is null or price<=0 then raise exception 'This option needs a confirmed selling price.';end if;
  select greatest(0,on_hand-reserved) into available from viae_private.stock_counts where source_product_id=p.id and source_product_option_id is not distinct from v.id;
  ready:=coalesce(available,0)>=q*units;
  idx:=idx+1;
  insert into public.reseller_preorders(business_id,location_id,source_product_id,source_product_option_id,customer_name,customer_contact,delivery_address,
  product_name,selected_options,quantity,total_price_php,deposit_required_php,request_id,notes,fulfilment_status,arrived_at,order_channel,order_kind)
  values(p.business_id,p.location_id,p.id,v.id,trim(customer),trim(contact),trim(address),p.name,v.option_value,q,price*q,
  price*q*case when ready then 1 else 0.5 end,md5(request::text||':'||idx)::uuid,'Website checkout '||request::text,
  case when ready then 'arrived' else 'awaiting_deposit' end,case when ready then (now() at time zone 'Asia/Manila')::date else null end,
  'website',case when ready then 'ready_stock' else 'preorder' end) returning id into oid;
  total:=total+price*q;deposit_total:=deposit_total+price*q*case when ready then 1 else 0.5 end;
 end loop;
 return jsonb_build_object('reference',request,'total_php',total,'payment_required_php',deposit_total);
end $$;
