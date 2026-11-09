alter table public.viae_design_catalogue add column catalogue_origin text not null default 'catalogue' check(catalogue_origin in('catalogue','manual','internal')),
 add column internal_only boolean not null default false,
 add column reference_price_php numeric check(reference_price_php>0);
alter table public.viae_design_catalogue add constraint internal_items_never_published check(not internal_only or website_status<>'published');
do $$declare d text;begin
 select pg_get_functiondef('public.import_viae_design_catalogue(jsonb)'::regprocedure) into d;
 d:=replace(d,'where business_id=b and catalogue_code not in','where business_id=b and catalogue_origin=''catalogue'' and catalogue_code not in');execute d;
end$$;
alter table public.reseller_preorders add column sale_date date;
update public.reseller_preorders set sale_date=(created_at at time zone 'Asia/Manila')::date;
alter table public.reseller_preorders alter column sale_date set default ((now() at time zone 'Asia/Manila')::date),alter column sale_date set not null;
alter table public.reseller_preorders add constraint sale_date_not_future check(sale_date<=(now() at time zone 'Asia/Manila')::date);
alter table public.reseller_preorders add column catalogue_unit_price_php numeric check(catalogue_unit_price_php>=0),
 add column agreed_unit_price_php numeric check(agreed_unit_price_php>0);
-- A custom service may be a digital file or a printed item.
do $$declare n text;begin select conname into n from pg_constraint where conrelid='public.reseller_preorders'::regclass and pg_get_constraintdef(oid) like '%purchase_format%ANY%';if n is not null then execute format('alter table public.reseller_preorders drop constraint %I',n);end if;end$$;
alter table public.reseller_preorders add constraint design_purchase_format check(purchase_format in('digital','printed','generator','custom','custom_digital'));
do $$declare d text;begin
 select pg_get_functiondef('viae_private.guard_design_order()'::regprocedure) into d;
 d:=replace(d,'new.purchase_format in (''digital'',''generator'')','new.purchase_format in (''digital'',''generator'',''custom_digital'')');
 d:=replace(d,'if new.purchase_format<>''custom'' then','if new.purchase_format not in(''custom'',''custom_digital'') then');
 d:=replace(d,'if tg_op=''INSERT'' then',E'if tg_op=''INSERT'' then\n  new.agreed_unit_price_php:=round(new.total_price_php/new.quantity,4);\n  if new.catalogue_design_id is not null then select * into d from public.viae_design_catalogue where id=new.catalogue_design_id and business_id=new.business_id;new.catalogue_unit_price_php:=case when new.purchase_format=''printed'' then d.printed_price_php else d.digital_price_php end;end if;');
 d:=replace(d,'new.design_configuration,new.product_name)','new.design_configuration,new.product_name,new.sale_date,new.agreed_unit_price_php,new.catalogue_unit_price_php)');
 d:=replace(d,'old.design_configuration,old.product_name)','old.design_configuration,old.product_name,old.sale_date,old.agreed_unit_price_php,old.catalogue_unit_price_php)');
 execute d;
end$$;
create function viae_private.guard_viae_payment_history() returns trigger language plpgsql set search_path='' as $$
declare o public.reseller_preorders;begin
 select * into o from public.reseller_preorders where id=new.preorder_id;
 if o.purchase_format is not null and new.payment_date<o.sale_date then raise exception 'Payment date cannot be before the recorded sale date.';end if;
 return new;
end$$;
revoke all on function viae_private.guard_viae_payment_history() from public,anon,authenticated;
create trigger aa_viae_payment_date before insert on public.reseller_preorder_payments for each row execute function viae_private.guard_viae_payment_history();
