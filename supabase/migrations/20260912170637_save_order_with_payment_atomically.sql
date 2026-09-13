-- One authenticated, RLS-checked transaction for order details, money received,
-- and the first print-queue job. A client retry uses the same order UUID.
create or replace function public.save_order_with_payment(
  p_order_id uuid,
  p_is_new boolean,
  p_business_id uuid,
  p_location_id uuid,
  p_order jsonb,
  p_payment_date date default null,
  p_payment_method text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.external_orders%rowtype;
  v_previous_paid numeric(12,2) := 0;
  v_paid numeric(12,2) := (p_order->>'amount_paid')::numeric;
  v_total numeric(12,2) := (p_order->>'total_price')::numeric;
  v_delta numeric(12,2);
  v_status text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  if p_order_id is null or p_business_id is null or p_location_id is null then raise exception 'Order and shop are required'; end if;
  if not exists (select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id)
     or not (public.can_access_location(p_location_id) or public.is_platform_admin()) then
    raise exception 'Shop access required';
  end if;
  if nullif(trim(p_order->>'title'),'') is null or v_total is null or v_total <= 0
     or v_paid is null or v_paid < 0 or v_paid > v_total then
    raise exception 'Enter an order name and valid total and paid amounts';
  end if;
  if nullif(p_order->>'image_url','') is null then raise exception 'Order photo required'; end if;
  if (p_order->>'quantity')::integer < 1 then raise exception 'Quantity must be at least one'; end if;
  if v_paid > 0 and nullif(trim(p_order->>'payment_channel'),'') is null then
    raise exception 'Payment method required';
  end if;

  if p_is_new then
    select * into v_order from public.external_orders where id=p_order_id for update;
    if found then
      if v_order.business_id<>p_business_id or v_order.location_id<>p_location_id then raise exception 'Order ID belongs to another shop'; end if;
      -- Previous request committed; never count its payment twice.
      return p_order_id;
    end if;
    v_status := coalesce(p_order->>'status','new');
    if v_status='completed' and v_paid<v_total then raise exception 'Completed orders must be paid in full'; end if;
    insert into public.external_orders (
      id,business_id,location_id,title,image_url,customer_name,customer_contact,
      source,quantity,order_date,target_date,total_price,amount_paid,payment_status,
      payment_channel,payment_reference,notes,status,created_by,fulfilment_method,
      fulfilled_at,is_past_order
    ) values (
      p_order_id,p_business_id,p_location_id,trim(p_order->>'title'),p_order->>'image_url',
      nullif(p_order->>'customer_name',''),nullif(p_order->>'customer_contact',''),
      coalesce(nullif(p_order->>'source',''),'Other'),(p_order->>'quantity')::integer,
      (p_order->>'order_date')::date,nullif(p_order->>'target_date','')::date,
      v_total,v_paid,case when v_paid=0 then 'unpaid' when v_paid=v_total then 'paid' else 'partial' end,
      nullif(p_order->>'payment_channel',''),nullif(p_order->>'payment_reference',''),
      nullif(p_order->>'notes',''),v_status,(select auth.uid()),
      coalesce(p_order->>'fulfilment_method','collection'),
      nullif(p_order->>'fulfilled_at','')::timestamptz,
      coalesce((p_order->>'is_past_order')::boolean,false)
    ) returning * into v_order;
  else
    select * into v_order from public.external_orders
      where id=p_order_id and business_id=p_business_id and location_id=p_location_id for update;
    if not found then raise exception 'Order not found in this shop'; end if;
    v_previous_paid := v_order.amount_paid;
    if v_paid < v_previous_paid then raise exception 'Recorded payments cannot be reduced'; end if;
    v_status := coalesce(p_order->>'status',v_order.status);
    if v_status='completed' and v_paid<v_total then raise exception 'Completed orders must be paid in full'; end if;
    update public.external_orders set
      title=trim(p_order->>'title'),image_url=p_order->>'image_url',
      customer_name=nullif(p_order->>'customer_name',''),customer_contact=nullif(p_order->>'customer_contact',''),
      source=coalesce(nullif(p_order->>'source',''),'Other'),quantity=(p_order->>'quantity')::integer,
      order_date=(p_order->>'order_date')::date,target_date=nullif(p_order->>'target_date','')::date,
      total_price=v_total,amount_paid=v_paid,
      payment_status=case when v_paid=0 then 'unpaid' when v_paid=v_total then 'paid' else 'partial' end,
      payment_channel=nullif(p_order->>'payment_channel',''),payment_reference=nullif(p_order->>'payment_reference',''),
      notes=nullif(p_order->>'notes',''),status=v_status,updated_by=(select auth.uid()),
      fulfilment_method=coalesce(p_order->>'fulfilment_method','collection'),
      fulfilled_at=case when p_order ? 'fulfilled_at' then nullif(p_order->>'fulfilled_at','')::timestamptz else v_order.fulfilled_at end,
      is_past_order=coalesce((p_order->>'is_past_order')::boolean,false)
    where id=p_order_id returning * into v_order;
  end if;

  v_delta := v_paid-v_previous_paid;
  if v_delta>0 then
    if p_payment_date is null or p_payment_method not in ('cash','gcash','bank','online','other') then
      raise exception 'Payment date and method are required';
    end if;
    insert into public.order_payments (
      business_id,location_id,order_id,payment_date,amount,payment_method,
      payment_reference,payment_kind,created_by
    ) values (
      p_business_id,p_location_id,p_order_id,p_payment_date,v_delta,p_payment_method,
      nullif(p_order->>'payment_reference',''),
      case when v_paid=v_total then 'final' when v_previous_paid=0 then 'downpayment' else 'additional' end,
      (select auth.uid())
    );
  end if;

  if v_status not in ('completed','cancelled') and v_paid>=v_total*0.5
     and not exists(select 1 from public.print_jobs where external_order_id=p_order_id) then
    insert into public.print_jobs (
      business_id,location_id,external_order_id,title,quantity,needed_date,status,created_by
    ) values (
      p_business_id,p_location_id,p_order_id,v_order.title,v_order.quantity,v_order.target_date,'to_print',(select auth.uid())
    );
  end if;
  return p_order_id;
end;
$$;

revoke all on function public.save_order_with_payment(uuid,boolean,uuid,uuid,jsonb,date,text) from public,anon;
grant execute on function public.save_order_with_payment(uuid,boolean,uuid,uuid,jsonb,date,text) to authenticated;
