alter table public.source_product_options add column stock_units integer not null default 1 check(stock_units>0);
alter table public.source_products add column default_pack_size integer not null default 1 check(default_pack_size>0);
alter table public.reseller_trade_entries add column stock_pieces integer not null default 0;
alter table public.reseller_preorders add column source_product_option_id uuid references public.source_product_options(id);
alter table public.reseller_preorders add column stock_posted boolean not null default false;

create table public.reseller_order_stock_lines (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.reseller_preorders(id),
 business_id uuid not null references public.businesses(id),location_id uuid not null references public.locations(id),
 source_product_id uuid not null references public.source_products(id),source_product_option_id uuid references public.source_product_options(id),
 product_name text not null,variant_name text not null default '',pieces integer not null check(pieces>0)
);
create index reseller_order_lines_parent on public.reseller_order_stock_lines(order_id);
create index reseller_order_lines_sku on public.reseller_order_stock_lines(business_id,location_id,source_product_id,source_product_option_id);
alter table public.reseller_order_stock_lines enable row level security;
revoke all on public.reseller_order_stock_lines from public,anon,authenticated;
grant select on public.reseller_order_stock_lines to authenticated;
create policy order_lines_read on public.reseller_order_stock_lines for select to authenticated using(public.is_business_member(business_id) or public.is_platform_admin());

create table public.reseller_stock_moves (
 id uuid primary key default gen_random_uuid(),event_key text not null unique,
 business_id uuid not null references public.businesses(id),location_id uuid not null references public.locations(id),
 source_product_id uuid not null references public.source_products(id),source_product_option_id uuid references public.source_product_options(id),
 pieces integer not null check(pieces<>0),reason text not null,created_by uuid default auth.uid() references auth.users(id),created_at timestamptz not null default now()
);
create index reseller_stock_moves_sku on public.reseller_stock_moves(business_id,location_id,source_product_id,source_product_option_id);
alter table public.reseller_stock_moves enable row level security;
revoke all on public.reseller_stock_moves from public,anon,authenticated;
grant select on public.reseller_stock_moves to authenticated;
create policy stock_moves_read on public.reseller_stock_moves for select to authenticated using(public.is_business_member(business_id) or public.is_platform_admin());

create table public.reseller_print_jobs (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),location_id uuid not null references public.locations(id),
 source_product_id uuid not null references public.source_products(id),source_product_option_id uuid references public.source_product_options(id),
 order_id uuid references public.reseller_preorders(id),product_name text not null,variant_name text not null default '',
 quantity integer not null check(quantity>0),completed_quantity integer not null default 0 check(completed_quantity>=0 and completed_quantity<=quantity),
 status text not null default 'to_make' check(status in('to_make','ready','cancelled')),notes text,created_at timestamptz not null default now(),
 check(status<>'ready' or completed_quantity=quantity)
);
create index reseller_print_business on public.reseller_print_jobs(business_id,location_id);
create index reseller_print_order on public.reseller_print_jobs(order_id);
alter table public.reseller_print_jobs enable row level security;
revoke all on public.reseller_print_jobs from public,anon;
grant select,insert,update on public.reseller_print_jobs to authenticated;
create policy print_read on public.reseller_print_jobs for select to authenticated using(public.is_business_member(business_id) or public.is_platform_admin());
create policy print_add on public.reseller_print_jobs for insert to authenticated with check(public.has_shop_permission(business_id,'products'));
create policy print_update on public.reseller_print_jobs for update to authenticated using(public.has_shop_permission(business_id,'products')) with check(public.has_shop_permission(business_id,'products'));

create function public.reseller_stock_balance(b uuid,l uuid,p uuid,o uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(pieces),0) from public.reseller_stock_moves where business_id=b and location_id=l and source_product_id=p and source_product_option_id is not distinct from o;
$$;
create function public.reseller_reserved_pieces(b uuid,l uuid,p uuid,v uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(s.pieces),0) from public.reseller_order_stock_lines s join public.reseller_preorders o on o.id=s.order_id
 where s.business_id=b and s.location_id=l and s.source_product_id=p and s.source_product_option_id is not distinct from v
 and not o.stock_posted and o.fulfilment_status<>'cancelled'
 and (select coalesce(sum(amount_php),0) from public.reseller_preorder_payments where preorder_id=o.id)>=o.deposit_required_php;
