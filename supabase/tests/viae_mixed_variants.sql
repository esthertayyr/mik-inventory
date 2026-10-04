begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.business_memberships where business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and role='owner' limit 1),true);
set local role authenticated;
do $$
declare b uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf';l uuid;p uuid;v1 uuid;v4 uuid;o uuid;blocked boolean:=false;r uuid:=gen_random_uuid();
begin
 select id into l from public.locations where business_id=b limit 1;
 insert into public.source_products(business_id,location_id,name,english_description,selling_price_php,tax_percent) values(b,l,'__QA mixed shape test','Test',999,3) returning id into p;
 insert into public.source_product_options(source_product_id,option_type,option_value,source_price,selling_price_php,stock_units) values(p,'Shape','Shape 1',1,999,1) returning id into v1;
 insert into public.source_product_options(source_product_id,option_type,option_value,source_price,selling_price_php,stock_units) values(p,'Shape','Shape 4',1,999,1) returning id into v4;
 insert into public.source_product_images(source_product_id,image_url,storage_path,image_type) values(p,'https://ecommerce-ai-store.vercel.app/viae/dragon-story.png','test-only','product');
 update public.source_products set status='active' where id=p;
 o:=public.create_reseller_package_order(b,l,gen_random_uuid(),null,jsonb_build_array(jsonb_build_object('product_id',p,'option_id',v1,'quantity',30),jsonb_build_object('product_id',p,'option_id',v4,'quantity',20)),'Test buyer','','',1,10000,false,null,'cash','');
 insert into public.reseller_preorder_payments(request_id,preorder_id,business_id,location_id,payment_type,amount_php,payment_method,payment_date) values(r,o,b,l,'deposit',5000,'cash',current_date);
 if (select fulfilment_status from public.reseller_preorders where id=o)<>'confirmed' then raise exception 'Deposit did not advance order';end if;
 if (select reserved from public.reseller_stock_summary where source_product_option_id=v1)<>30 or (select reserved from public.reseller_stock_summary where source_product_option_id=v4)<>20 then raise exception 'Mixed shape reservations are incorrect';end if;
 if (select on_hand from public.reseller_stock_summary where source_product_option_id=v1)<>0 then raise exception 'Shortage changed physical stock';end if;
 begin
 insert into public.reseller_preorder_payments(request_id,preorder_id,business_id,location_id,payment_type,amount_php,payment_method,payment_date) values(r,o,b,l,'deposit',1,'cash',current_date);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Duplicate payment allowed';end if;
 blocked:=false;
 begin insert into public.reseller_preorder_payments(preorder_id,business_id,location_id,payment_type,amount_php,payment_method,payment_date) values(o,b,l,'final',6000,'cash',current_date);
 exception when others then if sqlerrm like 'Payment exceeds%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Overpayment allowed';end if;
 insert into public.reseller_preorder_payments(preorder_id,business_id,location_id,payment_type,amount_php,payment_method,payment_date) values(o,b,l,'final',5000,'cash',current_date);
 blocked:=false;
 begin update public.reseller_preorders set fulfilment_status='shipped',delivery_fee_confirmed=true where id=o;
 exception when others then if sqlerrm like 'Not enough%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Shipment allowed without stock';end if;
 perform public.correct_reseller_stock(b,l,p,v1,40,'Test count',gen_random_uuid());
 perform public.correct_reseller_stock(b,l,p,v4,25,'Test count',gen_random_uuid());
 update public.reseller_preorders set fulfilment_status='shipped',delivery_fee_confirmed=true where id=o;
 if (select on_hand from public.reseller_stock_summary where source_product_option_id=v1)<>10 or (select on_hand from public.reseller_stock_summary where source_product_option_id=v4)<>5 then raise exception 'Wrong shape deducted';end if;
end $$;
select 'PASS: mixed variants, shortage preorder, per-shape reservations, duplicate/overpayment guard, stock shipment gate, exact deductions' result;
rollback;
