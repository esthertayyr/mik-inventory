do $migration$
declare
  function_sql text;
  old_variant text := 'Generator File · Manual Delivery';
  new_variant text := 'Digital File';
begin
  select pg_get_functiondef('public.create_viae_catalogue_sale(uuid,uuid,date,jsonb,public.payment_method,text,boolean,text,numeric,text)'::regprocedure)
    into function_sql;

  if position(old_variant in function_sql)=0 then
    raise exception 'Could not find the expected generator variant label; migration stopped without changing the function.';
  end if;

  execute replace(function_sql,old_variant,new_variant);
end;
$migration$;

update public.sale_items si
set variant_name = 'Digital File'
from public.sales s
where s.id = si.sale_id
  and s.business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
  and si.variant_name = 'Generator File · Manual Delivery';
