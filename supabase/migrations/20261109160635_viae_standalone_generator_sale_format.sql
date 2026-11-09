do $migration$
declare
  function_sql text;
  old_format text := '(f=''printed'' and d.printed_enabled and d.category<>''Generator'')';
  new_format text := '(f=''printed'' and d.printed_enabled and d.category<>''Generator'') or (f=''generator'' and d.category=''Generator'' and d.catalogue_code in (''C104'',''C105'') and coalesce(d.reference_price_php,0)>0)';
  old_variant text := 'case when f in(''digital'',''custom_digital'') then ''Digital File'' else ''Printed by VIAE'' end';
  new_variant text := 'case when f=''generator'' then ''Generator File · Manual Delivery'' when f in(''digital'',''custom_digital'') then ''Digital File'' else ''Printed by VIAE'' end';
begin
  select pg_get_functiondef('public.create_viae_catalogue_sale(uuid,uuid,date,jsonb,public.payment_method,text,boolean,text,numeric,text)'::regprocedure)
  into function_sql;

  if position(old_format in function_sql)=0 or position(old_variant in function_sql)=0 then
    raise exception 'Could not find the expected sale format rules; migration stopped without changing the function.';
  end if;

  function_sql:=replace(function_sql,old_format,new_format);
  function_sql:=replace(function_sql,old_variant,new_variant);
  execute function_sql;
end;
$migration$;
