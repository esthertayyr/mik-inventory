do $$declare d text;begin
 select pg_get_functiondef('viae_private.activate_paid_licence(uuid)'::regprocedure) into d;
 d:=replace(d,'if paid<o.total_price_php+o.delivery_fee_php then return;end if;',E'if paid<o.total_price_php+o.delivery_fee_php then return;end if;\n if exists(select 1 from public.viae_customer_entitlements where order_id=o.id and status=''revoked'') then return;end if;');
 d:=replace(d,E'granted_at=now();\nend',E'granted_at=now();\n if a.licence_scope=''all_generators'' and o.fulfilment_status=''confirmed'' then update public.reseller_preorders set fulfilment_status=''delivered'',file_delivery_reference=''Commercial licence activated for account'',delivered_at=(now() at time zone ''Asia/Manila'')::date,updated_at=now() where id=o.id;end if;\nend');
 execute d;
end$$;
