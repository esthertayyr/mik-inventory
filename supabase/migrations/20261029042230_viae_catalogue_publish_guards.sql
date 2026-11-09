alter table public.viae_design_catalogue drop constraint viae_publish_ready;
alter table public.viae_design_catalogue add constraint viae_publish_ready check(website_status<>'published' or (
 source_present and preview_url is not null and preview_url ~ '^https://' and (digital_enabled or printed_enabled)
 and (not digital_enabled or digital_price_php is not null)
 and (not printed_enabled or (printed_price_php is not null and preparation_days is not null))
));
do $$declare d text;begin
 select pg_get_functiondef('public.import_viae_design_catalogue(jsonb)'::regprocedure) into d;
 d:=replace(d,'if jsonb_typeof(p_items)','if p_items is null or jsonb_typeof(p_items)');execute d;
end$$;
