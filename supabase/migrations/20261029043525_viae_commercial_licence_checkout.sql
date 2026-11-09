alter table public.viae_order_accounts alter column accepted_at drop not null,alter column accepted_at drop default;
alter table public.viae_customer_entitlements add column revocation_reason text;

create function viae_private.activate_paid_licence(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.reseller_preorders; a public.viae_order_accounts; paid numeric;
begin
 select * into o from public.reseller_preorders where id=p_order;
 select * into a from public.viae_order_accounts where order_id=o.id;
 if a.order_id is null or a.accepted_at is null or a.licence_scope='personal' or o.fulfilment_status='cancelled' then return;end if;
 if o.purchase_format not in('digital','generator') then raise exception 'Commercial file licences require a digital purchase.';end if;
 select coalesce(sum(amount_php),0) into paid from public.reseller_preorder_payments where preorder_id=o.id;
 if paid<o.total_price_php+o.delivery_fee_php then return;end if;
 insert into public.viae_customer_entitlements(customer_id,licence_scope,catalogue_design_id,order_id)
 values(a.customer_id,a.licence_scope,case when a.licence_scope='catalogue_commercial' then o.catalogue_design_id end,o.id)
 on conflict(customer_id,licence_scope,coalesce(catalogue_design_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set status='active',revoked_at=null,revocation_reason=null,order_id=excluded.order_id,granted_at=now();
end$$;
revoke all on function viae_private.activate_paid_licence(uuid) from public,anon,authenticated;
create or replace function viae_private.grant_paid_licence() returns trigger language plpgsql security definer set search_path='' as $$
begin perform viae_private.activate_paid_licence(new.preorder_id);return new;end$$;

create function public.accept_viae_order_licence(p_order_id uuid,p_terms_version text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 update public.viae_order_accounts a set accepted_at=now() where order_id=p_order_id and customer_id=auth.uid() and terms_version=p_terms_version and exists(select 1 from public.reseller_preorders o where o.id=a.order_id and o.fulfilment_status<>'cancelled');
 if not found then raise exception 'Order or terms version does not match your account.';end if;
 perform viae_private.activate_paid_licence(p_order_id);
end$$;
revoke all on function public.accept_viae_order_licence(uuid,text) from public,anon;
grant execute on function public.accept_viae_order_licence(uuid,text) to authenticated;

create function public.my_viae_purchases() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (select o.id,o.product_name,o.purchase_format,o.quantity,o.total_price_php,o.delivery_fee_php,o.fulfilment_status,o.created_at,o.tracking_number,o.courier,a.licence_scope,a.terms_version,a.accepted_at,(select coalesce(sum(p.amount_php),0) from public.reseller_preorder_payments p where p.preorder_id=o.id) as paid_php from public.viae_order_accounts a join public.reseller_preorders o on o.id=a.order_id where a.customer_id=auth.uid() order by o.created_at desc limit 500)t),'[]'::jsonb);
end$$;
revoke all on function public.my_viae_purchases() from public,anon;
grant execute on function public.my_viae_purchases() to authenticated;

create function public.create_viae_commercial_licence_order(p_customer_id uuid,p_location_id uuid,p_promo_code text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare b constant uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf'; c public.viae_customer_accounts; s public.viae_commerce_settings; p public.viae_promo_codes; d uuid; amount numeric; discount numeric:=0; overall integer; personal integer; o uuid;
begin
 if auth.uid() is null or not(public.is_business_owner(b) or public.is_platform_admin()) then raise exception 'Only a VIAE owner can create a manual licence order.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text||':commercial',0));
 if exists(select 1 from public.viae_customer_entitlements where customer_id=p_customer_id and licence_scope='all_generators' and status='active') then raise exception 'This account already has the one-time all-generator commercial licence.';end if;
 if exists(select 1 from public.viae_order_accounts a join public.reseller_preorders r on r.id=a.order_id where a.customer_id=p_customer_id and a.licence_scope='all_generators' and r.fulfilment_status not in('cancelled','delivered')) then raise exception 'This account already has an open commercial licence order.';end if;
 select * into c from public.viae_customer_accounts where id=p_customer_id;if not found then raise exception 'Choose a registered customer account.';end if;
 select * into s from public.viae_commerce_settings where business_id=b;
 if s.generator_commercial_price_php is null or nullif(trim(s.commercial_terms_version),'') is null or s.commercial_terms_url is null then raise exception 'Set the commercial licence price and published licence terms first.';end if;
 amount:=s.generator_commercial_price_php;
 if nullif(trim(p_promo_code),'') is not null then
  select * into p from public.viae_promo_codes where code=upper(trim(p_promo_code)) and active for update;
  if not found or now()<p.starts_at or (p.ends_at is not null and now()>=p.ends_at) or not('generator_licence'=any(p.scopes)) or amount<p.minimum_spend_php then raise exception 'Promo does not apply.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
  select count(*),count(*) filter(where r.customer_id=p_customer_id) into overall,personal from public.viae_promo_redemptions r join public.reseller_preorders x on x.id=r.order_id where r.promo_id=p.id and x.fulfilment_status<>'cancelled';
  if (p.maximum_uses is not null and overall>=p.maximum_uses) or personal>=p.per_customer_limit then raise exception 'Promo usage limit reached.';end if;
  discount:=least(amount-0.01,coalesce(p.maximum_discount_php,amount),case when p.discount_type='percent' then round(amount*p.discount_value/100,2) else p.discount_value end);
 end if;
 select id into d from public.viae_design_catalogue where business_id=b and category='Generator' and source_present order by catalogue_code limit 1;
 if d is null then raise exception 'Sync a generator entry first.';end if;
 insert into public.reseller_preorders(business_id,location_id,catalogue_design_id,purchase_format,customer_name,customer_contact,product_name,quantity,total_price_php,deposit_required_php,delivery_fee_php,delivery_fee_confirmed,fulfilment_status,order_kind,design_configuration)
 values(b,p_location_id,d,'generator',coalesce(nullif(c.display_name,''),c.email),c.email,'VIAE Commercial Licence · All Generators',1,amount-discount,amount-discount,0,true,'awaiting_deposit','ready_stock',jsonb_build_object('purchase_kind','commercial_licence','scope','all_generators','original_price_php',amount,'discount_php',discount)) returning id into o;
 insert into public.viae_order_accounts(order_id,customer_id,licence_scope,terms_version)values(o,p_customer_id,'all_generators',s.commercial_terms_version);
 if p.id is not null then insert into public.viae_promo_redemptions(order_id,promo_id,customer_id,discount_php)values(o,p.id,p_customer_id,discount);end if;
 return o;
end$$;
revoke all on function public.create_viae_commercial_licence_order(uuid,uuid,text) from public,anon;
grant execute on function public.create_viae_commercial_licence_order(uuid,uuid,text) to authenticated;
-- Promo reservations are written by the owner checkout, never directly by customers.
grant insert on public.viae_promo_redemptions to authenticated;
create policy "owners reserve promo use" on public.viae_promo_redemptions for insert to authenticated with check((public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin()) and exists(select 1 from public.viae_order_accounts a where a.order_id=viae_promo_redemptions.order_id and a.customer_id=viae_promo_redemptions.customer_id));

create function public.revoke_viae_commercial_licence(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin()) then raise exception 'Owner access required.';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Record why the licence is revoked.';end if;
 update public.viae_customer_entitlements set status='revoked',revoked_at=now(),revocation_reason=left(trim(p_reason),1000) where id=p_id;
 if not found then raise exception 'Licence not found.';end if;
end$$;
revoke all on function public.revoke_viae_commercial_licence(uuid,text) from public,anon;
grant execute on function public.revoke_viae_commercial_licence(uuid,text) to authenticated;
