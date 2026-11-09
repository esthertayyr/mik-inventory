CREATE OR REPLACE FUNCTION public.create_viae_catalogue_sale(p_location_id uuid, p_request_id uuid, p_sale_date date, p_items jsonb, p_payment_method public.payment_method, p_payment_channel text, p_payment_received boolean, p_payment_reference text DEFAULT NULL::text, p_final_total numeric DEFAULT NULL::numeric, p_override_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 b constant uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf'; sale_id uuid; d public.viae_design_catalogue;
 item jsonb; q integer; price numeric; subtotal numeric:=0; weights numeric:=0; target numeric; assigned numeric:=0; cumulative_weight numeric:=0; amount numeric; i integer:=0; total_items integer; f text; stamp timestamptz; channel text;
begin
 if auth.uid() is null then raise exception 'Sign in to MIK again before saving this sale.'; end if;
 if not public.has_shop_permission(b,'sell') then raise exception 'Your account needs VIAE sales permission.'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and business_id=b and active)
    or not (public.can_access_location(p_location_id) or public.is_platform_admin())
 then raise exception 'Select an active VIAE location you can access before saving.'; end if;
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
  cumulative_weight:=cumulative_weight+case when subtotal>0 then q*price else q end;
  amount:=case when i=total_items then target-assigned else round(target*cumulative_weight/(case when subtotal>0 then subtotal else weights end),2)-assigned end;
  assigned:=assigned+amount;
  insert into public.sale_items(sale_id,catalogue_design_id,product_name,variant_name,purchase_format,quantity,listed_unit_price,unit_price,line_total)
  values(sale_id,d.id,coalesce(nullif(d.display_title,''),d.title),case when f in('digital','custom_digital') then 'Digital File' else 'Printed by VIAE' end,f,q,price,round(amount/q,2),amount);
 end loop;
 return sale_id;
end$function$

