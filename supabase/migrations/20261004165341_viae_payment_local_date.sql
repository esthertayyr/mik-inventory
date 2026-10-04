create or replace function public.validate_reseller_payment() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.reseller_preorders; already numeric; deposits numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,0));
 select * into parent from public.reseller_preorders where id=new.preorder_id for update;
 if parent.id is null or parent.business_id<>new.business_id or parent.location_id<>new.location_id then raise exception 'Choose an order in this shop.';end if;
 if not public.has_shop_permission(new.business_id,case when parent.direct_sale then 'sell' else 'orders' end) then raise exception 'Payment access required.';end if;
 if parent.fulfilment_status='cancelled' then raise exception 'Cannot record payment for a cancelled order.';end if;
 if new.payment_date is null or new.payment_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Choose a payment date no later than today.';end if;
 select coalesce(sum(amount_php),0),coalesce(sum(amount_php) filter(where payment_type='deposit'),0) into already,deposits from public.reseller_preorder_payments where preorder_id=new.preorder_id;
 if new.amount_php<=0 or new.amount_php+already>parent.total_price_php+parent.delivery_fee_php then raise exception 'Payment exceeds the remaining balance.';end if;
 if new.payment_type='deposit' and deposits+new.amount_php>parent.deposit_required_php then raise exception 'Deposit exceeds the required deposit. Choose final payment for the remaining amount.';end if;
 return new;
end $$;
revoke execute on function public.validate_reseller_payment() from public,anon,authenticated;