$$;
revoke all on function public.reseller_stock_balance(uuid,uuid,uuid,uuid),public.reseller_reserved_pieces(uuid,uuid,uuid,uuid) from public,anon,authenticated;

create function public.post_reseller_trade_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare delta integer:=0; units integer:=1; balance bigint;reserved bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,0));
 if tg_op='INSERT' then
  if new.source_product_option_id is not null then select stock_units into units from public.source_product_options where id=new.source_product_option_id;end if;
  new.stock_pieces:=new.quantity*units;
  if new.kind='sale' and new.status='completed' then delta:=-new.stock_pieces;end if;
 else
  new.stock_pieces:=old.stock_pieces;
  if new.kind='sale' and old.status='completed' and new.status='cancelled' then delta:=old.stock_pieces;
  elsif new.kind='purchase' then
   if new.status='cancelled' and old.status<>'cancelled' then delta:=-old.received_quantity;
   elsif new.status<>'cancelled' then
    if new.received_quantity<old.received_quantity then raise exception 'Use a stock correction to remove received pieces.';end if;
    delta:=new.received_quantity-old.received_quantity;
   end if;
  end if;
 end if;
 if delta<>0 then
  balance:=public.reseller_stock_balance(new.business_id,new.location_id,new.source_product_id,new.source_product_option_id);
  reserved:=public.reseller_reserved_pieces(new.business_id,new.location_id,new.source_product_id,new.source_product_option_id);
  if delta<0 and balance+delta<reserved then raise exception 'Not enough available pieces. Receive or finish printing stock first, or release customer reservations.';end if;
  insert into public.reseller_stock_moves(event_key,business_id,location_id,source_product_id,source_product_option_id,pieces,reason)
   values('trade:'||new.id||':'||new.status||':'||new.received_quantity,new.business_id,new.location_id,new.source_product_id,new.source_product_option_id,delta,case when new.kind='sale' then 'Direct sale / correction' else 'Supplier receipt / correction' end);
 end if;return new;
end $$;
create trigger zz_post_trade_stock before insert or update on public.reseller_trade_entries for each row execute function public.post_reseller_trade_stock();
revoke all on function public.post_reseller_trade_stock() from public,anon,authenticated;

create function public.snapshot_reseller_order_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.source_products%rowtype;v public.source_product_options%rowtype;
begin
 if new.stock_posted then raise exception 'New orders cannot already be deducted from stock.';end if;
 if new.total_price_php<=0 or new.deposit_required_php<=0 or new.deposit_required_php>new.total_price_php then raise exception 'Enter a positive order price and a deposit no greater than the full price.';end if;
 if not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then raise exception 'Choose a location belonging to this shop.';end if;
 if new.reseller_package_id is not null then
  if not exists(select 1 from public.reseller_packages where id=new.reseller_package_id and business_id=new.business_id and active) then raise exception 'Choose an active package from this shop.';end if;
  if exists(select 1 from public.reseller_package_items i join public.source_products p on p.id=i.source_product_id where i.package_id=new.reseller_package_id and p.status<>'active') then raise exception 'This package contains a product that is not official.';end if;
  insert into public.reseller_order_stock_lines(order_id,business_id,location_id,source_product_id,source_product_option_id,product_name,variant_name,pieces)
  select new.id,new.business_id,new.location_id,p.id,v.id,p.name,coalesce(v.option_value,''),new.quantity*i.quantity*coalesce(v.stock_units,1)
  from public.reseller_package_items i join public.source_products p on p.id=i.source_product_id left join public.source_product_options v on v.id=i.source_product_option_id
  where i.package_id=new.reseller_package_id and i.business_id=new.business_id;
 else
  select * into p from public.source_products where id=new.source_product_id and business_id=new.business_id and status='active';
  if not found then raise exception 'Choose an official product or reseller package.';end if;
  if new.source_product_option_id is not null then select * into v from public.source_product_options where id=new.source_product_option_id and source_product_id=p.id;if not found then raise exception 'Choose an exact variant of this product.';end if;
  elsif exists(select 1 from public.source_product_options where source_product_id=p.id) then raise exception 'Choose the exact variant.';end if;
  insert into public.reseller_order_stock_lines(order_id,business_id,location_id,source_product_id,source_product_option_id,product_name,variant_name,pieces)
  values(new.id,new.business_id,new.location_id,p.id,v.id,p.name,coalesce(v.option_value,''),new.quantity*coalesce(v.stock_units,1));
 end if;
 if not exists(select 1 from public.reseller_order_stock_lines where order_id=new.id) then raise exception 'Add products to the package before accepting an order.';end if;
 return new;
