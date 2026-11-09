alter table public.sale_items alter column product_id drop not null;
alter table public.sale_items add column catalogue_design_id uuid references public.viae_design_catalogue(id), add column purchase_format text, add column listed_unit_price numeric(12,2);
alter table public.sale_items add constraint sale_item_product_required check (product_id is not null or catalogue_design_id is not null);
create index sale_items_catalogue_design_idx on public.sale_items(catalogue_design_id) where catalogue_design_id is not null;
alter table public.sales add column listed_total numeric(12,2), add column total_override_reason text, add column payment_channel text;
alter table public.external_orders add column catalogue_items jsonb not null default '[]';

-- Catalogue sales use the same receipts/items/report tables as Pixel. No invented stock.
create function public.create_viae_catalogue_sale(p_location_id uuid,p_request_id uuid,p_sale_date date,p_items jsonb,p_payment_method public.payment_method,p_payment_channel text,p_payment_received boolean,p_payment_reference text default null,p_final_total numeric default null,p_override_reason text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 b constant uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf'; sale_id uuid; d public.viae_design_catalogue;
 item jsonb; q integer; price numeric; subtotal numeric:=0; weights numeric:=0; target numeric; assigned numeric:=0; amount numeric; i integer:=0; total_items integer; f text; stamp timestamptz; channel text;
begin
 if auth.uid() is null or not public.has_shop_permission(b,'sell') or not public.can_access_location(p_location_id) or not exists(select 1 from public.locations where id=p_location_id and business_id=b and active) then raise exception 'VIAE sales access required';end if;
 if p_request_id is null then raise exception 'Sale request required';end if;
 perform pg_advisory_xact_lock(hashtext('viae-sale:'||p_request_id::text));
 select id into sale_id from public.sales where business_id=b and source_reference='viae-catalogue:'||p_request_id;
 if found then return sale_id;end if;
 if p_sale_date is null or p_sale_date<date '2020-01-01' or p_sale_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Choose today or an earlier sale date';end if;
 if p_payment_method is null or not coalesce(p_payment_received,false) then raise exception 'Confirm payment received';end if;
 channel:=case when p_payment_method='cash' then 'Cash' else p_payment_channel end;
 if channel is null or channel not in ('Cash','Maya','PayPal','Wise','GCash','Bank transfer','Other') then raise exception 'Choose a payment method';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Choose 1 to 100 products';end if;
 total_items:=jsonb_array_length(p_items);
 for item in select value from jsonb_array_elements(p_items) loop
  select * into d from public.viae_design_catalogue where id=(item->>'catalogue_design_id')::uuid and business_id=b and source_present and website_status<>'archived';
  if not found then raise exception 'Catalogue item unavailable';end if;
  q:=(item->>'quantity')::integer;price:=(item->>'unit_price')::numeric;f:=item->>'format';
  if q is null or q<1 or q>100000 or price is null or price<0 or price>10000000 or price<>round(price,2) then raise exception 'Check quantity and unit price';end if;
  if f is null or not ((d.internal_only and f in('custom','custom_digital')) or (not d.internal_only and ((f='digital' and d.digital_enabled) or (f='printed' and d.printed_enabled and d.category<>'Generator')))) then raise exception 'Format unavailable';end if;
  if price=0 and p_final_total is null then raise exception 'Enter product prices or a final sale total';end if;
  subtotal:=subtotal+q*price;weights:=weights+q;
 end loop;
 target:=coalesce(p_final_total,subtotal);
 if target is null or target<=0 or target>100000000 or target<>round(target,2) then raise exception 'Enter a valid final total';end if;
 if p_final_total is not null and nullif(trim(p_override_reason),'') is null then raise exception 'Enter the discount or override reason';end if;
 stamp:=case when p_sale_date=(now() at time zone 'Asia/Manila')::date then now() else (p_sale_date::text||' 12:00:00+08')::timestamptz end;
 insert into public.sales(business_id,location_id,payment_method,payment_channel,total,listed_total,total_override_reason,created_by,created_at,payment_confirmed_at,payment_confirmed_by,payment_reference,source_reference,notes)
 values(b,p_location_id,p_payment_method,channel,target,subtotal,nullif(trim(p_override_reason),''),auth.uid(),stamp,stamp,auth.uid(),nullif(trim(p_payment_reference),''),'viae-catalogue:'||p_request_id,'Completed catalogue sale; already fulfilled') returning id into sale_id;
 for item in select value from jsonb_array_elements(p_items) loop
  i:=i+1;q:=(item->>'quantity')::integer;price:=(item->>'unit_price')::numeric;f:=item->>'format';
  select * into d from public.viae_design_catalogue where id=(item->>'catalogue_design_id')::uuid;
  amount:=case when i=total_items then target-assigned when subtotal>0 then round(target*q*price/subtotal,2) else round(target*q/weights,2) end;
  assigned:=assigned+amount;
  insert into public.sale_items(sale_id,catalogue_design_id,product_name,variant_name,purchase_format,quantity,listed_unit_price,unit_price,line_total)
  values(sale_id,d.id,coalesce(nullif(d.display_title,''),d.title),case when f in('digital','custom_digital') then 'Digital File' else 'Printed by VIAE' end,f,q,price,round(amount/q,2),amount);
 end loop;
 return sale_id;
end$$;
revoke all on function public.create_viae_catalogue_sale(uuid,uuid,date,jsonb,public.payment_method,text,boolean,text,numeric,text) from public,anon;
grant execute on function public.create_viae_catalogue_sale(uuid,uuid,date,jsonb,public.payment_method,text,boolean,text,numeric,text) to authenticated;

-- Cancellation restores stock only for stocked Pixel products.
do $$declare definition text;begin
 select pg_get_functiondef('public.void_sale(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'for v_item in select * from public.sale_items where sale_id=p_sale_id loop','for v_item in select * from public.sale_items where sale_id=p_sale_id and product_id is not null loop');
 execute definition;
end$$;

-- Reuse Pixel orders/payment receipts, with full payment before VIAE production.
do $$declare definition text;begin
 select pg_get_functiondef('public.save_order_with_payment(uuid,boolean,uuid,uuid,jsonb,date,text)'::regprocedure) into definition;
 definition:=replace(definition,'if v_status not in (''completed'',''cancelled'') and v_paid>=v_total*0.5',
 'if v_status not in (''completed'',''cancelled'') and v_paid>=v_total*(case when p_business_id=''3fe4c82d-a659-406b-b290-32d8a49f2bdf'' then 1 else 0.5 end)');
 definition:=replace(definition,'  v_delta := v_paid-v_previous_paid;',E'  if p_business_id=''3fe4c82d-a659-406b-b290-32d8a49f2bdf'' then\n    update public.external_orders set catalogue_items=coalesce(p_order->''catalogue_items'',catalogue_items) where id=p_order_id;\n  end if;\n  v_delta := v_paid-v_previous_paid;');
 execute definition;
end$$;

create function public.guard_viae_pixel_order() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if new.business_id<>'3fe4c82d-a659-406b-b290-32d8a49f2bdf' then return new;end if;
 if not public.has_shop_permission(new.business_id,'orders') then raise exception 'Order access required';end if;
 if new.status in('making','ready','completed') and new.amount_paid<new.total_price then raise exception 'VIAE requires full payment before printing or completion';end if;
 if jsonb_typeof(new.catalogue_items) is distinct from 'array' or jsonb_array_length(new.catalogue_items)>100 then raise exception 'Invalid catalogue selection';end if;
 if tg_op='INSERT' or new.catalogue_items is distinct from old.catalogue_items then
  for item in select value from jsonb_array_elements(new.catalogue_items) loop
   if not exists(select 1 from public.viae_design_catalogue d where d.id=(item->>'catalogue_design_id')::uuid and d.business_id=new.business_id and d.source_present and d.website_status<>'archived' and ((d.printed_enabled and d.category<>'Generator' and item->>'format'='printed') or (d.internal_only and item->>'format'='custom'))) or (item->>'quantity')::integer<1 or (item->>'quantity')::integer>100000 then raise exception 'Select an available printed catalogue item';end if;
  end loop;
 end if;
 return new;
end$$;
create trigger guard_viae_pixel_order before insert or update on public.external_orders for each row execute function public.guard_viae_pixel_order();
revoke all on function public.guard_viae_pixel_order() from public,anon,authenticated;

create function public.guard_viae_order_print_job() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and new.external_order_id is not null and not exists(select 1 from public.external_orders o where o.id=new.external_order_id and o.business_id=new.business_id and o.location_id=new.location_id and o.amount_paid>=o.total_price and o.total_price>0 and o.status<>'cancelled') then raise exception 'Full payment required before VIAE printing';end if;
 return new;
end$$;
create trigger guard_viae_order_print_job before insert or update on public.print_jobs for each row execute function public.guard_viae_order_print_job();
revoke all on function public.guard_viae_order_print_job() from public,anon,authenticated;

-- Retire the reseller profile without deleting any historical financial records.
update public.businesses set business_type='shop',visible_modules=ARRAY['sales','orders','stock','production','reports'] where id='3fe4c82d-a659-406b-b290-32d8a49f2bdf';

