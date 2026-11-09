-- VIAE only: availability is derived from variant stock, receipts and verified reservations.
alter table public.source_products drop constraint source_products_website_availability_check;
alter table public.source_products add constraint source_products_website_availability_check
check (website_availability in ('preparing','incoming','in_stock'));

create or replace view viae_private.stock_counts as
select p.id source_product_id,v.id source_product_option_id,
coalesce((select sum(m.pieces) from public.reseller_stock_moves m where m.business_id=p.business_id and m.location_id=p.location_id and m.source_product_id=p.id and m.source_product_option_id is not distinct from v.id),0) on_hand,
coalesce((select sum(s.pieces) from public.reseller_order_stock_lines s join public.reseller_preorders o on o.id=s.order_id where s.source_product_id=p.id and s.source_product_option_id is not distinct from v.id and not o.stock_posted and o.fulfilment_status<>'cancelled' and (select coalesce(sum(amount_php),0) from public.reseller_preorder_payments where preorder_id=o.id)>=o.deposit_required_php),0) reserved,
coalesce((select sum(t.quantity-t.received_quantity) from public.reseller_trade_entries t where t.business_id=p.business_id and t.location_id=p.location_id and t.source_product_id=p.id and t.source_product_option_id is not distinct from v.id and t.kind='purchase' and t.status<>'cancelled'),0) incoming
from public.source_products p left join public.source_product_options v on v.source_product_id=p.id where p.status='active';
revoke all on viae_private.stock_counts from public,anon,authenticated;

create or replace function viae_private.availability(p uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from viae_private.stock_counts s where s.source_product_id=p and s.on_hand-s.reserved>0) then 'in_stock'
 when exists(select 1 from viae_private.stock_counts s where s.source_product_id=p and s.incoming>0) then 'incoming'
 else 'preparing' end
$$;
revoke all on function viae_private.availability(uuid) from public,anon,authenticated;

create or replace function viae_private.set_availability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.businesses b where b.id=new.business_id and (lower(b.name)='viae' or lower(coalesce(b.slug,'')) in ('viae','astera'))) then
  new.website_availability:=viae_private.availability(new.id);
 end if;
 return new;
end $$;
revoke all on function viae_private.set_availability() from public,anon,authenticated;
create trigger viae_derived_availability before insert or update on public.source_products
for each row execute function viae_private.set_availability();

create or replace function viae_private.refresh_availability() returns trigger
language plpgsql security definer set search_path='' as $$
declare product uuid;
begin
 if tg_table_name='reseller_preorders' then
  for product in select distinct source_product_id from public.reseller_order_stock_lines where order_id=new.id loop
   update public.source_products p set website_availability=viae_private.availability(p.id)
   where p.id=product and p.website_availability is distinct from viae_private.availability(p.id);
  end loop;
 elsif tg_table_name='reseller_preorder_payments' then
  for product in select distinct source_product_id from public.reseller_order_stock_lines where order_id=new.preorder_id loop
   update public.source_products p set website_availability=viae_private.availability(p.id)
   where p.id=product and p.website_availability is distinct from viae_private.availability(p.id);
  end loop;
 else
  update public.source_products p set website_availability=viae_private.availability(p.id)
  where p.id=new.source_product_id and p.website_availability is distinct from viae_private.availability(p.id);
 end if;
 return new;
end $$;
revoke all on function viae_private.refresh_availability() from public,anon,authenticated;
drop trigger if exists sync_viae_receipt_availability on public.reseller_trade_entries;
create trigger zz_viae_trade_availability after insert or update on public.reseller_trade_entries for each row execute function viae_private.refresh_availability();
create trigger zz_viae_order_availability after insert or update on public.reseller_preorders for each row execute function viae_private.refresh_availability();
create trigger zz_viae_payment_availability after insert on public.reseller_preorder_payments for each row execute function viae_private.refresh_availability();
create trigger zz_viae_stock_availability after insert on public.reseller_stock_moves for each row execute function viae_private.refresh_availability();

-- An unpriced official listing is allowed; server checkout still rejects zero/missing prices.
create or replace function public.validate_official_source_product() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='active' then
  if coalesce(new.tax_percent,0)<=0 then raise exception 'Tax is required for an official product.'; end if;
  if length(trim(coalesce(new.english_description,'')))=0 or length(trim(coalesce(new.lead_time_text,'')))=0 then raise exception 'Add product details and waiting time before making it official.'; end if;
  if not exists(select 1 from public.source_product_images where source_product_id=new.id) then raise exception 'Add a photo before making it official.'; end if;
 end if;return new;
end $$;

