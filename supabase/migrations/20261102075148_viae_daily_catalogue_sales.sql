do $$declare d text;begin
 select pg_get_functiondef('viae_private.guard_design_order()'::regprocedure) into d;
 d:=replace(d,'if not allowed then raise exception',E'if old.fulfilment_status=''confirmed'' and new.fulfilment_status=''delivered'' and new.design_configuration->>''sale_mode''=''daily'' and new.design_configuration->>''handed_over''=''true'' then allowed:=true;end if;\n if not allowed then raise exception');
 execute d;
end$$;
create function public.record_viae_daily_sale(p_location uuid,p_request uuid,p_date date,p_customer text,p_reference text,p_method text,p_items jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare b uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf'; line jsonb; d public.viae_design_catalogue; n integer:=0; q integer; price numeric; f text; oid uuid; rid uuid; label text;
begin
 if auth.uid() is null or not public.has_shop_permission(b,'orders') then raise exception 'VIAE order access required.';end if;
 if p_request is null or p_date is null or p_date>(now() at time zone 'Asia/Manila')::date or p_method not in('cash','gcash','bank','other') or nullif(trim(p_reference),'') is null then raise exception 'Check the sale date, payment method and reference.';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Choose 1 to 50 sale items.';end if;
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 if exists(select 1 from public.reseller_preorders where business_id=b and design_configuration->>'daily_sale_request'=p_request::text) then return 0;end if;
 for line in select value from jsonb_array_elements(p_items) loop
  select * into d from public.viae_design_catalogue where id=(line->>'id')::uuid and business_id=b and source_present and website_status<>'archived';
  if not found then raise exception 'Choose an available catalogue item.';end if;
  q:=(line->>'quantity')::integer;price:=(line->>'price')::numeric;f:=line->>'format';
  if q is null or q<1 or q>100000 or price is null or price<=0 or price>10000000 or f is null or f not in('digital','printed','custom','custom_digital') then raise exception 'Check quantity, selling price and format.';end if;
  if not d.internal_only and ((f='digital' and not d.digital_enabled) or (f='printed' and not d.printed_enabled) or f in('custom','custom_digital')) then raise exception 'Format not enabled for this design.';end if;
  label:=case when d.internal_only then coalesce(nullif(trim(line->>'title'),''),'Custom Order') else coalesce(nullif(d.display_title,''),d.title) end;
  rid:=md5(p_request::text||':'||n::text)::uuid;
  insert into public.reseller_preorders(business_id,location_id,catalogue_design_id,purchase_format,customer_name,customer_contact,delivery_address,product_name,quantity,total_price_php,deposit_required_php,delivery_fee_php,delivery_fee_confirmed,fulfilment_status,order_kind,order_channel,sale_date,notes,request_id,design_configuration)
  values(b,p_location,d.id,f,coalesce(nullif(trim(p_customer),''),'Walk-in customer'),p_reference,case when f in('printed','custom') then 'Collected / handed over' else null end,label,q,price*q,price*q,0,true,'awaiting_deposit','ready_stock','other',p_date,'Daily sale: already paid and handed over',rid,jsonb_build_object('sale_mode','daily','handed_over',true,'daily_sale_request',p_request));
  select id into oid from public.reseller_preorders where business_id=b and request_id=rid;
  insert into public.reseller_preorder_payments(business_id,location_id,preorder_id,amount_php,payment_type,payment_method,payment_date,reference,request_id)
  values(b,p_location,oid,price*q,'final',p_method,p_date,p_reference,rid);
  update public.reseller_preorders set fulfilment_status='delivered',file_delivery_reference=case when f in('digital','custom_digital') then p_reference else null end,delivered_at=p_date,updated_at=now() where id=oid and business_id=b;
  n:=n+1;
 end loop;
 return n;
end$$;
revoke all on function public.record_viae_daily_sale(uuid,uuid,date,text,text,text,jsonb) from public,anon;
grant execute on function public.record_viae_daily_sale(uuid,uuid,date,text,text,text,jsonb) to authenticated;
