alter table public.viae_design_catalogue drop constraint generator_is_hosted;
alter table public.viae_design_catalogue add constraint generator_is_hosted
check(category <> 'Generator' or (not printed_enabled and (not digital_enabled or catalogue_code in ('G001','C103'))));
