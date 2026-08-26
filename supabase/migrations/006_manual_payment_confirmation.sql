-- Manual payment confirmation keeps counter checkout simple while preserving
-- who confirmed receipt, when it was confirmed, and an optional provider reference.
alter table public.sales add column if not exists payment_confirmed_at timestamptz;
alter table public.sales add column if not exists payment_confirmed_by uuid references public.profiles(id);
alter table public.sales add column if not exists payment_reference text;

create or replace function public.create_confirmed_sale(
  p_location_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_payment_received boolean,
  p_payment_reference text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_sale_id uuid;
begin
  if p_payment_method='gcash' and not coalesce(p_payment_received,false) then
    raise exception 'Confirm that the GCash payment was received';
  end if;

  v_sale_id:=public.create_sale(p_location_id,p_items,p_payment_method,null,null);
  update public.sales
  set payment_confirmed_at=case when p_payment_received then now() else null end,
      payment_confirmed_by=case when p_payment_received then auth.uid() else null end,
      payment_reference=case when p_payment_method='gcash' then nullif(trim(p_payment_reference),'') else null end
  where id=v_sale_id;
  return v_sale_id;
end $$;

grant execute on function public.create_confirmed_sale(uuid,jsonb,public.payment_method,boolean,text) to authenticated;
