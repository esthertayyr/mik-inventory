create or replace function public.complete_viae_digital_sale(
 b uuid,l uuid,request uuid,items jsonb,total numeric,method text,payment_day date,customer text,remarks text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare line record; p public.source_products%rowtype; expected numeric:=0; allocated numeric:=0;
 amount numeric; idx integer:=0; line_count integer; entry uuid; ids jsonb:='[]'; existing jsonb;
begin
 if auth.uid() is null or not (public.has_shop_permission(b,'sell') or public.has_shop_permission(b,'orders')) then raise exception 'Sales access required.';end if;
 if not exists(select 1 from public.businesses where id=b and slug='astera' and status='active') then raise exception 'Choose VIAE.';end if;
 if not (public.can_access_location(l) or public.is_platform_admin()) or not exists(select 1 from public.locations where id=l and business_id=b) then raise exception 'Location access required.';end if;
 if request is null or items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'Choose digital products.';end if;
 if total is null or total<=0 or total<>round(total,2) or total>10000000 or method is null or method not in ('cash','gcash','bank','other')
 or payment_day is null or payment_day>(now() at time zone 'Asia/Manila')::date or length(trim(coalesce(customer,''))) not between 1 and 120 then raise exception 'Check the price, customer and payment details.';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||request::text,0));
 select jsonb_agg(id) into existing from public.reseller_trade_entries where business_id=b and location_id=l and notes like 'Digital sale '||request::text||E'\n%';
 if existing is not null then return jsonb_build_object('sale_ids',existing,'already_saved',true);end if;
 line_count:=jsonb_array_length(items);
 for line in select value item from jsonb_array_elements(items) loop
  if coalesce(line.item->>'quantity','') !~ '^[0-9]+$' or (line.item->>'quantity')::numeric not between 1 and 1000 then raise exception 'Enter a whole quantity from 1 to 1000.';end if;
  select * into p from public.source_products where id=(line.item->>'product_id')::uuid and business_id=b and platform='Digital / STL File' and status='active' for share;
  if not found or p.selling_price_php is null or p.selling_price_php<=0 then raise exception 'Choose priced, official digital products only. Record physical items separately.';end if;
  expected:=expected+p.selling_price_php*(line.item->>'quantity')::integer;
 end loop;
 if total<line_count*0.01 then raise exception 'Total must cover at least one centavo per sale line.';end if;
 for line in select value item from jsonb_array_elements(items) loop
  idx:=idx+1;
  select * into p from public.source_products where id=(line.item->>'product_id')::uuid and business_id=b;
  amount:=case when idx=line_count then total-allocated else round(total*p.selling_price_php*(line.item->>'quantity')::integer/expected,2) end;
  if amount<=0 then raise exception 'Price allocation is too small. Record items separately.';end if;
  insert into public.reseller_trade_entries(request_id,business_id,location_id,kind,source_product_id,product_name,variant_name,quantity,entry_date,payment_date,payment_method,amount_php,status,created_by,notes)
  values(md5(request::text||':'||idx)::uuid,b,l,'sale',p.id,p.name,'',(line.item->>'quantity')::integer,payment_day,payment_day,method,amount,'completed',auth.uid(),
   'Digital sale '||request::text||E'\nCustomer: '||trim(customer)||E'\n'||left(coalesce(remarks,''),2000)) returning id into entry;
  allocated:=allocated+amount;ids:=ids||jsonb_build_array(entry);
 end loop;
 return jsonb_build_object('sale_ids',ids,'total_php',allocated);
end $$;
revoke all on function public.complete_viae_digital_sale(uuid,uuid,uuid,jsonb,numeric,text,date,text,text) from public,anon;
grant execute on function public.complete_viae_digital_sale(uuid,uuid,uuid,jsonb,numeric,text,date,text,text) to authenticated;
