-- Preserve existing direct sales in Pixel's shared sales/reporting model.
do $$declare r public.reseller_trade_entries; sid uuid; did uuid; stamp timestamptz;begin
 for r in select * from public.reseller_trade_entries where business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and kind='sale' loop
  if exists(select 1 from public.sales where source_reference='viae-legacy-trade:'||r.id) then continue;end if;
  select id into did from public.viae_design_catalogue where business_id=r.business_id and (source_product_id=r.source_product_id or internal_only) order by (source_product_id=r.source_product_id) desc nulls last limit 1;
  if did is null then raise exception 'Internal Custom Order catalogue entry required for historical sales';end if;
  stamp:=(coalesce(r.payment_date,r.entry_date)::text||' 12:00:00+08')::timestamptz;
  insert into public.sales(business_id,location_id,status,payment_method,payment_channel,total,listed_total,created_by,created_at,payment_confirmed_at,payment_confirmed_by,source_reference,notes)
  values(r.business_id,r.location_id,case when r.status='cancelled' then 'voided'::public.sale_status else 'completed'::public.sale_status end,case when r.payment_method='cash' then 'cash'::public.payment_method else 'gcash'::public.payment_method end,case when r.payment_method='cash' then 'Cash' when r.payment_method='gcash' then 'GCash' when r.payment_method='bank' then 'Bank transfer' else 'Other' end,r.amount_php,r.amount_php,r.created_by,stamp,stamp,r.created_by,'viae-legacy-trade:'||r.id,concat_ws(' · ',r.notes,'Historical sale retained from previous VIAE records')) returning id into sid;
  insert into public.sale_items(sale_id,catalogue_design_id,product_name,variant_name,purchase_format,quantity,listed_unit_price,unit_price,line_total)
  values(sid,did,r.product_name,coalesce(nullif(r.variant_name,''),'Digital File'),'digital',r.quantity,round(r.amount_php/r.quantity,2),round(r.amount_php/r.quantity,2),r.amount_php);
  insert into public.sale_receipts(record_kind,record_id,location_id,storage_path) select 'sale',sid,r.location_id,storage_path from public.sale_receipts where record_kind='trade_sale' and record_id=r.id on conflict do nothing;
 end loop;
end$$;
-- Exclude the preserved old source rows from tax totals once represented by a shared sale.
do $$declare definition text;begin
 select pg_get_functiondef('public.viae_tax_summary(uuid,integer)'::regprocedure) into definition;
 definition:=replace(definition,'t.status=''completed''','t.status=''completed'' and not exists(select 1 from public.sales imported where imported.source_reference=''viae-legacy-trade:''||t.id)');
 execute definition;
end$$;
