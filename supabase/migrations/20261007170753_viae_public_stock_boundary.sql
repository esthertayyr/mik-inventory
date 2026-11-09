create schema if not exists viae_private;
revoke all on schema viae_private from public,anon,authenticated;
create view viae_private.stock_counts as
select p.id source_product_id,v.id source_product_option_id,
coalesce((select sum(m.pieces) from public.reseller_stock_moves m where m.business_id=p.business_id and m.location_id=p.location_id and m.source_product_id=p.id and m.source_product_option_id is not distinct from v.id),0) on_hand,
coalesce((select sum(s.pieces) from public.reseller_order_stock_lines s join public.reseller_preorders o on o.id=s.order_id where s.source_product_id=p.id and s.source_product_option_id is not distinct from v.id and not o.stock_posted and o.fulfilment_status<>'cancelled' and (select coalesce(sum(amount_php),0) from public.reseller_preorder_payments where preorder_id=o.id)>=o.deposit_required_php),0) reserved
from public.source_products p left join public.source_product_options v on v.source_product_id=p.id where p.status='active';
revoke all on viae_private.stock_counts from public,anon,authenticated;
create or replace view public.viae_public_catalog with (security_barrier=true) as
select p.id,p.name,p.category_name category,p.english_description description,p.selling_price_php price_php,p.lead_time_text,p.featured,p.updated_at,
 coalesce(images.items,'[]'::jsonb) images,coalesce(options.items,'[]'::jsonb) variants,p.website_availability,
 coalesce((select greatest(0,on_hand-reserved) from viae_private.stock_counts where source_product_id=p.id and source_product_option_id is null),0) available_stock
from public.source_products p join public.businesses b on b.id=p.business_id
left join lateral (select jsonb_agg(jsonb_build_object('url',image_url,'sort_order',sort_order) order by sort_order,created_at) items from public.source_product_images where source_product_id=p.id) images on true
left join lateral (select jsonb_agg(jsonb_build_object('id',v.id,'name',v.option_value,'price_php',v.selling_price_php,'sort_order',v.sort_order,'available_stock',coalesce((select greatest(0,floor((s.on_hand-s.reserved)::numeric/greatest(v.stock_units,1))) from viae_private.stock_counts s where s.source_product_id=p.id and s.source_product_option_id=v.id),0)) order by v.sort_order,v.created_at) items from public.source_product_options v where v.source_product_id=p.id) options on true
where p.status='active' and b.status='active' and (lower(b.name)='viae' or lower(coalesce(b.slug,'')) in ('viae','astera') or lower(coalesce(b.login_username,'')) in ('viae','astera'));
