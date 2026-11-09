create table public.viae_customer_accounts(
 id uuid primary key references auth.users(id),display_name text not null default '',email text not null,
 created_at timestamptz not null default now()
);
create table public.viae_commerce_settings(
 business_id uuid primary key references public.businesses(id) check(business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf'),
 generator_commercial_price_php numeric check(generator_commercial_price_php>0),
 commercial_terms_version text,
 commercial_terms_url text,
 updated_at timestamptz not null default now()
);
insert into public.viae_commerce_settings(business_id)values('3fe4c82d-a659-406b-b290-32d8a49f2bdf');
create table public.viae_order_accounts(
 order_id uuid primary key references public.reseller_preorders(id),
 customer_id uuid not null references public.viae_customer_accounts(id),
 licence_scope text not null check(licence_scope in('personal','catalogue_commercial','all_generators')),
 terms_version text not null,accepted_at timestamptz not null default now()
);
create table public.viae_customer_entitlements(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.viae_customer_accounts(id),
 licence_scope text not null check(licence_scope in('catalogue_commercial','all_generators')),
 catalogue_design_id uuid references public.viae_design_catalogue(id),
 order_id uuid not null references public.reseller_preorders(id),
 status text not null default 'active' check(status in('active','revoked')),
 granted_at timestamptz not null default now(),revoked_at timestamptz,
 check((licence_scope='all_generators' and catalogue_design_id is null) or (licence_scope='catalogue_commercial' and catalogue_design_id is not null))
);
create unique index viae_one_entitlement_per_scope on public.viae_customer_entitlements(customer_id,licence_scope,coalesce(catalogue_design_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.viae_promo_codes(
 id uuid primary key default gen_random_uuid(),code text not null unique check(code=upper(trim(code)) and length(code) between 3 and 32),
 discount_type text not null check(discount_type in('percent','fixed')),
 discount_value numeric not null check(discount_value>0),
 minimum_spend_php numeric not null default 0 check(minimum_spend_php>=0),
 maximum_discount_php numeric check(maximum_discount_php>0),
 maximum_uses integer check(maximum_uses>0),
 per_customer_limit integer not null default 1 check(per_customer_limit>0),
 scopes text[] not null default array['digital','printed','generator_licence'],
 starts_at timestamptz not null default now(),ends_at timestamptz,active boolean not null default false,
 created_at timestamptz not null default now(),
 check(discount_type<>'percent' or discount_value<=100),check(ends_at is null or ends_at>starts_at)
);
-- Claims are reserved against a real order. Only trusted checkout code will write them.
create table public.viae_promo_redemptions(
 order_id uuid primary key references public.reseller_preorders(id),promo_id uuid not null references public.viae_promo_codes(id),
 customer_id uuid not null references public.viae_customer_accounts(id),discount_php numeric not null check(discount_php>=0),created_at timestamptz not null default now()
);
do $$declare t text;begin foreach t in array array['viae_customer_accounts','viae_commerce_settings','viae_order_accounts','viae_customer_entitlements','viae_promo_codes','viae_promo_redemptions'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);end loop;end$$;
grant select on public.viae_customer_accounts,public.viae_order_accounts,public.viae_customer_entitlements,public.viae_commerce_settings,public.viae_promo_codes,public.viae_promo_redemptions to authenticated;
grant insert,update on public.viae_commerce_settings,public.viae_promo_codes to authenticated;
grant insert on public.viae_order_accounts to authenticated;
create policy "customer reads own account" on public.viae_customer_accounts for select to authenticated using(id=auth.uid() or public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "customer reads own purchases" on public.viae_order_accounts for select to authenticated using(customer_id=auth.uid() or public.is_business_member('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "owners link customer orders" on public.viae_order_accounts for insert to authenticated with check((public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin()) and exists(select 1 from public.reseller_preorders o where o.id=order_id and o.business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf'));
create policy "customer reads own entitlements" on public.viae_customer_entitlements for select to authenticated using(customer_id=auth.uid() or public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "owners manage commerce settings" on public.viae_commerce_settings for all to authenticated using(public.is_business_owner(business_id) or public.is_platform_admin()) with check(public.is_business_owner(business_id) or public.is_platform_admin());
create policy "owners manage promo codes" on public.viae_promo_codes for all to authenticated using(public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin()) with check(public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "customer reads own promo uses" on public.viae_promo_redemptions for select to authenticated using(customer_id=auth.uid() or public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());

create function public.register_viae_customer(p_display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e text;begin
 if u is null then raise exception 'Sign in to create your VIAE account.';end if;
 select email into e from auth.users where id=u and email_confirmed_at is not null;
 if e is null then raise exception 'Verify your email before activating your customer account.';end if;
 insert into public.viae_customer_accounts(id,email,display_name)values(u,e,left(trim(coalesce(p_display_name,'')),120)) on conflict(id) do update set display_name=excluded.display_name,email=excluded.email;
 return u;
end$$;
revoke all on function public.register_viae_customer(text) from public,anon;
grant execute on function public.register_viae_customer(text) to authenticated;

create function public.viae_generator_entitlement() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('signed_in',auth.uid() is not null,'commercial',exists(select 1 from public.viae_customer_entitlements where customer_id=auth.uid() and licence_scope='all_generators' and status='active'),'scope','all_generators','personal_export','marked');
$$;
revoke all on function public.viae_generator_entitlement() from public,anon;
grant execute on function public.viae_generator_entitlement() to authenticated;

create function viae_private.grant_paid_licence() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.reseller_preorders; a public.viae_order_accounts; paid numeric;
begin
 select * into o from public.reseller_preorders where id=new.preorder_id;
 select * into a from public.viae_order_accounts where order_id=o.id;
 if a.order_id is null or a.licence_scope='personal' or o.fulfilment_status='cancelled' then return new;end if;
 if o.purchase_format not in('digital','generator') then raise exception 'Commercial file licences must link to a digital purchase.';end if;
 select coalesce(sum(amount_php),0) into paid from public.reseller_preorder_payments where preorder_id=o.id;
 if paid<o.total_price_php+o.delivery_fee_php then return new;end if;
 insert into public.viae_customer_entitlements(customer_id,licence_scope,catalogue_design_id,order_id)
 values(a.customer_id,a.licence_scope,case when a.licence_scope='catalogue_commercial' then o.catalogue_design_id end,o.id)
 on conflict(customer_id,licence_scope,coalesce(catalogue_design_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set status='active',revoked_at=null,order_id=excluded.order_id,granted_at=now();
 return new;
end$$;
revoke all on function viae_private.grant_paid_licence() from public,anon,authenticated;
create trigger zz_grant_paid_licence after insert on public.reseller_preorder_payments for each row execute function viae_private.grant_paid_licence();

create function public.quote_viae_promo(p_code text,p_subtotal numeric,p_scope text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.viae_promo_codes; amount numeric; uses integer; personal_uses integer;
begin
 if auth.uid() is null or not exists(select 1 from public.viae_customer_accounts where id=auth.uid()) then raise exception 'Sign in to your customer account.';end if;
 if p_subtotal is null or p_subtotal<=0 or p_subtotal>10000000 then raise exception 'Invalid subtotal.';end if;
 select * into p from public.viae_promo_codes where code=upper(trim(p_code)) and active and now()>=starts_at and (ends_at is null or now()<ends_at);
 if not found or not(p_scope=any(p.scopes)) or p_subtotal<p.minimum_spend_php then raise exception 'This promo does not apply to this purchase.';end if;
 select count(*),count(*) filter(where r.customer_id=auth.uid()) into uses,personal_uses from public.viae_promo_redemptions r join public.reseller_preorders o on o.id=r.order_id where r.promo_id=p.id and o.fulfilment_status<>'cancelled';
 if (p.maximum_uses is not null and uses>=p.maximum_uses) or personal_uses>=p.per_customer_limit then raise exception 'This promo has reached its usage limit.';end if;
 amount:=case when p.discount_type='percent' then round(p_subtotal*p.discount_value/100,2) else p.discount_value end;
 amount:=least(amount,coalesce(p.maximum_discount_php,amount),greatest(0,p_subtotal-0.01));
 return jsonb_build_object('code',p.code,'discount_php',amount,'total_php',p_subtotal-amount,'quote_only',true);
end$$;
revoke all on function public.quote_viae_promo(text,numeric,text) from public,anon;
grant execute on function public.quote_viae_promo(text,numeric,text) to authenticated;
