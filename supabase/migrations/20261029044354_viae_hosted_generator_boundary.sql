alter table public.viae_design_catalogue add constraint generator_is_hosted check(category<>'Generator' or (not digital_enabled and not printed_enabled));
alter table public.viae_design_catalogue drop constraint viae_publish_ready;
alter table public.viae_design_catalogue add constraint viae_publish_ready check(website_status<>'published' or (
 source_present and preview_url is not null and preview_url ~ '^https://' and (category='Generator' or digital_enabled or printed_enabled)
 and (not digital_enabled or digital_price_php is not null)
 and (not printed_enabled or (printed_price_php is not null and preparation_days is not null))
));
