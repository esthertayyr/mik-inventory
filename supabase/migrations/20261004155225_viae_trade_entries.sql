-- Separate direct sales and supplier purchases. Preorder payments remain in their existing ledger.
create table public.reseller_trade_entries (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 business_id uuid not null references public.businesses(id),
 location_id uuid not null references public.locations(id),
 kind text not null check (kind in ('sale','purchase')),
 source_product_id uuid not null references public.source_products(id),
 source_product_option_id uuid references public.source_product_options(id),
 product_name text not null,
 variant_name text not null default '',
 quantity integer not null check(quantity > 0),
 entry_date date not null,
 payment_date date,
 payment_method text not null check(payment_method in ('cash','gcash','bank','other')),
 amount_php numeric(14,2) not null check(amount_php > 0),
 cost_sgd numeric(14,2),
 exchange_rate numeric(12,4),
 status text not null,
 received_quantity integer not null default 0 check(received_quantity >= 0 and received_quantity <= quantity),
 needs_repacking boolean not null default false,
 pack_size integer not null default 1 check(pack_size > 0),
 packed_quantity integer not null default 0 check(packed_quantity >= 0 and packed_quantity <= received_quantity),
 notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check ((kind='sale' and status in ('completed','cancelled') and payment_date is not null and cost_sgd is null)
  or (kind='purchase' and status in ('ordered','received','packed','cancelled') and cost_sgd > 0 and exchange_rate > 0)),
 check (status <> 'packed' or (received_quantity = quantity and packed_quantity = received_quantity)),
 check (status <> 'received' or received_quantity = quantity)
);
create index reseller_trade_business_date on public.reseller_trade_entries(business_id, entry_date desc);
create index reseller_trade_product on public.reseller_trade_entries(source_product_id);
create index reseller_trade_variant on public.reseller_trade_entries(source_product_option_id);
create index reseller_trade_location on public.reseller_trade_entries(location_id);
alter table public.reseller_trade_entries enable row level security;
revoke all on public.reseller_trade_entries from anon, public;
grant select,insert,update on public.reseller_trade_entries to authenticated;
create policy trade_read on public.reseller_trade_entries for select to authenticated
using (public.is_platform_admin() or public.has_shop_permission(business_id,'reports') or public.has_shop_permission(business_id,case when kind='sale' then 'sell' else 'products' end));
create policy trade_add on public.reseller_trade_entries for insert to authenticated
with check (created_by=(select auth.uid()) and public.has_shop_permission(business_id,case when kind='sale' then 'sell' else 'products' end));
create policy trade_update on public.reseller_trade_entries for update to authenticated
using (public.has_shop_permission(business_id,case when kind='sale' then 'sell' else 'products' end))
with check (public.has_shop_permission(business_id,case when kind='sale' then 'sell' else 'products' end));
create function public.validate_reseller_trade_entry() returns trigger language plpgsql set search_path='' as $$
declare p public.source_products%rowtype; option_name text;
begin
 if new.kind='purchase' and (new.cost_sgd is null or new.exchange_rate is null) then raise exception 'Buying cost and exchange rate are required.'; end if;
 if tg_op='UPDATE' and (new.business_id,new.location_id,new.kind,new.source_product_id,new.source_product_option_id,new.quantity,new.entry_date,new.amount_php,new.cost_sgd,new.exchange_rate,new.created_by,new.request_id)
 is distinct from (old.business_id,old.location_id,old.kind,old.source_product_id,old.source_product_option_id,old.quantity,old.entry_date,old.amount_php,old.cost_sgd,old.exchange_rate,old.created_by,old.request_id)
 then raise exception 'Cancel the old entry and create a new one to correct amounts or products.'; end if;
 select * into p from public.source_products where id=new.source_product_id and business_id=new.business_id;
 if not found then raise exception 'Product does not belong to this shop.'; end if;
 if tg_op='INSERT' and p.status<>'active' then raise exception 'Choose an official product.'; end if;
 if not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then raise exception 'Location does not belong to this shop.'; end if;
 if new.source_product_option_id is not null then
  select option_value into option_name from public.source_product_options where id=new.source_product_option_id and source_product_id=p.id;
  if not found then raise exception 'Choose a variant belonging to this product.'; end if;
 elsif tg_op='INSERT' and exists(select 1 from public.source_product_options where source_product_id=p.id) then raise exception 'Choose the exact variant.';
 end if;
 if tg_op='INSERT' then new.product_name:=p.name; new.variant_name:=coalesce(option_name,'');
 elsif old.status='cancelled' and new is distinct from old then raise exception 'Cancelled entries cannot be changed.';
 end if;
 if new.kind='purchase' and abs(new.amount_php-round(new.cost_sgd*new.exchange_rate,2))>0.01 then raise exception 'Purchase conversion does not match the SGD cost and exchange rate.'; end if;
 return new;
end $$;
create trigger validate_reseller_trade before insert or update on public.reseller_trade_entries for each row execute function public.validate_reseller_trade_entry();
revoke all on function public.validate_reseller_trade_entry() from public,anon,authenticated;

-- Publishing is a final step, after variants and photos have been saved.
create function public.validate_official_source_product() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='active' then
  if coalesce(new.tax_percent,0)<=0 then raise exception 'Tax is required for an official product.'; end if;
  if length(trim(coalesce(new.english_description,'')))=0 or length(trim(coalesce(new.lead_time_text,'')))=0 then raise exception 'Add product details and waiting time before making it official.'; end if;
  if not exists(select 1 from public.source_product_images where source_product_id=new.id) then raise exception 'Add a photo before making it official.'; end if;
  if exists(select 1 from public.source_product_options where source_product_id=new.id and coalesce(selling_price_php,new.selling_price_php,0)<=0)
    or (not exists(select 1 from public.source_product_options where source_product_id=new.id) and coalesce(new.selling_price_php,0)<=0)
  then raise exception 'Every official product variant needs a customer price greater than zero.'; end if;
 end if;return new;
end $$;
create trigger official_source_product before insert or update on public.source_products for each row execute function public.validate_official_source_product();
revoke all on function public.validate_official_source_product() from public,anon,authenticated;

create function public.validate_official_package_item() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.source_products p where p.id=new.source_product_id and p.business_id=new.business_id and p.status='active') then raise exception 'Packages can use official products from this shop only.'; end if;
 if not exists(select 1 from public.reseller_packages p where p.id=new.package_id and p.business_id=new.business_id) then raise exception 'Package does not belong to this shop.'; end if;
 if new.source_product_option_id is not null and not exists(select 1 from public.source_product_options o where o.id=new.source_product_option_id and o.source_product_id=new.source_product_id) then raise exception 'Choose a variant belonging to this product.'; end if;
 if new.source_product_option_id is null and exists(select 1 from public.source_product_options where source_product_id=new.source_product_id) then raise exception 'Choose the exact variant for this package.'; end if;
 return new;
end $$;
create trigger official_package_item before insert or update on public.reseller_package_items for each row execute function public.validate_official_package_item();
revoke all on function public.validate_official_package_item() from public,anon,authenticated;