end $$;
create trigger snapshot_order_stock after insert on public.reseller_preorders for each row execute function public.snapshot_reseller_order_stock();
revoke all on function public.snapshot_reseller_order_stock() from public,anon,authenticated;

create function public.fulfil_reseller_order_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;paid numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,0));
 if (new.business_id,new.location_id,new.source_product_id,new.source_product_option_id,new.reseller_package_id,new.quantity) is distinct from (old.business_id,old.location_id,old.source_product_id,old.source_product_option_id,old.reseller_package_id,old.quantity) then raise exception 'Order contents are fixed. Cancel and create a new order to change them.';end if;
 new.stock_posted:=old.stock_posted;
 if old.stock_posted and new.fulfilment_status not in('shipped','delivered') then raise exception 'This order was already shipped. Record any returned pieces as a stock correction.';end if;
 if not old.stock_posted and new.fulfilment_status in('shipped','delivered') then
  select coalesce(sum(amount_php),0) into paid from public.reseller_preorder_payments where preorder_id=new.id;
  if not new.delivery_fee_confirmed or paid<new.total_price_php+new.delivery_fee_php then raise exception 'Confirm local delivery cost and collect the full balance before shipping.';end if;
  if not exists(select 1 from public.reseller_order_stock_lines where order_id=new.id) then raise exception 'This order has no stock details. Contact the owner.';end if;
  for item in select source_product_id,source_product_option_id,sum(pieces)::integer pieces from public.reseller_order_stock_lines where order_id=new.id group by source_product_id,source_product_option_id order by source_product_id loop
   if public.reseller_stock_balance(new.business_id,new.location_id,item.source_product_id,item.source_product_option_id)<item.pieces then raise exception 'Not enough received or printed stock to ship this order.';end if;
   insert into public.reseller_stock_moves(event_key,business_id,location_id,source_product_id,source_product_option_id,pieces,reason)
   values('order:'||new.id||':'||item.source_product_id||':'||coalesce(item.source_product_option_id::text,'unit'),new.business_id,new.location_id,item.source_product_id,item.source_product_option_id,-item.pieces,'Customer order shipped');
  end loop;
  new.stock_posted:=true;
 end if;return new;
end $$;
create trigger fulfil_order_stock before update on public.reseller_preorders for each row execute function public.fulfil_reseller_order_stock();
revoke all on function public.fulfil_reseller_order_stock() from public,anon,authenticated;

create function public.post_reseller_print_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.source_products%rowtype;delta integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,0));
 select * into p from public.source_products where id=new.source_product_id and business_id=new.business_id and status='active';
 if not found then raise exception 'Choose an official product.';end if;
 if not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then raise exception 'Location does not belong to this shop.';end if;
 if new.source_product_option_id is not null and not exists(select 1 from public.source_product_options where id=new.source_product_option_id and source_product_id=p.id) then raise exception 'Choose a variant of this product.';end if;
 if new.source_product_option_id is null and exists(select 1 from public.source_product_options where source_product_id=p.id) then raise exception 'Choose an exact variant.';end if;
 if new.order_id is not null and not exists(select 1 from public.reseller_order_stock_lines s join public.reseller_preorders o on o.id=s.order_id where s.order_id=new.order_id and s.business_id=new.business_id and s.location_id=new.location_id and s.source_product_id=p.id and s.source_product_option_id is not distinct from new.source_product_option_id and o.fulfilment_status<>'cancelled') then raise exception 'Choose a product included in this customer order.';end if;
 if tg_op='INSERT' then new.product_name:=p.name;new.variant_name:=coalesce((select option_value from public.source_product_options where id=new.source_product_option_id),'');delta:=new.completed_quantity;
 else
  if (new.business_id,new.location_id,new.source_product_id,new.source_product_option_id,new.order_id,new.quantity) is distinct from (old.business_id,old.location_id,old.source_product_id,old.source_product_option_id,old.order_id,old.quantity) then raise exception 'Keep the original job details. Create another job for extra pieces.';end if;
  if new.completed_quantity<old.completed_quantity then raise exception 'Use a stock correction to remove completed pieces.';end if;
  if old.status='cancelled' and new is distinct from old then raise exception 'Cancelled jobs cannot be changed.';end if;
  delta:=new.completed_quantity-old.completed_quantity;
 end if;
 if delta>0 then insert into public.reseller_stock_moves(event_key,business_id,location_id,source_product_id,source_product_option_id,pieces,reason) values('print:'||new.id||':'||new.completed_quantity,new.business_id,new.location_id,new.source_product_id,new.source_product_option_id,delta,'Printing completed');end if;
 return new;
