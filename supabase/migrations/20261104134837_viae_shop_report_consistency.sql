do $$declare definition text;begin
 select pg_get_functiondef('public.create_viae_catalogue_sale(uuid,uuid,date,jsonb,public.payment_method,text,boolean,text,numeric,text)'::regprocedure) into definition;
 definition:=replace(definition,'assigned numeric:=0;', 'assigned numeric:=0; cumulative_weight numeric:=0;');
 definition:=replace(definition,'  amount:=case when i=total_items then target-assigned when subtotal>0 then round(target*q*price/subtotal,2) else round(target*q/weights,2) end;',E'  cumulative_weight:=cumulative_weight+case when subtotal>0 then q*price else q end;\n  amount:=case when i=total_items then target-assigned else round(target*cumulative_weight/(case when subtotal>0 then subtotal else weights end),2)-assigned end;');
 execute definition;
end$$;
create or replace function public.viae_tax_summary(b uuid,y integer) returns table(quarter integer,gross_php numeric,sales_count bigint,missing_date_count bigint) language sql stable set search_path='' as $$
 with entries as (
  select t.entry_date as day,t.amount_php as amount,false as missing from public.reseller_trade_entries t join public.businesses bs on bs.id=t.business_id where t.business_id=b and bs.slug='astera' and t.kind='sale' and t.status='completed'
  union all
  select coalesce(o.shipped_at,o.delivered_at,(o.created_at at time zone 'Asia/Manila')::date),o.total_price_php+o.delivery_fee_php,o.shipped_at is null and o.delivered_at is null from public.reseller_preorders o join public.businesses bs on bs.id=o.business_id where o.business_id=b and bs.slug='astera' and o.fulfilment_status in('shipped','delivered')
  union all
  select (s.created_at at time zone 'Asia/Manila')::date,s.total,false from public.sales s where s.business_id=b and b='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and s.status='completed'
  union all
  select coalesce(o.fulfilled_at,o.completed_at,o.created_at)::date,o.total_price,false from public.external_orders o where o.business_id=b and b='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and o.status='completed'
 ) select q,coalesce(sum(e.amount),0),count(e.day),count(e.day) filter(where e.missing) from generate_series(1,4) q left join entries e on extract(year from e.day)=y and extract(quarter from e.day)=q group by q order by q;
$$;