create or replace function viae_private.guard_order_flow() returns trigger
language plpgsql security invoker set search_path='' as $$
declare paid numeric; line record;
begin
 if old.fulfilment_status='cancelled' and new is distinct from old then raise exception 'Cancelled orders stay in history. Create a new order instead.'; end if;
 if (new.total_price_php,new.deposit_required_php,new.direct_sale) is distinct from (old.total_price_php,old.deposit_required_php,old.direct_sale) then raise exception 'Order price is fixed. Cancel and recreate the order to change it.';end if;
 if new.fulfilment_status=old.fulfilment_status then return new;end if;
 select coalesce(sum(amount_php),0) into paid from public.reseller_preorder_payments where preorder_id=new.id;
 if new.fulfilment_status='cancelled' then return new;end if;
 if paid<new.deposit_required_php then raise exception 'Verify the required customer deposit first.';end if;
 if new.direct_sale and new.fulfilment_status='delivered' then return new;end if;
 if new.fulfilment_status='confirmed' and old.fulfilment_status<>'awaiting_deposit'
 or new.fulfilment_status in ('ordered','in_transit') and old.fulfilment_status not in ('confirmed','ordered')
 or new.fulfilment_status='arrived' and old.fulfilment_status not in ('confirmed','ordered','in_transit')
 or new.fulfilment_status='ready_to_ship' and old.fulfilment_status<>'arrived'
 or new.fulfilment_status='shipped' and old.fulfilment_status<>'ready_to_ship'
 or new.fulfilment_status='delivered' and old.fulfilment_status<>'shipped'
 or new.fulfilment_status='awaiting_deposit'
 then raise exception 'Use the next order action; completed stages cannot be reversed.';end if;
 if new.fulfilment_status in ('arrived','ready_to_ship') then
  for line in select source_product_id,source_product_option_id,sum(pieces) pieces from public.reseller_order_stock_lines where order_id=new.id group by source_product_id,source_product_option_id loop
   if public.reseller_stock_balance(new.business_id,new.location_id,line.source_product_id,line.source_product_option_id)<line.pieces then
    raise exception 'Receive supplier purchases or finish printing first. Marking a customer order arrived does not create stock.';
   end if;
  end loop;
 end if;
 if new.fulfilment_status='ready_to_ship' and (not new.delivery_fee_confirmed or paid<new.total_price_php+new.delivery_fee_php) then raise exception 'Confirm delivery fee and verify the remaining payment first.';end if;
 return new;
end $$;
revoke all on function viae_private.guard_order_flow() from public,anon,authenticated;
create trigger aa_viae_order_flow before update on public.reseller_preorders for each row execute function viae_private.guard_order_flow();

create or replace function viae_private.guard_receipt() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' and new.received_quantity<>0 then raise exception 'Save the purchase first, then record received items.';end if;
 if new.payment_date is not null and new.payment_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Payment date cannot be in the future.';end if;
 return new;
end $$;
revoke all on function viae_private.guard_receipt() from public,anon,authenticated;
create trigger aa_viae_receipt_guard before insert or update on public.reseller_trade_entries for each row execute function viae_private.guard_receipt();

create or replace view public.viae_public_catalog with (security_barrier=true) as
select p.id,p.name,p.category_name category,p.english_description description,p.selling_price_php price_php,p.lead_time_text,p.featured,p.updated_at,
coalesce(images.items,'[]'::jsonb) images,coalesce(options.items,'[]'::jsonb) variants,p.website_availability,
coalesce((select greatest(0,on_hand-reserved) from viae_private.stock_counts where source_product_id=p.id and source_product_option_id is null),0) available_stock
from public.source_products p join public.businesses b on b.id=p.business_id
left join lateral (select jsonb_agg(jsonb_build_object('url',image_url,'sort_order',sort_order) order by sort_order,created_at) items from public.source_product_images where source_product_id=p.id) images on true
left join lateral (select jsonb_agg(jsonb_build_object('id',v.id,'name',v.option_value,'price_php',v.selling_price_php,'sort_order',v.sort_order,
'available_stock',coalesce((select greatest(0,floor((s.on_hand-s.reserved)::numeric/greatest(v.stock_units,1))) from viae_private.stock_counts s where s.source_product_id=p.id and s.source_product_option_id=v.id),0),
'website_availability',coalesce((select case when s.on_hand-s.reserved>=greatest(v.stock_units,1) then 'in_stock' when s.incoming>0 then 'incoming' else 'preparing' end from viae_private.stock_counts s where s.source_product_id=p.id and s.source_product_option_id=v.id),'preparing')) order by v.sort_order,v.created_at) items from public.source_product_options v where v.source_product_id=p.id) options on true
where p.status='active' and b.status='active' and (lower(b.name)='viae' or lower(coalesce(b.slug,'')) in ('viae','astera') or lower(coalesce(b.login_username,'')) in ('viae','astera'));

-- Refresh labels, not stock quantities or publication choices.
update public.source_products p set website_availability=viae_private.availability(p.id)
where p.business_id in (select id from public.businesses where lower(name)='viae' or lower(coalesce(slug,'')) in ('viae','astera'))
and p.website_availability is distinct from viae_private.availability(p.id);
