alter table public.reseller_preorders add column catalogue_design_id uuid references public.viae_design_catalogue(id),
 add column purchase_format text check(purchase_format in ('digital','printed','generator','custom')),
 add column design_configuration jsonb not null default '{}'::jsonb,
 add column file_delivery_reference text;
alter table public.reseller_preorders add constraint viae_design_order_tenant check(purchase_format is null or business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf');

create function viae_private.guard_design_order() returns trigger language plpgsql set search_path='' as $$
declare paid numeric; d public.viae_design_catalogue; allowed boolean;
begin
 if tg_op='UPDATE' and (new.purchase_format,new.catalogue_design_id) is distinct from (old.purchase_format,old.catalogue_design_id) then raise exception 'Order format and design are fixed. Create a new order instead.';end if;
 if new.purchase_format is null then return new;end if;
 if not public.has_shop_permission(new.business_id,'orders') then raise exception 'Order access required.';end if;
 if not exists(select 1 from public.locations where id=new.location_id and business_id=new.business_id) then raise exception 'Location does not belong to VIAE.';end if;
 if new.source_product_id is not null or new.reseller_package_id is not null or new.source_product_option_id is not null then raise exception 'Catalogue orders do not use supplier products.';end if;
 if new.deposit_required_php<>new.total_price_php or not new.delivery_fee_confirmed then raise exception 'Catalogue orders require full payment and a confirmed shipping charge.';end if;
 if new.purchase_format in ('digital','generator') and (new.delivery_fee_php<>0 or nullif(trim(new.delivery_address),'') is not null) then raise exception 'Digital files have no shipping.';end if;
 if new.purchase_format in ('printed','custom') and nullif(trim(new.delivery_address),'') is null then raise exception 'Enter the shipping address for a printed item.';end if;
 if tg_op='INSERT' then
  if new.fulfilment_status<>'awaiting_deposit' then raise exception 'New orders must await full payment.';end if;
  if new.purchase_format<>'custom' then
   select * into d from public.viae_design_catalogue where id=new.catalogue_design_id and business_id=new.business_id and source_present and website_status<>'archived';
   if not found then raise exception 'Choose an available catalogue design.';end if;
   if new.purchase_format='digital' and not d.digital_enabled or new.purchase_format='printed' and not d.printed_enabled or new.purchase_format='generator' and d.category<>'Generator' then raise exception 'This purchase format is not enabled.';end if;
  end if;
  return new;
 end if;
 if (new.business_id,new.location_id,new.quantity,new.total_price_php,new.deposit_required_php,new.delivery_fee_php,new.design_configuration,new.product_name) is distinct from (old.business_id,old.location_id,old.quantity,old.total_price_php,old.deposit_required_php,old.delivery_fee_php,old.design_configuration,old.product_name) then raise exception 'Order contents and quoted price are fixed. Cancel and recreate to change them.';end if;
 if old.fulfilment_status in ('cancelled','delivered') and new is distinct from old then raise exception 'Completed and cancelled orders stay in history.';end if;
 if new.fulfilment_status=old.fulfilment_status then return new;end if;
 if new.fulfilment_status='cancelled' then
  if old.fulfilment_status='shipped' then raise exception 'Handle a shipped order as a return.';end if;return new;
 end if;
 select coalesce(sum(amount_php),0) into paid from public.reseller_preorder_payments where preorder_id=new.id;
 if paid<new.total_price_php+new.delivery_fee_php then raise exception 'Confirm full payment before file delivery or printing.';end if;
 if new.purchase_format in ('digital','generator') then
  allowed:=(old.fulfilment_status='awaiting_deposit' and new.fulfilment_status='confirmed') or (old.fulfilment_status='confirmed' and new.fulfilment_status='delivered' and nullif(trim(new.file_delivery_reference),'') is not null);
 else
  allowed:=(old.fulfilment_status='awaiting_deposit' and new.fulfilment_status='confirmed') or (old.fulfilment_status='confirmed' and new.fulfilment_status='ordered') or (old.fulfilment_status='ordered' and new.fulfilment_status='ready_to_ship') or (old.fulfilment_status='ready_to_ship' and new.fulfilment_status='shipped' and nullif(trim(new.courier),'') is not null) or (old.fulfilment_status='shipped' and new.fulfilment_status='delivered');
 end if;
 if not allowed then raise exception 'Use the next action. Digital delivery requires its delivery reference; printed items must pass through printing and shipping.';end if;
 return new;
end$$;
revoke all on function viae_private.guard_design_order() from public,anon,authenticated;
create trigger aaa_design_order before insert or update on public.reseller_preorders for each row execute function viae_private.guard_design_order();

-- Existing financial records and reports remain the ledger. Catalogue fulfilment
-- bypasses supplier inventory only after the separate guard has validated it.
do $$declare d text; f text;begin
 foreach f in array array['viae_private.guard_order_flow()','public.snapshot_reseller_order_stock()','public.fulfil_reseller_order_stock()'] loop
  select pg_get_functiondef(f::regprocedure) into d;
  d:=replace(d,E'begin\n',E'begin\n if new.purchase_format is not null then return new;end if;\n');execute d;
 end loop;
end$$;
create or replace function public.advance_reseller_payment_status() returns trigger language plpgsql set search_path='' as $$
declare parent public.reseller_preorders; received numeric;
begin
 select * into parent from public.reseller_preorders where id=new.preorder_id;
 select coalesce(sum(amount_php),0) into received from public.reseller_preorder_payments where preorder_id=parent.id;
 if parent.purchase_format is not null then
  if parent.fulfilment_status='awaiting_deposit' and received>=parent.total_price_php+parent.delivery_fee_php then update public.reseller_preorders set fulfilment_status='confirmed',updated_at=now() where id=parent.id;end if;
  return new;
 end if;
 if parent.fulfilment_status='awaiting_deposit' and received>=parent.deposit_required_php then update public.reseller_preorders set fulfilment_status='confirmed',updated_at=now() where id=parent.id;
 elsif parent.fulfilment_status='arrived' and parent.delivery_fee_confirmed and received>=parent.total_price_php+parent.delivery_fee_php then update public.reseller_preorders set fulfilment_status='ready_to_ship',updated_at=now() where id=parent.id;end if;
 return new;
end$$;
