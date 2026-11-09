-- Persist the format in the existing platform field, avoiding changes to physical-product pricing.
-- Digital files use exact PHP selling prices and manual delivery, without stock movements.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.validate_official_source_product()'::regprocedure) into definition;
 definition := replace(definition, 'if coalesce(new.tax_percent,0)<=0 then', 'if new.platform <> ''Digital / STL File'' and coalesce(new.tax_percent,0)<=0 then');
 execute definition;

 select pg_get_functiondef('public.post_reseller_trade_stock()'::regprocedure) into definition;
 definition := replace(definition, E'begin\n', E'begin\n if exists(select 1 from public.source_products where id=new.source_product_id and business_id=new.business_id and platform=''Digital / STL File'') then return new;end if;\n');
 execute definition;

 select pg_get_functiondef('public.validate_reseller_trade_entry()'::regprocedure) into definition;
 definition := replace(definition, 'if not found then raise exception ''Product does not belong to this shop.''; end if;', 'if not found then raise exception ''Product does not belong to this shop.''; end if; if p.platform=''Digital / STL File'' and new.kind=''purchase'' then raise exception ''Digital creations do not use supplier purchases or physical stock.'';end if;');
 execute definition;

 select pg_get_functiondef('viae_private.availability(uuid)'::regprocedure) into definition;
 definition := replace(definition, 'select case when exists', 'select case when exists(select 1 from public.source_products where id=p and platform=''Digital / STL File'') then ''in_stock'' when exists');
 execute definition;

 -- The existing website checkout assumes physical shipping. Route digital enquiries
 -- to manual fulfilment until the storefront has a dedicated digital checkout.
 select pg_get_functiondef('public.submit_viae_checkout(uuid,text,text,text,jsonb)'::regprocedure) into definition;
 definition := replace(definition, 'if not found then raise exception ''An item is no longer available. Refresh your cart.'';end if;', 'if not found then raise exception ''An item is no longer available. Refresh your cart.'';end if; if p.platform=''Digital / STL File'' then raise exception ''Please contact VIAE to purchase this digital file. Manual file delivery, no physical shipping.'';end if;');
 execute definition;
end $migration$;

create or replace function viae_private.validate_digital_creation()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (old.platform='Digital / STL File') is distinct from (new.platform='Digital / STL File') then
  raise exception 'Create a new product to change between digital and physical formats.';
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
create trigger aa_validate_digital_creation before insert or update on public.source_products
for each row execute function viae_private.validate_digital_creation();
