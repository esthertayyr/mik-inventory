alter table public.viae_design_catalogue drop constraint generator_is_hosted;
alter table public.viae_design_catalogue add constraint generator_is_hosted check(category<>'Generator' or (not digital_enabled and not printed_enabled) or (catalogue_code='G001' and not printed_enabled));
update public.viae_design_catalogue set category='Generator',updated_at=now() where category in('Digital tools','Digital Tools','Generators') and business_id in(select id from public.businesses where slug='astera');