end $$;
create trigger post_print_stock before insert or update on public.reseller_print_jobs for each row execute function public.post_reseller_print_stock();
revoke all on function public.post_reseller_print_stock() from public,anon,authenticated;

create view public.reseller_stock_summary with(security_invoker=true) as
 select p.business_id,p.location_id,p.id source_product_id,v.id source_product_option_id,p.name product_name,coalesce(v.option_value,'') variant_name,p.default_pack_size,
 coalesce((select sum(m.pieces) from public.reseller_stock_moves m where m.business_id=p.business_id and m.location_id=p.location_id and m.source_product_id=p.id and m.source_product_option_id is not distinct from v.id),0)::bigint on_hand,
 coalesce((select sum(t.quantity-t.received_quantity) from public.reseller_trade_entries t where t.business_id=p.business_id and t.location_id=p.location_id and t.source_product_id=p.id and t.source_product_option_id is not distinct from v.id and t.kind='purchase' and t.status<>'cancelled'),0)::bigint incoming,
 coalesce((select sum(s.pieces) from public.reseller_order_stock_lines s join public.reseller_preorders o on o.id=s.order_id where s.business_id=p.business_id and s.location_id=p.location_id and s.source_product_id=p.id and s.source_product_option_id is not distinct from v.id and not o.stock_posted and o.fulfilment_status<>'cancelled' and (select coalesce(sum(amount_php),0) from public.reseller_preorder_payments where preorder_id=o.id)>=o.deposit_required_php),0)::bigint reserved,
 coalesce((select sum(j.quantity-j.completed_quantity) from public.reseller_print_jobs j where j.business_id=p.business_id and j.location_id=p.location_id and j.source_product_id=p.id and j.source_product_option_id is not distinct from v.id and j.status='to_make'),0)::bigint to_make
 from public.source_products p left join public.source_product_options v on v.source_product_id=p.id where p.status='active';
revoke all on public.reseller_stock_summary from public,anon;grant select on public.reseller_stock_summary to authenticated;

create function public.correct_reseller_stock(b uuid,l uuid,p uuid,v uuid,new_count integer,note text,request uuid) returns void language plpgsql security definer set search_path='' as $$
declare old_count bigint;
begin
 if not public.has_shop_permission(b,'products') then raise exception 'Stock access required.';end if;
 if new_count<0 or length(trim(coalesce(note,'')))=0 then raise exception 'Enter a non-negative count and a reason.';end if;
 if not exists(select 1 from public.source_products where id=p and business_id=b) or not exists(select 1 from public.locations where id=l and business_id=b) then raise exception 'Product or location does not belong to this shop.';end if;
 if v is not null and not exists(select 1 from public.source_product_options where id=v and source_product_id=p) then raise exception 'Variant does not belong to this product.';end if;
 if v is null and exists(select 1 from public.source_product_options where source_product_id=p) then raise exception 'Choose the exact variant.';end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text,0));
 if exists(select 1 from public.reseller_stock_moves where event_key='count:'||request) then return;end if;
 old_count:=public.reseller_stock_balance(b,l,p,v);
 if old_count<>new_count then insert into public.reseller_stock_moves(event_key,business_id,location_id,source_product_id,source_product_option_id,pieces,reason) values('count:'||request,b,l,p,v,new_count-old_count,'Stock count: '||trim(note));end if;
end $$;
revoke all on function public.correct_reseller_stock(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.correct_reseller_stock(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
