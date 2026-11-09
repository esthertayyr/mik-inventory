create or replace function viae_private.validate_digital_creation()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (old.platform='Digital / STL File') is distinct from (new.platform='Digital / STL File') then
  if old.platform='Digital / STL File'
   or exists(select 1 from public.source_product_options where source_product_id=old.id)
   or exists(select 1 from public.reseller_trade_entries where source_product_id=old.id)
   or exists(select 1 from public.reseller_stock_moves where source_product_id=old.id)
   or exists(select 1 from public.reseller_preorders where source_product_id=old.id)
   or exists(select 1 from public.reseller_package_items where source_product_id=old.id)
   or exists(select 1 from public.reseller_print_jobs where source_product_id=old.id)
  then raise exception 'Create a new product to change the format of a product with variants or activity.';end if;
 end if;
 if new.platform='Digital / STL File' then
  if new.selling_price_php is null or new.selling_price_php<=0 then raise exception 'Enter the fixed PHP selling price.';end if;
  new.tax_percent:=0;new.shipping_amount:=0;new.shipping_type:='free';
  new.source_price:=0;new.final_cost_sgd:=0;new.deposit_percent:=100;
  new.website_availability:='in_stock';
 end if;
 return new;
end $$;
revoke all on function viae_private.validate_digital_creation() from public,anon,authenticated;
